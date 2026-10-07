/**
 * OpportunityEngine — "Opportunity Engine" (task.md §14, P1).
 *
 * La différence entre un *assistant* (attend les demandes) et un *agent*
 * (cherche ce qui peut être amélioré). Leanna cherche activement :
 *
 *   PROBLÈMES · OPPORTUNITÉS · OPTIMISATIONS · AUTOMATISATIONS · RISQUES
 *
 * Exemple : « J'ai remarqué que tu fais manuellement cette opération 8 fois par
 * semaine. Je peux créer un workflow. »
 *
 * Complément de l'AnticipationEngine : celui-ci RÉAGIT aux événements runtime en
 * temps réel ; l'OpportunityEngine CHERCHE proactivement du travail utile dans
 * l'historique durable. Il est déterministe, best-effort, et n'appelle aucun
 * modèle — il agrège des signaux déjà produits :
 *   - LearningEngine.getPatternsHistory() : patterns récurrents (optim/erreurs),
 *   - StrategyMemory.getFailingSkills()    : outils peu fiables,
 *   - ProjectDoctor.diagnose()             : problèmes de santé priorisés,
 *   - PlaybookStore.list()                 : playbooks mûrs → candidats workflow.
 */

import { learningEngine, type LearningEngine } from "./LearningEngine.js";
import { strategyMemory, type StrategyMemory } from "./StrategyMemory.js";
import { playbookStore, type PlaybookStore } from "./PlaybookStore.js";
import { projectDoctor, type ProjectDoctor } from "./ProjectDoctor.js";

export type OpportunityKind =
  | "automation"   // operation worth turning into a workflow
  | "optimization" // recurring optimization opportunity
  | "prevention"   // recurring error worth preventing
  | "reliability"  // under-reliable tooling to fix
  | "health";      // project-health improvement

export interface Opportunity {
  id: string;
  kind: OpportunityKind;
  /** User-facing message, e.g. "Tu as rencontré ce problème 6 fois…". */
  message: string;
  /** Concrete proposed action (a mission/workflow title). */
  suggestedAction: string;
  /** Estimated value 0..100 (how worthwhile). */
  value: number;
  /** Estimated effort 1 (trivial) … 5 (heavy). */
  effort: 1 | 2 | 3 | 4 | 5;
  /** value/effort ratio — the ranking key ("best bang for the buck"). */
  payoff: number;
  affectedResources: string[];
  /** Stable dedupe signature of the opportunity class. */
  signature: string;
}

export interface OpportunityReport {
  opportunities: Opportunity[];
  generatedAt: string;
  summary: string;
}

export interface OpportunityEngineOptions {
  learningEngine?: LearningEngine;
  strategyMemory?: StrategyMemory;
  playbookStore?: PlaybookStore;
  projectDoctor?: ProjectDoctor;
}

const EFFORT_FROM_KIND: Record<OpportunityKind, Opportunity["effort"]> = {
  automation: 2,
  optimization: 3,
  prevention: 2,
  reliability: 3,
  health: 3,
};

/** Active hunter for useful work. Deterministic aggregator; no side effects. */
export class OpportunityEngine {
  private readonly learning: LearningEngine;
  private readonly strategy: StrategyMemory;
  private readonly playbooks: PlaybookStore;
  private readonly doctor: ProjectDoctor;

  constructor(options: OpportunityEngineOptions = {}) {
    this.learning = options.learningEngine ?? learningEngine;
    this.strategy = options.strategyMemory ?? strategyMemory;
    this.playbooks = options.playbookStore ?? playbookStore;
    this.doctor = options.projectDoctor ?? projectDoctor;
  }

  /**
   * Hunt for opportunities across durable history. `limit` caps the returned
   * list (ranked by payoff). Best-effort: a failing source never breaks the scan.
   */
  scan(opts: { limit?: number; includeHealth?: boolean } = {}): OpportunityReport {
    const found: Opportunity[] = [];
    const seen = new Set<string>();
    const add = (o: Omit<Opportunity, "id" | "payoff">) => {
      if (seen.has(o.signature)) return;
      seen.add(o.signature);
      const payoff = Math.round((o.value / o.effort) * 10) / 10;
      found.push({ ...o, id: `OPP-${o.signature.toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 28)}`, payoff });
    };

    // 1) Recurring patterns → automation / optimization / prevention.
    try {
      const patterns = this.learning.getPatternsHistory(15);
      for (const p of patterns.optimizations) {
        if (!p.isRecurring) continue;
        add({
          kind: "optimization",
          message: `Opportunité d'optimisation récurrente (${p.occurrenceCount}×) : ${p.description}`,
          suggestedAction: "Appliquer l'optimisation récurrente identifiée.",
          value: Math.min(100, 45 + p.occurrenceCount * 6 + p.aggregatedImportance * 20),
          effort: EFFORT_FROM_KIND.optimization,
          affectedResources: p.relatedFiles,
          signature: `optimization:${p.signature}`,
        });
      }
      for (const p of patterns.errorPatterns) {
        if (!p.isRecurring) continue;
        add({
          kind: "prevention",
          message: `Tu as rencontré ce problème ${p.occurrenceCount}× : ${p.description}`,
          suggestedAction: "Automatiser la prévention de cette erreur récurrente.",
          value: Math.min(100, 55 + p.occurrenceCount * 7 + p.aggregatedImportance * 15),
          effort: EFFORT_FROM_KIND.prevention,
          affectedResources: p.relatedFiles,
          signature: `prevention:${p.signature}`,
        });
      }
    } catch { /* learning history best-effort */ }

    // 2) Mature playbooks → automation (turn a proven, repeated strategy into a workflow).
    try {
      for (const pb of this.playbooks.list()) {
        if (pb.timesLearned < 3) continue; // only well-established strategies
        add({
          kind: "automation",
          message: `Tu as résolu « ${pb.title} » ${pb.timesLearned}× avec la même stratégie.`,
          suggestedAction: `Créer un workflow depuis le playbook ${pb.id}.`,
          value: Math.min(100, 50 + pb.timesLearned * 8),
          effort: EFFORT_FROM_KIND.automation,
          affectedResources: pb.relatedFiles,
          signature: `automation:${pb.triggerSignature}`,
        });
      }
    } catch { /* playbooks best-effort */ }

    // 3) Under-reliable tooling → reliability.
    try {
      const failing = this.strategy.getFailingSkills();
      if (failing.length > 0) {
        add({
          kind: "reliability",
          message: `${failing.length} outil(s) peu fiable(s) : ${failing.slice(0, 5).map((s) => s.skillName).join(", ")}.`,
          suggestedAction: "Analyser les échecs d'outils récurrents et adopter des stratégies alternatives.",
          value: Math.min(100, 50 + failing.length * 10),
          effort: EFFORT_FROM_KIND.reliability,
          affectedResources: failing.map((s) => s.skillName),
          signature: `reliability:${failing.map((s) => s.skillName).sort().join(",")}`,
        });
      }
    } catch { /* reliability best-effort */ }

    // 4) Project health → surface the Doctor's highest-value fixes as opportunities.
    if (opts.includeHealth !== false) {
      try {
        const health = this.doctor.diagnose();
        for (const issue of health.issues) {
          if (issue.severity === "low") continue;
          const value = issue.severity === "critical" ? 95 : issue.severity === "high" ? 80 : 60;
          add({
            kind: "health",
            message: `[santé:${issue.dimension}] ${issue.message}`,
            suggestedAction: issue.suggestedAction,
            value,
            effort: EFFORT_FROM_KIND.health,
            affectedResources: issue.affectedResources,
            signature: `health:${issue.dimension}:${issue.message.slice(0, 40)}`,
          });
        }
      } catch { /* doctor best-effort (graph may be empty) */ }
    }

    const ranked = found.sort((a, b) => b.payoff - a.payoff || b.value - a.value);
    const limited = ranked.slice(0, opts.limit ?? 15);
    return { opportunities: limited, generatedAt: new Date().toISOString(), summary: buildSummary(limited) };
  }
}

function buildSummary(opportunities: Opportunity[]): string {
  if (opportunities.length === 0) {
    return "## 🔥 Opportunités\n\nAucune opportunité notable détectée pour le moment.";
  }
  const icon: Record<OpportunityKind, string> = {
    automation: "⚙️", optimization: "⚡", prevention: "🛡️", reliability: "🔧", health: "🩺",
  };
  const lines: string[] = [];
  lines.push(`## 🔥 Opportunités (${opportunities.length})`);
  lines.push("");
  lines.push(`> Leanna cherche activement du travail utile. Triées par rapport valeur/effort.`);
  lines.push("");
  opportunities.forEach((o, i) => {
    lines.push(`${i + 1}. ${icon[o.kind]} **${o.suggestedAction}** — ${o.message} _(valeur ${o.value}, effort ${o.effort}, payoff ${o.payoff})_`);
  });
  return lines.join("\n");
}

/** Shared singleton, mirroring the other knowledge engines. */
export const opportunityEngine = new OpportunityEngine();
