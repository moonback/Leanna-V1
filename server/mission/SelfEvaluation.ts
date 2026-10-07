/**
 * SelfEvaluationEngine — "Leanna Self-Critique" (task.md §10).
 *
 * Après chaque mission, pas une simple réponse LLM : un moteur qui compare
 *
 *   PLAN INITIAL  vs  EXÉCUTION RÉELLE  vs  RÉSULTAT
 *
 * et produit des scores objectifs :
 *
 *   Plan accuracy · Tool efficiency · Recovery quality · Verification · Cost efficiency
 *
 * puis : « La prochaine mission similaire doit commencer par X. »
 *
 * Design : déterministe, lecture seule, aucun appel modèle. Tout est dérivé des
 * données que la mission enregistre déjà (plannedActions avec statut/réflexion,
 * reflections[], metrics). Complète LearningEngine (leçons en prose) et
 * PlaybookStore (séquence rejouable) avec une *note de performance* exploitable.
 */

export interface SelfEvalMissionView {
  id: string;
  title: string;
  status: string;
  goals: Record<string, {
    status: string;
    parentId?: string | null;
    plannedActions: Array<{
      skillName: string;
      order: number;
      status: string;
      reflection?: { decision?: string; confidence?: number } | undefined;
    }>;
  }>;
  reflections?: Array<{ decision?: string; confidence?: number }>;
  metrics?: {
    totalActions?: number;
    successfulActions?: number;
    failedActions?: number;
    retriedActions?: number;
    averageConfidence?: number;
    totalDurationMs?: number;
    estimatedTokens?: number;
  };
}

export interface SelfEvaluation {
  missionId: string;
  title: string;
  /** 0..100 per dimension. */
  scores: {
    planAccuracy: number;
    toolEfficiency: number;
    recoveryQuality: number;
    verification: number;
    costEfficiency: number;
  };
  /** Weighted overall 0..100. */
  overall: number;
  /** Concrete, actionable notes. */
  notes: string[];
  /** "La prochaine mission similaire doit commencer par X." */
  nextTimeStartWith: string;
  summary: string;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

const VERIFY_RE = /test|typecheck|type-check|lint|verify|check|vitest|jest/i;

/** Deterministic plan-vs-execution-vs-result scorer. */
export class SelfEvaluationEngine {
  evaluate(mission: SelfEvalMissionView): SelfEvaluation {
    const actions = Object.values(mission.goals)
      .filter((g) => g.parentId !== null || Object.values(mission.goals).length === 1)
      .flatMap((g) => g.plannedActions);
    const total = actions.length;
    const completed = actions.filter((a) => a.status === "completed").length;
    const failed = actions.filter((a) => a.status === "failed").length;
    const metrics = mission.metrics ?? {};
    const reflections = mission.reflections ?? [];

    // 1) Plan accuracy — how much of the plan executed cleanly (completed / total),
    // discounted by replans (plan had to change).
    const replans = reflections.filter((r) => r.decision === "replan").length;
    const planAccuracy = total === 0
      ? (mission.status === "completed" ? 70 : 30)
      : clamp((completed / total) * 100 - replans * 10);

    // 2) Tool efficiency — fewer failed/retried calls per useful action = better.
    const retried = metrics.retriedActions ?? 0;
    const toolEfficiency = total === 0
      ? 70
      : clamp(100 - (failed / total) * 60 - Math.min(30, retried * 8));

    // 3) Recovery quality — when failures happened, did reflection recover
    // (replan/retry) rather than escalate/abort? If no failures, full marks.
    const recoveries = reflections.filter((r) => r.decision === "replan" || r.decision === "retry").length;
    const giveUps = reflections.filter((r) => r.decision === "escalate" || r.decision === "abort").length;
    const recoveryQuality = failed === 0
      ? 100
      : clamp(50 + recoveries * 15 - giveUps * 25 + (mission.status === "completed" ? 20 : -10));

    // 4) Verification — did the run include a verification step (test/typecheck/lint)?
    const hasVerify = actions.some((a) => VERIFY_RE.test(a.skillName) && a.status === "completed");
    const verification = hasVerify ? 100 : (mission.status === "completed" ? 55 : 30);

    // 5) Cost efficiency — penalize high action count / token spend for the result.
    const tokens = metrics.estimatedTokens ?? 0;
    const actionPenalty = Math.min(40, Math.max(0, total - 6) * 4);
    const tokenPenalty = Math.min(30, Math.floor(tokens / 4000) * 5);
    const costEfficiency = clamp(100 - actionPenalty - tokenPenalty);

    const scores = { planAccuracy, toolEfficiency, recoveryQuality, verification, costEfficiency };
    const overall = clamp(
      planAccuracy * 0.25 + toolEfficiency * 0.2 + recoveryQuality * 0.2 + verification * 0.2 + costEfficiency * 0.15,
    );

    const notes = this.buildNotes({ scores, replans, failed, hasVerify, total, status: mission.status });
    const nextTimeStartWith = this.recommendStart(actions, hasVerify, mission.status);

    const evaluation: SelfEvaluation = {
      missionId: mission.id,
      title: mission.title,
      scores,
      overall,
      notes,
      nextTimeStartWith,
      summary: "",
    };
    evaluation.summary = buildSummary(evaluation);
    return evaluation;
  }

  private buildNotes(ctx: {
    scores: SelfEvaluation["scores"];
    replans: number;
    failed: number;
    hasVerify: boolean;
    total: number;
    status: string;
  }): string[] {
    const notes: string[] = [];
    if (ctx.scores.planAccuracy < 70) notes.push(`Le plan initial a dévié (${ctx.replans} replanification(s)) — mieux décomposer en amont.`);
    if (ctx.scores.toolEfficiency < 70) notes.push(`${ctx.failed} action(s) échouée(s) — réévaluer le choix d'outils / arguments.`);
    if (!ctx.hasVerify) notes.push("Aucune étape de vérification (test/typecheck) — ajouter une validation avant de conclure.");
    if (ctx.scores.costEfficiency < 70) notes.push(`Mission coûteuse (${ctx.total} actions) — chercher un chemin plus court.`);
    if (ctx.scores.recoveryQuality < 60 && ctx.failed > 0) notes.push("Récupération faible après échec — préférer une replanification ciblée à l'abandon.");
    if (notes.length === 0) notes.push("Exécution saine : plan respecté, outils fiables, résultat vérifié.");
    return notes;
  }

  /** Concrete opening move for the next similar mission. */
  private recommendStart(
    actions: SelfEvalMissionView["goals"][string]["plannedActions"],
    hasVerify: boolean,
    status: string,
  ): string {
    const first = actions[0]?.skillName;
    const firstFailed = actions[0]?.status === "failed";
    if (actions.length === 0) return "Commencer par analyser le contexte (knowledge_build_context) avant toute action.";
    if (firstFailed) return `Ne pas commencer par « ${first} » (a échoué d'emblée) — débuter par une analyse de contexte ciblée.`;
    if (!hasVerify) return `Commencer comme « ${first} », mais insérer une vérification (typecheck/tests) avant de conclure.`;
    if (status !== "completed") return "Commencer par une analyse de contexte approfondie puis valider le plan avant d'agir.";
    return `Réutiliser l'ouverture gagnante : commencer par « ${first} ».`;
  }
}

function buildSummary(e: SelfEvaluation): string {
  const bar = (n: number) => (n >= 85 ? "🟢" : n >= 70 ? "🟡" : n >= 50 ? "🟠" : "🔴");
  const lines: string[] = [];
  lines.push(`## 🧠 Auto-critique — « ${e.title} »`);
  lines.push("");
  lines.push(`${bar(e.scores.planAccuracy)} Plan accuracy      ${String(e.scores.planAccuracy).padStart(3)}%`);
  lines.push(`${bar(e.scores.toolEfficiency)} Tool efficiency    ${String(e.scores.toolEfficiency).padStart(3)}%`);
  lines.push(`${bar(e.scores.recoveryQuality)} Recovery quality   ${String(e.scores.recoveryQuality).padStart(3)}%`);
  lines.push(`${bar(e.scores.verification)} Verification       ${String(e.scores.verification).padStart(3)}%`);
  lines.push(`${bar(e.scores.costEfficiency)} Cost efficiency    ${String(e.scores.costEfficiency).padStart(3)}%`);
  lines.push("");
  lines.push(`${bar(e.overall)} **GLOBAL** ${e.overall}%`);
  lines.push("");
  for (const note of e.notes) lines.push(`- ${note}`);
  lines.push("");
  lines.push(`➡️ Prochaine fois : ${e.nextTimeStartWith}`);
  return lines.join("\n");
}

/** Shared singleton. */
export const selfEvaluationEngine = new SelfEvaluationEngine();
