/**
 * PredictionEngine — "Predictive Agent" (task.md §2, P1).
 *
 * Avant chaque mission importante, prédire AVANT d'agir :
 *
 *   Objectif → Historique → Contexte projet → Fiabilité outils → Risques connus
 *            → Prédiction (probabilité de réussite, risques, durée, coût,
 *              stratégie recommandée, prédiction d'échec par étape)
 *
 * Design (reuse, don't rebuild): the engine is a deterministic aggregator over
 * signals that already exist —
 *   - `StrategyMemory` : fiabilité récente par skill (le cœur de la prédiction),
 *   - `PlaybookStore`  : un playbook appris pour ce type de problème = chemin
 *     prouvé → forte hausse de confiance + stratégie recommandée toute faite,
 *   - l'estimation pré-vol (coût/durée/risque) produite par le PlanEstimator.
 *
 * It never calls a model and never executes anything. It just tells the planner
 * (or the user) how likely a plan is to succeed and where it is most fragile, so
 * the plan can be adapted BEFORE execution.
 */

import { strategyMemory, type StrategyMemory } from "./StrategyMemory.js";
import { playbookStore, type PlaybookStore, type Playbook } from "./PlaybookStore.js";

export type PredictionRisk = "low" | "medium" | "high" | "critical";

/** Per-step failure prediction so the plan can be adapted before execution. */
export interface StepPrediction {
  order: number;
  skillName: string;
  /** Probability this step fails, 0..1. */
  failureRisk: number;
  /** Why: "fiabilité récente 10%", "aucun historique", etc. */
  reason: string;
}

export interface PredictionReport {
  /** Overall probability the mission succeeds, 0..1 (and as a %). */
  successProbability: number;
  successPercent: number;
  /** Qualitative risk level derived from the probability + plan shape. */
  riskLevel: PredictionRisk;
  /** Human-readable risk factors (🔴/🟠/🟡 in the UI). */
  risks: string[];
  estimatedDurationMs: number;
  estimatedCostUsd: number;
  estimatedTokens: number;
  /** The recommended ordered strategy (from a matching playbook or a heuristic). */
  recommendedStrategy: string[];
  /** Id of the playbook that informed the strategy, when matched. */
  playbookId?: string;
  /** Per-step failure predictions, highest risk first. */
  steps: StepPrediction[];
  /** The single step most likely to fail (for "adapt the plan before step N"). */
  weakestStep?: StepPrediction;
  /** Confidence in the prediction itself (how much history backed it), 0..1. */
  confidence: number;
  generatedAt: string;
  summary: string;
}

/** Pre-flight estimate (from PlanEstimator / MissionPlan). All optional. */
export interface PredictionEstimate {
  durationMs?: number;
  costUsd?: number;
  tokens?: number;
}

export interface PredictInput {
  objective: { title: string; description?: string; errors?: string[] };
  /** Ordered skills the plan intends to run. */
  plannedSkills: string[];
}

export interface PredictionEngineOptions {
  strategyMemory?: StrategyMemory;
  playbookStore?: PlaybookStore;
}

/** Neutral prior for a skill with no recorded history (optimistic but cautious). */
const NO_HISTORY_PRIOR = 0.7;
/** A matching playbook is a proven path — bounded confidence boost. */
const PLAYBOOK_BOOST = 0.12;
/** Default generic strategy when no playbook matches. */
const GENERIC_STRATEGY = ["analyser", "modifier", "typecheck", "tests ciblés", "tests complets", "rollback si échec"];

const riskFromProbability = (p: number, sideEffectSteps: number): PredictionRisk => {
  if (p < 0.4 || sideEffectSteps > 10) return "critical";
  if (p < 0.6 || sideEffectSteps > 4) return "high";
  if (p < 0.8) return "medium";
  return "low";
};

/** Deterministic pre-flight prediction over reliability + playbook + estimate. */
export class PredictionEngine {
  private readonly strategy: StrategyMemory;
  private readonly playbooks: PlaybookStore;

  constructor(options: PredictionEngineOptions = {}) {
    this.strategy = options.strategyMemory ?? strategyMemory;
    this.playbooks = options.playbookStore ?? playbookStore;
  }

  predict(input: PredictInput, estimate: PredictionEstimate = {}): PredictionReport {
    const skills = input.plannedSkills.filter(Boolean);
    const steps: StepPrediction[] = [];
    const risks: string[] = [];

    // 1) Per-step failure risk from recent reliability.
    let evidenceCount = 0;
    const perStepSuccess: number[] = [];
    skills.forEach((skillName, index) => {
      const stats = this.safeStats(skillName);
      let success: number;
      let reason: string;
      if (stats) {
        success = stats.recentSuccessRate;
        reason = `fiabilité récente ${(success * 100) | 0}% (${stats.totalCalls} appels)`;
        evidenceCount++;
      } else {
        success = NO_HISTORY_PRIOR;
        reason = "aucun historique — a priori neutre";
      }
      perStepSuccess.push(success);
      steps.push({ order: index, skillName, failureRisk: Math.round((1 - success) * 100) / 100, reason });
    });

    // 2) Overall probability: geometric mean of per-step success (one weak step
    // drags the whole mission down, which matches real pipelines) with a small
    // penalty for very large plans.
    let probability = this.geometricMean(perStepSuccess);
    if (skills.length > 10) probability *= 0.9;

    // 3) Failing skills in the plan are explicit risks.
    const failing = new Set(this.safeFailing().map((s) => s.skillName));
    const failingInPlan = skills.filter((s) => failing.has(s));
    if (failingInPlan.length > 0) {
      probability *= Math.max(0.4, 1 - failingInPlan.length * 0.15);
      risks.push(`🔴 ${failingInPlan.length} outil(s) historiquement défaillant(s) dans le plan : ${[...new Set(failingInPlan)].join(", ")}.`);
    }

    // 4) A matching playbook is a proven path → boost + ready-made strategy.
    const playbook = this.matchPlaybook(input.objective);
    let recommendedStrategy: string[];
    let playbookId: string | undefined;
    if (playbook) {
      probability = Math.min(1, probability + PLAYBOOK_BOOST);
      recommendedStrategy = playbook.steps.map((s) => s.skillName);
      playbookId = playbook.id;
      risks.push(`🟢 Playbook éprouvé disponible (${playbook.id}, appris ${playbook.timesLearned}×) — réutilisation recommandée.`);
    } else {
      recommendedStrategy = GENERIC_STRATEGY;
    }

    // 5) Plan-shape risks.
    const sideEffectSteps = skills.filter((s) => /write|edit|replace|create|delete|run|exec|command|deploy|migrat/i.test(s)).length;
    if (sideEffectSteps > 4) risks.push(`🟠 ${sideEffectSteps} étape(s) à effet de bord — surface de risque élevée.`);
    if (skills.length === 0) risks.push("🟡 Aucune action planifiée — l'estimation sera affinée pendant l'analyse.");
    if (evidenceCount === 0 && skills.length > 0) risks.push("🟡 Aucun historique de fiabilité — prédiction peu étayée.");

    probability = Math.max(0, Math.min(1, probability));
    const riskLevel = riskFromProbability(probability, sideEffectSteps);

    // 6) Confidence in the prediction = fraction of steps backed by history.
    const confidence = skills.length === 0 ? 0.3 : Math.round((evidenceCount / skills.length) * 100) / 100;

    const sortedSteps = [...steps].sort((a, b) => b.failureRisk - a.failureRisk);
    const weakestStep = sortedSteps[0] && sortedSteps[0].failureRisk >= 0.4 ? sortedSteps[0] : undefined;
    if (weakestStep) {
      risks.push(`🟠 Étape « ${weakestStep.skillName} » : ${Math.round(weakestStep.failureRisk * 100)}% de risque d'échec — adapter le plan avant exécution.`);
    }

    const report: PredictionReport = {
      successProbability: probability,
      successPercent: Math.round(probability * 100),
      riskLevel,
      risks,
      estimatedDurationMs: estimate.durationMs ?? 0,
      estimatedCostUsd: estimate.costUsd ?? 0,
      estimatedTokens: estimate.tokens ?? 0,
      recommendedStrategy,
      playbookId,
      steps: sortedSteps,
      weakestStep,
      confidence,
      generatedAt: new Date().toISOString(),
      summary: "",
    };
    report.summary = this.buildSummary(report);
    return report;
  }

  private matchPlaybook(objective: PredictInput["objective"]): Playbook | undefined {
    try {
      return this.playbooks.findMatching({ title: objective.title, description: objective.description, errors: objective.errors });
    } catch {
      return undefined;
    }
  }

  private safeStats(skillName: string) {
    try {
      return this.strategy.getSkillStats(skillName);
    } catch {
      return undefined;
    }
  }

  private safeFailing() {
    try {
      return this.strategy.getFailingSkills();
    } catch {
      return [];
    }
  }

  private geometricMean(values: number[]): number {
    if (values.length === 0) return NO_HISTORY_PRIOR;
    // Clamp each factor away from 0 so a single unknown step doesn't zero out.
    const logSum = values.reduce((sum, v) => sum + Math.log(Math.max(0.05, Math.min(1, v))), 0);
    return Math.exp(logSum / values.length);
  }

  private buildSummary(r: PredictionReport): string {
    const lines: string[] = [];
    lines.push(`## 🔮 Prédiction`);
    lines.push("");
    lines.push(`Probabilité de réussite : **${r.successPercent}%** (confiance ${Math.round(r.confidence * 100)}%)`);
    const icon = r.riskLevel === "critical" ? "🔴" : r.riskLevel === "high" ? "🟠" : r.riskLevel === "medium" ? "🟡" : "🟢";
    lines.push(`Niveau de risque : ${icon} ${r.riskLevel}`);
    if (r.estimatedDurationMs || r.estimatedCostUsd) {
      lines.push(`Durée estimée : ${formatDuration(r.estimatedDurationMs)} · Coût estimé : $${r.estimatedCostUsd.toFixed(2)}`);
    }
    if (r.risks.length) {
      lines.push("");
      lines.push(`Risques détectés :`);
      for (const risk of r.risks.slice(0, 8)) lines.push(`${risk}`);
    }
    lines.push("");
    lines.push(`Stratégie recommandée${r.playbookId ? ` (${r.playbookId})` : ""} :`);
    r.recommendedStrategy.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
    if (r.weakestStep) {
      lines.push("");
      lines.push(`⚠️ Étape la plus fragile : « ${r.weakestStep.skillName} » (${Math.round(r.weakestStep.failureRisk * 100)}% de risque).`);
    }
    return lines.join("\n");
  }
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "n/a";
  if (ms < 1000) return `${ms}ms`;
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}m${String(sec).padStart(2, "0")}` : `${sec}s`;
}

/** Shared singleton, mirroring the other knowledge engines. */
export const predictionEngine = new PredictionEngine();
