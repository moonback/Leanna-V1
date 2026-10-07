/**
 * core/ExecutionLedger.ts — P0.3 : registre d'exécution (idempotence + reprise).
 *
 * Problème résolu (audit §15/§16) : aujourd'hui un crash APRÈS un effet de bord
 * (écriture fichier, appel GitHub/FTP/shell…) mais AVANT que le résultat soit
 * enregistré peut conduire à REJOUER l'action à la reprise. Pour une action
 * destructive, c'est inacceptable.
 *
 * Solution : un journal append-only, durable et local, où chaque action reçoit
 * une `idempotencyKey` déterministe. Avant d'exécuter :
 *   - clé déjà `completed`  → on retourne le résultat mémorisé (skip)
 *   - clé `started` orpheline (crash) → statut `unknown`, NON rejouée si l'action
 *     a un effet de bord (voir `hasSideEffect`).
 *
 * Le ledger ne connaît pas les outils : l'appelant fournit un flag `sideEffect`.
 * Il est branché sur `ToolRegistry.call` via un hook optionnel (P0 intégration),
 * de sorte qu'aucun outil n'est impacté si le ledger n'est pas configuré.
 */

import { createHash } from "node:crypto";
import path from "node:path";
import { coreDir, appendJsonl, readJsonl } from "./paths.js";

export type LedgerStatus = "started" | "completed" | "failed" | "unknown";

/** Une entrée du journal d'exécution. */
export interface LedgerEntry {
  idempotencyKey: string;
  missionId?: string;
  stepId?: string;
  tool: string;
  argumentsHash: string;
  /** L'action a-t-elle un effet de bord (write/exec/network) ? */
  sideEffect: boolean;
  status: LedgerStatus;
  startedAt: string;
  completedAt?: string;
  /** Résultat sérialisé (uniquement si status === "completed"). */
  result?: unknown;
  error?: string;
}

/** Contexte identifiant une action, pour dériver une clé déterministe. */
export interface ActionKeyParts {
  tool: string;
  args: Record<string, unknown>;
  missionId?: string;
  stepId?: string;
}

/** Hash SHA-256 stable d'arguments (clés triées pour un ordre déterministe). */
export function hashArguments(args: Record<string, unknown>): string {
  const stable = JSON.stringify(args, Object.keys(args ?? {}).sort());
  return createHash("sha256").update(stable, "utf8").digest("hex");
}

/** Dérive une clé d'idempotence déterministe : missionId:stepId:tool:argsHash. */
export function idempotencyKeyFor(parts: ActionKeyParts): string {
  const argsHash = hashArguments(parts.args);
  return [parts.missionId ?? "-", parts.stepId ?? "-", parts.tool, argsHash].join(":");
}

/** Décision retournée par `begin()`. */
export type BeginDecision =
  | { action: "execute"; key: string; argumentsHash: string }
  | { action: "skip"; key: string; result: unknown }
  | { action: "block"; key: string; reason: string };

export class ExecutionLedger {
  /** Cache en mémoire de l'état terminal par clé (rebâti au chargement). */
  private readonly index = new Map<string, LedgerEntry>();
  private readonly filePath: string;

  /** `fileOverride` (tests) ; sinon `.Leanna/core/ledger/actions.jsonl`. */
  constructor(fileOverride?: string) {
    this.filePath = fileOverride ?? path.join(coreDir("ledger"), "actions.jsonl");
    this.hydrate();
  }

  /** Reconstruit l'index depuis le journal (reprise après crash). */
  private hydrate(): void {
    for (const entry of readJsonl<LedgerEntry>(this.filePath)) {
      // La dernière entrée d'une clé fait foi (append-only, ordre = temps).
      this.index.set(entry.idempotencyKey, entry);
    }
    // Les `started` sans terminaison sont des actions interrompues par un crash.
    for (const [key, entry] of this.index) {
      if (entry.status === "started") {
        this.index.set(key, { ...entry, status: "unknown" });
      }
    }
  }

  /**
   * À appeler AVANT d'exécuter une action. Décide s'il faut l'exécuter, la
   * sauter (résultat connu) ou la bloquer (effet de bord de statut inconnu).
   */
  begin(parts: ActionKeyParts, sideEffect: boolean): BeginDecision {
    const key = idempotencyKeyFor(parts);
    const argumentsHash = hashArguments(parts.args);
    const existing = this.index.get(key);

    if (existing?.status === "completed") {
      return { action: "skip", key, result: existing.result };
    }

    if (existing?.status === "unknown" && existing.sideEffect) {
      // Effet de bord potentiellement déjà appliqué : ne PAS rejouer aveuglément.
      return {
        action: "block",
        key,
        reason:
          "Action à effet de bord interrompue par un crash (statut inconnu) — " +
          "rejeu bloqué pour éviter une double exécution.",
      };
    }

    // (unknown sans effet de bord, failed, ou inédit) → exécuter.
    const entry: LedgerEntry = {
      idempotencyKey: key,
      missionId: parts.missionId,
      stepId: parts.stepId,
      tool: parts.tool,
      argumentsHash,
      sideEffect,
      status: "started",
      startedAt: new Date().toISOString(),
    };
    this.index.set(key, entry);
    appendJsonl(this.filePath, entry);
    return { action: "execute", key, argumentsHash };
  }

  /** À appeler APRÈS une exécution réussie. */
  complete(key: string, result: unknown): void {
    const prev = this.index.get(key);
    const entry: LedgerEntry = {
      ...(prev ?? this.stub(key)),
      status: "completed",
      completedAt: new Date().toISOString(),
      result,
      error: undefined,
    };
    this.index.set(key, entry);
    appendJsonl(this.filePath, entry);
  }

  /** À appeler APRÈS un échec d'exécution. */
  fail(key: string, error: string): void {
    const prev = this.index.get(key);
    const entry: LedgerEntry = {
      ...(prev ?? this.stub(key)),
      status: "failed",
      completedAt: new Date().toISOString(),
      error,
    };
    this.index.set(key, entry);
    appendJsonl(this.filePath, entry);
  }

  /** État courant d'une clé (diagnostic / reprise). */
  get(key: string): LedgerEntry | undefined {
    return this.index.get(key);
  }

  /** Toutes les entrées interrompues (statut inconnu) — utile à la reprise. */
  listUnknown(): LedgerEntry[] {
    return [...this.index.values()].filter((e) => e.status === "unknown");
  }

  private stub(key: string): LedgerEntry {
    return {
      idempotencyKey: key,
      tool: "unknown",
      argumentsHash: "",
      sideEffect: false,
      status: "started",
      startedAt: new Date().toISOString(),
    };
  }
}

/**
 * Enveloppe pratique : exécute `run()` sous garde d'idempotence.
 * - si déjà complété → retourne le résultat mémorisé sans réexécuter ;
 * - si bloqué (crash sur effet de bord) → lève une erreur explicite ;
 * - sinon exécute, puis journalise complete/fail.
 */
export async function runIdempotent<T>(
  ledger: ExecutionLedger,
  parts: ActionKeyParts,
  sideEffect: boolean,
  run: () => Promise<T>
): Promise<T> {
  const decision = ledger.begin(parts, sideEffect);
  if (decision.action === "skip") {
    return decision.result as T;
  }
  if (decision.action === "block") {
    throw new Error(decision.reason);
  }
  try {
    const result = await run();
    ledger.complete(decision.key, result);
    return result;
  } catch (err) {
    ledger.fail(decision.key, (err as Error).message);
    throw err;
  }
}

/** Détermine si un ensemble de permissions d'outil implique un effet de bord. */
export function permissionsHaveSideEffect(permissions?: string[]): boolean {
  if (!permissions?.length) return false;
  return permissions.some(
    (p) => p === "write" || p === "exec" || p === "execute" || p === "network" || p === "dangerous"
  );
}
