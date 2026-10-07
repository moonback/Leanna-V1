/**
 * core/JevSafetyGate.ts — adaptateur reliant le jugement de risque Jev
 * (server/utils/jevGating.ts) au point de passage unique des outils
 * (`ToolRegistry`), via l'interface `SafetyGate`.
 *
 * Même patron que `LedgerGuard` (idempotence) : le ToolRegistry reste ignorant
 * de Jev ; cet adaptateur construit un `AgentActionContext` à partir du tool
 * call, appelle `gateAgentAction`, puis traduit le verdict pour le registry.
 *
 * Modes (LEANNA_SAFETY_GATE) :
 *   - "off"     (défaut) : aucun jugement (le gate n'est même pas branché).
 *   - "enforce" : une action jugée `review` ou `block` est REFUSÉE.
 *   - "audit"   : on journalise le verdict mais on laisse toujours passer.
 *
 * Le contexte ambiant (missionId/taskId) est réglé par l'orchestrateur autour
 * d'une exécution, car `ToolRegistry.call` ne le fournit pas directement.
 */

import type { SafetyGate } from "../runtime/ToolRegistry.js";
import type { ToolPermission } from "../runtime/types.js";
import { gateAgentAction, type GateAction } from "../utils/jevGating.js";

export type SafetyGateMode = "off" | "audit" | "enforce";

export interface JevSafetyGateContext {
  missionId?: string;
  taskId?: string;
}

// ── Pré-filtre : ne juger que les actions RÉELLEMENT à risque système ────────
//
// Le gate est branché sur tous les outils à effet de bord (permission write/
// exec/network/dangerous), mais beaucoup d'outils internes déclarent `write`
// ou `network` sans toucher au système de fichiers ni au shell : ils écrivent
// dans Supabase (mémoire), pilotent l'état d'une mission, etc. Les envoyer à
// Jev coûte des appels inutiles et génère des faux positifs (ex. save_memory
// jugé « exfiltration » à confiance 0.53).
//
// On restreint donc le jugement Jev :
//   1. aux outils dont le NOM correspond à une opération système sensible
//      (fichiers, shell, push distant), OU
//   2. aux appels qui portent effectivement un chemin/commande/URL.
// Tout le reste est laissé passer sans consulter Jev.

/** Outils intrinsèquement à risque système (jugés quel que soit leur argument). */
const RISKY_TOOL_PATTERNS: RegExp[] = [
  /(^|_)write(_|$)/i,
  /(^|_)delete(_|$)/i,
  /(^|_)remove(_|$)/i,
  /(^|_)(exec|execute|run|shell|command|spawn)(_|$)/i,
  /(^|_)push(_|$)/i,          // git_push
  /(^|_)deploy(_|$)/i,
  /(^|_)move(_|$)|(^|_)rename(_|$)/i,
];

/** Outils explicitement sûrs (état interne / lecture), jamais jugés. */
const SAFE_TOOL_PATTERNS: RegExp[] = [
  /(^|_)read(_|$)|(^|_)list(_|$)|(^|_)get(_|$)|(^|_)search(_|$)/i,
  /(^|_)memory(_|$)|(^|_)save_memory$/i,
  /(^|_)mission(_|$)/i,
  /(^|_)verify(_|$)/i,
  /(^|_)reasoning(_|$)|(^|_)think(_|$)/i,
  /(^|_)status(_|$)/i,
];

function extractRefs(args: Record<string, unknown>): {
  path?: string; command?: string; url?: string;
} {
  const path = (args.path ?? args.filePath ?? args.file ?? args.dir ?? args.folder ?? args.destination) as string | undefined;
  const command = (args.command ?? args.cmd ?? args.script) as string | undefined;
  const url = (args.url ?? args.endpoint) as string | undefined;
  return {
    path: typeof path === "string" ? path : undefined,
    command: typeof command === "string" ? command : undefined,
    url: typeof url === "string" ? url : undefined,
  };
}

/** Décide si l'action mérite un jugement Jov (sinon : allow direct, sans appel). */
function shouldEvaluate(tool: string, args: Record<string, unknown>): boolean {
  if (SAFE_TOOL_PATTERNS.some((re) => re.test(tool))) return false;
  if (RISKY_TOOL_PATTERNS.some((re) => re.test(tool))) return true;
  // Sinon : on ne juge que si l'appel touche concrètement fichier/shell/réseau.
  const { path, command, url } = extractRefs(args);
  return Boolean(path || command || url);
}

/** Décrit ce qu'un outil fait, pour donner à Jev un état lisible. */
function summarize(
  tool: string,
  args: Record<string, unknown>,
  permissions: ToolPermission[] | undefined,
): { target: string; summary: string; facts: Record<string, string | number | boolean> } {
  const { path, command, url } = extractRefs(args);
  const target = String(path ?? command ?? url ?? "");

  const perms = (permissions ?? []).join(",");
  const recursive = args.recursive === true || args.force === true;

  // Résumé en langage naturel : c'est le seul texte que Jev lit.
  const parts = [`Outil "${tool}"`];
  if (path) parts.push(`sur le fichier/chemin "${path}"`);
  if (command) parts.push(`exécute la commande shell : ${command}`);
  if (url) parts.push(`contacte l'URL externe : ${url}`);
  if (recursive) parts.push("(opération récursive/forcée)");
  if (!path && !command && !url) {
    // Outil sans cible concrète : on précise à Jev que l'effet est interne,
    // pour éviter qu'il extrapole un risque système inexistant.
    parts.push("(opération sur l'état interne de l'application, sans accès direct au système de fichiers, au shell ni au réseau)");
  }
  if (perms) parts.push(`permissions requises : ${perms}`);

  return {
    target,
    summary: parts.join(" "),
    facts: {
      tool,
      permissions: perms,
      recursive,
      has_path: Boolean(path),
      is_shell: Boolean(command),
      is_network: Boolean(url),
    },
  };
}

export class JevSafetyGate implements SafetyGate {
  private ctx: JevSafetyGateContext = {};

  constructor(
    private readonly mode: SafetyGateMode,
    private readonly opts: { apiKey?: string; model?: string } = {},
  ) {}

  /** Règle le contexte ambiant (missionId/taskId) pour la télémétrie et les spans. */
  setContext(ctx: JevSafetyGateContext): void {
    this.ctx = { ...ctx };
  }

  /** Efface le contexte ambiant (fin de mission/étape). */
  clearContext(): void {
    this.ctx = {};
  }

  async evaluate(
    tool: string,
    args: Record<string, unknown>,
    permissions: ToolPermission[] | undefined,
    _agentId: string | undefined,
  ): Promise<{ decision: "allow" } | { decision: "block"; reason: string }> {
    // "off" ne devrait jamais être branché, mais on garde une porte de sortie.
    if (this.mode === "off") return { decision: "allow" };

    // Pré-filtre : on ne consulte Jev que pour les actions réellement à risque
    // système. Les outils d'état interne (mémoire, mission, lecture…) passent
    // sans appel réseau ni faux positif.
    if (!shouldEvaluate(tool, args)) return { decision: "allow" };

    const { target, summary, facts } = summarize(tool, args, permissions);
    const decision = await gateAgentAction(
      { tool, target, summary, facts },
      {
        apiKey: this.opts.apiKey,
        model: this.opts.model,
        missionId: this.ctx.missionId,
        taskId: this.ctx.taskId,
      },
    );

    const label = `${tool} → ${decision.action}` + (decision.reasons.length ? ` (${decision.reasons.join("; ")})` : "");

    if (this.mode === "audit") {
      // On observe sans jamais bloquer.
      if (decision.action !== "allow") {
        console.warn(`[JevSafetyGate:AUDIT] ${label}`);
      }
      return { decision: "allow" };
    }

    // enforce : allow passe, review ET block sont refusés (fail-closed).
    return mapVerdict(decision.action, decision.reasons, label);
  }
}

function mapVerdict(
  action: GateAction,
  reasons: string[],
  label: string,
): { decision: "allow" } | { decision: "block"; reason: string } {
  if (action === "allow") return { decision: "allow" };
  console.warn(`[JevSafetyGate:ENFORCE] bloqué — ${label}`);
  return { decision: "block", reason: reasons.join("; ") || "action jugée risquée" };
}

/** Lit le mode depuis l'environnement. */
export function safetyGateModeFromEnv(env: NodeJS.ProcessEnv = process.env): SafetyGateMode {
  const raw = (env.LEANNA_SAFETY_GATE ?? "off").toLowerCase().trim();
  return raw === "enforce" || raw === "audit" ? raw : "off";
}
