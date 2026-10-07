/**
 * core/LedgerGuard.ts — adaptateur reliant l'ExecutionLedger (P0.3) au point de
 * passage des outils (`ToolRegistry`).
 *
 * `ToolRegistry` définit l'interface `IdempotencyGuard` chez lui pour rester
 * découplé du noyau (aucun cycle d'import). Cet adaptateur l'implémente au-dessus
 * du ledger : il traduit `begin/complete/fail` en la forme attendue par le
 * registre.
 *
 * Contexte de mission (missionId/stepId) : le `ToolRegistry.call` ne le fournit
 * pas directement. On expose un contexte ambiant, réglable par le Supervisor
 * autour d'une exécution de mission, afin que la clé d'idempotence soit stable
 * par étape.
 */

import type { IdempotencyGuard } from "../runtime/ToolRegistry.js";
import type { ToolPermission } from "../runtime/types.js";
import { ExecutionLedger, permissionsHaveSideEffect } from "./ExecutionLedger.js";

export interface LedgerGuardContext {
  missionId?: string;
  stepId?: string;
}

export class LedgerGuard implements IdempotencyGuard {
  private ctx: LedgerGuardContext = {};

  constructor(private readonly ledger: ExecutionLedger = new ExecutionLedger()) {}

  /** Règle le contexte ambiant (à appeler avant/pendant une étape de mission). */
  setContext(ctx: LedgerGuardContext): void {
    this.ctx = { ...ctx };
  }

  /** Efface le contexte ambiant (fin de mission/étape). */
  clearContext(): void {
    this.ctx = {};
  }

  guard(
    tool: string,
    args: Record<string, unknown>,
    permissions: ToolPermission[] | undefined,
    _agentId: string | undefined
  ):
    | { decision: "execute"; commit: (result: unknown) => void; fail: (error: string) => void }
    | { decision: "skip"; result: unknown }
    | { decision: "block"; reason: string } {
    const sideEffect = permissionsHaveSideEffect(permissions as string[] | undefined);
    const decision = this.ledger.begin(
      { tool, args, missionId: this.ctx.missionId, stepId: this.ctx.stepId },
      sideEffect
    );

    if (decision.action === "skip") {
      return { decision: "skip", result: decision.result };
    }
    if (decision.action === "block") {
      return { decision: "block", reason: decision.reason };
    }
    return {
      decision: "execute",
      commit: (result) => this.ledger.complete(decision.key, result),
      fail: (error) => this.ledger.fail(decision.key, error),
    };
  }
}
