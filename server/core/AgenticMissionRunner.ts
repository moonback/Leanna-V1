/**
 * core/AgenticMissionRunner.ts — Couture P0.1 : relie le runtime agentique réel
 * au `LeannaSupervisor`.
 *
 * Le Supervisor gouverne le cycle (état durable, checkpoint/rollback, preuve,
 * récupération) mais délègue l'exécution effective à un `MissionRunner`. Cet
 * adaptateur EST ce runner pour le chemin agentique : il appelle `runtime.run()`
 * puis traduit le `AgentResult` en `RunnerOutcome` — en particulier en une
 * PREUVE observable (checks) que le Supervisor évaluera. La narration du modèle
 * n'entre jamais dans le verdict : seuls les faits (vérifications, fichiers,
 * outils) comptent.
 *
 * Pour éviter tout couplage fort de `server/core` vers `server/runtime/agentic`,
 * on ne dépend PAS des classes concrètes : on décrit structurellement le minimum
 * requis (`AgenticLike`, `AgentResultLike`). Le vrai `AgenticRuntime` satisfait
 * ce contrat sans modification.
 */

import type { MissionRunner, RunnerOutcome, RecoveryDecision } from "./LeannaSupervisor.js";
import type { CheckResult, FileChange } from "./EvidenceEngine.js";

/** Sous-ensemble d'une vérification agentique réellement lu ici. */
export interface VerificationLike {
  passed: boolean;
  checks: string[];
  issues: string[];
  summary?: string;
}

/** Sous-ensemble d'un AgentResult réellement lu ici. */
export interface AgentResultLike {
  success: boolean;
  outcome: "success" | "partial" | "blocked" | "no_change" | "failed";
  verifications: VerificationLike[];
  filesModified: string[];
  filesRead: string[];
  toolsExecuted: string[];
  error?: string;
}

/** Tâche minimale acceptée par le runtime agentique. */
export interface AgentTaskLike {
  id?: string;
  role: string;
  goal: string;
  files?: string[];
  instructions?: string;
  metadata?: Record<string, unknown>;
}

/** Contrat structurel minimal du runtime agentique. */
export interface AgenticLike {
  run(task: AgentTaskLike): Promise<AgentResultLike>;
}

/** Traduit un `AgentOutcome` en décision de récupération (audit §17). */
export function outcomeToRecovery(
  outcome: AgentResultLike["outcome"]
): RecoveryDecision | undefined {
  switch (outcome) {
    case "blocked":
      // Blocage externe (ex. erreur préexistante) : ré-essayer ne sert à rien.
      return "escalate";
    case "no_change":
      // Aucune modification : la stratégie n'a pas produit d'effet → replan.
      return "replan";
    case "failed":
      return "retry";
    case "partial":
      return "repair";
    case "success":
      return undefined; // pas de récupération nécessaire
  }
}

/**
 * Construit la PREUVE (checks) à partir des vérifications agentiques. Chaque
 * `check` réussi devient un `CheckResult` passé ; chaque `issue` devient un
 * check échoué explicite. Une vérification globale échouée est également
 * matérialisée pour que `evidence.passed` soit faux dès le moindre échec.
 */
export function verificationsToChecks(verifications: VerificationLike[]): CheckResult[] {
  const checks: CheckResult[] = [];
  for (const v of verifications) {
    for (const label of v.checks) {
      checks.push({ name: label, passed: v.passed });
    }
    for (const issue of v.issues) {
      checks.push({ name: issue, passed: false, details: v.summary });
    }
    // Si une vérification a échoué sans "issue" listée, on trace tout de même
    // un check échoué pour que la preuve reflète l'échec.
    if (!v.passed && v.issues.length === 0 && v.checks.length === 0) {
      checks.push({ name: v.summary || "verification failed", passed: false });
    }
  }
  return checks;
}

/** Convertit un `AgentResult` en `RunnerOutcome` gouvernable par le Supervisor. */
export function toRunnerOutcome(result: AgentResultLike): RunnerOutcome {
  const changes: FileChange[] = result.filesModified.map((path) => ({ path }));
  const runtimeChecks = verificationsToChecks(result.verifications);

  return {
    success: result.success,
    touchedFiles: result.filesModified,
    evidence: {
      changes,
      filesModified: result.filesModified,
      filesRead: result.filesRead,
      toolsExecuted: result.toolsExecuted,
      runtimeChecks,
    },
    suggestedRecovery: result.success ? undefined : outcomeToRecovery(result.outcome),
    error: result.error,
  };
}

/**
 * Fabrique un `MissionRunner` pour le Supervisor à partir du runtime agentique.
 * Le `role` détermine l'agent incarné (défaut "coder"). `plannedFiles` (passés
 * séparément à `runMission`) doivent être snapshottés AVANT l'exécution pour un
 * rollback fidèle.
 */
export function createAgenticMissionRunner(
  runtime: AgenticLike,
  options: { role?: string; instructions?: string } = {}
): MissionRunner {
  return async ({ missionId, goal, attempt }) => {
    const result = await runtime.run({
      id: `${missionId}:attempt-${attempt}`,
      role: options.role ?? "coder",
      goal,
      instructions: options.instructions,
      metadata: { missionId, attempt },
    });
    return toRunnerOutcome(result);
  };
}
