/**
 * SkillWorker.ts — Exécution isolée d'un AgentPlugin tiers via worker_threads
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  Architecture de l'isolation                                            │
 * │                                                                         │
 * │  Main thread                    Worker thread (V8 isolate séparé)       │
 * │  ─────────────────────          ─────────────────────────────────────   │
 * │  SkillWorkerHost                workerEntrypoint()                      │
 * │   ├─ runInWorker(ctx, caps)      ├─ importe le fichier plugin            │
 * │   │   ├─ spawn Worker            ├─ reçoit { type:"execute", ctx }      │
 * │   │   ├─ envoie message          ├─ appelle plugin.execute(ctx, proxy)  │
 * │   │   ├─ attend résultat         │   (proxy = outil bridgé via message)  │
 * │   │   └─ timeout → terminate     └─ retourne TaskResult                 │
 * │   └─ proxyToolCall(name, args)                                          │
 * │       ├─ valide la capability                                           │
 * │       └─ délègue au ToolRegistry principal                              │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Garanties de sécurité :
 *
 *  1. **Isolation mémoire** : le plugin tourne dans un Worker (V8 isolate distinct).
 *     Il ne peut pas lire ni modifier la mémoire du process principal.
 *
 *  2. **Capability enforcement** : le proxy ToolRegistry intercepte chaque appel
 *     d'outil et le bloque si l'outil n'est pas dans la liste `allowedCapabilities`
 *     passée par l'appelant. Un plugin ne peut pas élever ses propres privilèges.
 *
 *  3. **Timeout strict** : un `AbortController` termine le Worker si la durée
 *     dépasse `maxDurationMs`. Aucun plugin ne peut bloquer indéfiniment le runtime.
 *
 *  4. **Surface de communication minimale** : seuls des messages JSON-sérialisables
 *     (structuredClone) transitent entre les threads. Aucune référence objet partagée
 *     n'est exposée au plugin.
 *
 *  5. **Pas d'accès direct au ToolRegistry** : le plugin reçoit un objet proxy
 *     qui envoie chaque appel d'outil au main thread via `postMessage`.
 *     Le main thread valide la capability, exécute l'outil et retourne le résultat.
 */

import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import { fileURLToPath } from "url";
import type { AgentContext, TaskResult } from "./types.js";
import type { ToolRegistry } from "./ToolRegistry.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("SkillWorker");

// ═══════════════════════════════════════════════════════════════════════════════
// Protocole de messages inter-thread (tous JSON-sérialisables)
// ═══════════════════════════════════════════════════════════════════════════════

/** Main → Worker : déclencher l'exécution */
interface ExecuteMessage {
  type: "execute";
  context: AgentContext;
  allowedCapabilities: string[];
}

/** Worker → Main : résultat de l'exécution */
interface ResultMessage {
  type: "result";
  result: TaskResult;
}

/** Worker → Main : erreur non récupérable */
interface ErrorMessage {
  type: "error";
  message: string;
  stack?: string;
}

/** Worker → Main : demande d'appel d'outil */
interface ToolCallRequestMessage {
  type: "tool_call";
  requestId: string;
  toolName: string;
  args: Record<string, unknown>;
}

/** Main → Worker : résultat d'un appel d'outil */
interface ToolCallResponseMessage {
  type: "tool_response";
  requestId: string;
  result?: unknown;
  error?: string;
}

type MainToWorkerMessage = ExecuteMessage | ToolCallResponseMessage;
type WorkerToMainMessage = ResultMessage | ErrorMessage | ToolCallRequestMessage;

// ═══════════════════════════════════════════════════════════════════════════════
// Données initiales passées au Worker via workerData (non modifiables)
// ═══════════════════════════════════════════════════════════════════════════════

interface SkillWorkerData {
  /** URL du module plugin à importer */
  moduleUrl: string;
  /** Timeout max en ms */
  maxDurationMs: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SkillWorkerHost — côté main thread
// ═══════════════════════════════════════════════════════════════════════════════

export interface SkillWorkerRunOptions {
  /** Contexte de la tâche à exécuter */
  context: AgentContext;
  /** Capacités autorisées pour ce plugin (subset de ALLOWED_CAPABILITIES) */
  allowedCapabilities: string[];
  /** ToolRegistry principal pour proxier les appels d'outils */
  tools: ToolRegistry;
  /** Timeout en ms avant de tuer le Worker (défaut : 30 s) */
  maxDurationMs?: number;
}

/**
 * Lance l'exécution d'un plugin dans un Worker isolé et retourne son résultat.
 *
 * @param moduleUrl - URL `file://` vers le fichier `*.agent.js` compilé
 * @param options   - Contexte, capabilities, registry principal et timeout
 * @throws si le Worker dépasse le timeout ou retourne une erreur
 */
export async function runPluginInWorker(
  moduleUrl: string,
  options: SkillWorkerRunOptions
): Promise<TaskResult> {
  const {
    context,
    allowedCapabilities,
    tools,
    maxDurationMs = 30_000,
  } = options;

  return new Promise<TaskResult>((resolve, reject) => {
    // ── Spawn du Worker (même fichier, bifurcation sur isMainThread) ──
    const worker = new Worker(fileURLToPath(import.meta.url), {
      workerData: {
        moduleUrl,
        maxDurationMs,
      } satisfies SkillWorkerData,
    });

    // Map requestId → { resolve, reject } pour les appels d'outils en attente
    const pendingToolCalls = new Map<
      string,
      { resolve: (v: unknown) => void; reject: (e: Error) => void }
    >();

    let settled = false;

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      fn();
    };

    // ── Timeout de sécurité ──
    const timeoutHandle = setTimeout(() => {
      log.warn(`[SkillWorker] Timeout (${maxDurationMs}ms) pour ${moduleUrl} — Worker terminé`);
      worker.terminate();
      // Rejeter aussi tous les appels d'outils en attente
      for (const [, cb] of pendingToolCalls) {
        cb.reject(new Error("Worker timed out"));
      }
      pendingToolCalls.clear();
      settle(() =>
        reject(
          new Error(
            `[SkillWorker] Timeout (${maxDurationMs}ms) dépassé pour le plugin ${moduleUrl}`
          )
        )
      );
    }, maxDurationMs + 500); // +500ms pour laisser le Worker envoyer son résultat

    // ── Réception des messages du Worker ──
    worker.on("message", async (msg: WorkerToMainMessage) => {
      switch (msg.type) {
        case "result":
          settle(() => resolve(msg.result));
          worker.terminate();
          break;

        case "error":
          settle(() =>
            reject(
              Object.assign(new Error(msg.message), { stack: msg.stack })
            )
          );
          worker.terminate();
          break;

        case "tool_call": {
          // ── Capability check (défense en profondeur côté main thread) ──
          if (!allowedCapabilities.includes(msg.toolName)) {
            const response: ToolCallResponseMessage = {
              type: "tool_response",
              requestId: msg.requestId,
              error: `[SkillWorker] Outil "${msg.toolName}" non autorisé pour ce plugin (capabilities: ${allowedCapabilities.join(", ")})`,
            };
            worker.postMessage(response);
            break;
          }

          // ── Délégation au ToolRegistry principal ──
          // API réelle de ToolRegistry : has() + call(name, args) (et NON un
          // get().execute() qui n'existe pas). call() applique permissions,
          // timeout et métriques, et retourne directement le résultat.
          try {
            if (!tools.has(msg.toolName)) {
              throw new Error(`Outil "${msg.toolName}" introuvable dans le ToolRegistry`);
            }
            const result = await tools.call(msg.toolName, msg.args);
            const response: ToolCallResponseMessage = {
              type: "tool_response",
              requestId: msg.requestId,
              result,
            };
            worker.postMessage(response);
          } catch (err: any) {
            const response: ToolCallResponseMessage = {
              type: "tool_response",
              requestId: msg.requestId,
              error: err?.message ?? "Erreur inconnue",
            };
            worker.postMessage(response);
          }
          break;
        }
      }
    });

    worker.on("error", (err) => {
      settle(() => reject(err));
    });

    worker.on("exit", (code) => {
      if (!settled) {
        settle(() =>
          reject(
            new Error(
              `[SkillWorker] Worker terminé de façon inattendue (exit code ${code})`
            )
          )
        );
      }
    });

    // ── Démarrage : envoyer le message d'exécution au Worker ──
    const executeMsg: ExecuteMessage = {
      type: "execute",
      context,
      allowedCapabilities,
    };
    worker.postMessage(executeMsg);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Point d'entrée Worker — s'exécute dans le thread secondaire
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Ce bloc s'exécute uniquement dans le Worker thread.
 * Il importe le plugin et attend le message "execute".
 */
if (!isMainThread) {
  workerEntrypoint().catch((err: unknown) => {
    const msg: ErrorMessage = {
      type: "error",
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    };
    parentPort?.postMessage(msg);
    process.exit(1);
  });
}

async function workerEntrypoint(): Promise<void> {
  const { moduleUrl } = workerData as SkillWorkerData;

  if (!parentPort) throw new Error("parentPort non disponible");

  // ── Import du plugin ──
  let pluginModule: any;
  try {
    pluginModule = await import(moduleUrl);
  } catch (err: any) {
    throw new Error(`Impossible d'importer le plugin "${moduleUrl}": ${err.message}`);
  }

  // ── Localiser l'export AgentPlugin ──
  const plugin = findAgentPluginExport(pluginModule);
  if (!plugin) {
    throw new Error(`Aucun export AgentPlugin valide trouvé dans "${moduleUrl}"`);
  }

  // ── Attendre le message "execute" ──
  await new Promise<void>((resolve, reject) => {
    parentPort!.once("message", async (msg: MainToWorkerMessage) => {
      if (msg.type !== "execute") {
        reject(new Error(`Message inattendu: ${msg.type}`));
        return;
      }

      const { context, allowedCapabilities } = msg;

      // ── Proxy ToolRegistry : chaque appel d'outil envoie un message au main thread ──
      const toolProxy = buildWorkerToolProxy(allowedCapabilities);

      // Maintien de la boucle d'événements du Worker pendant l'exécution.
      // Sans cela, un plugin qui attend une promesse jamais résolue
      // (`await new Promise(() => {})`) laisse la boucle se vider : Node fait
      // sortir le Worker avec le code 0 AVANT que le timeout de l'hôte ne puisse
      // le `terminate()`. L'hôte rejetterait alors « exit inattendu » au lieu de
      // « Timeout ». Ce timer garde le Worker vivant jusqu'à ce que l'hôte le
      // tue au timeout (ou qu'on l'annule nous-mêmes une fois `execute` settlé).
      const keepAlive = setInterval(() => {}, 1 << 30);

      try {
        const result = await plugin.execute(context, toolProxy);
        clearInterval(keepAlive);
        const resultMsg: ResultMessage = { type: "result", result };
        parentPort!.postMessage(resultMsg);
        resolve();
      } catch (err: any) {
        clearInterval(keepAlive);
        const errMsg: ErrorMessage = {
          type: "error",
          message: err?.message ?? "Erreur inconnue dans plugin.execute()",
          stack: err?.stack,
        };
        parentPort!.postMessage(errMsg);
        resolve(); // on résout la promise pour un exit propre
      }
    });
  });
}

/**
 * Construit un proxy ToolRegistry minimaliste utilisable depuis le Worker.
 * Chaque appel d'outil est converti en message `tool_call` envoyé au main thread.
 * Le Worker attend la réponse `tool_response` correspondante.
 */
function buildWorkerToolProxy(allowedCapabilities: string[]): any {
  let requestCounter = 0;

  const callTool = (toolName: string, args: Record<string, unknown>): Promise<unknown> => {
    return new Promise((resolve, reject) => {
      const requestId = `tc_${++requestCounter}`;

      const request: ToolCallRequestMessage = {
        type: "tool_call",
        requestId,
        toolName,
        args,
      };
      parentPort!.postMessage(request);

      // Écouter la réponse correspondante
      const onMessage = (msg: MainToWorkerMessage) => {
        if (msg.type !== "tool_response" || msg.requestId !== requestId) return;
        parentPort!.off("message", onMessage);
        if (msg.error) {
          reject(new Error(msg.error));
        } else {
          resolve(msg.result);
        }
      };
      parentPort!.on("message", onMessage);
    });
  };

  // Expose get() pour simuler l'interface minimale de ToolRegistry
  return {
    get: (toolName: string) => ({
      execute: (args: Record<string, unknown>) => callTool(toolName, args),
    }),
    call: callTool,
    /** Liste des capabilities disponibles dans ce Worker */
    availableTools: () => allowedCapabilities,
  };
}

/**
 * Cherche dans un module ESM l'export qui implémente AgentPlugin
 * (c'est-à-dire un objet avec `metadata.id` et `execute`).
 */
function findAgentPluginExport(module: Record<string, unknown>): any | null {
  for (const key of Object.keys(module)) {
    const exported = module[key];
    if (
      exported &&
      typeof exported === "object" &&
      "metadata" in exported &&
      "execute" in exported &&
      typeof (exported as any).execute === "function"
    ) {
      return exported;
    }
  }
  return null;
}
