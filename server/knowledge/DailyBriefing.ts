/**
 * DailyBriefing — "Daily AI Briefing" (task.md §13).
 *
 *   ☀️ Bonjour. Voici ce que Leanna a détecté :
 *     🔴 2 problèmes critiques · 🟠 4 tâches en attente · 🟢 3 améliorations
 *   Recommandation : → corriger X → mettre à jour Y → lancer audit sécurité
 *   Et surtout : Leanna peut préparer automatiquement les missions.
 *
 * Design : COMPOSITION pure des moteurs déjà construits — ProjectDoctor (santé +
 * problèmes), OpportunityEngine (travail utile proactif), ProjectProfile (stack +
 * stats missions). Aucune nouvelle infra, aucun appel modèle. Le briefing range
 * les signaux en 3 paniers (critique / en attente / amélioration), produit des
 * missions recommandées prêtes à lancer, et un digest Markdown. La préparation
 * effective des missions reste derrière le pipeline/approbation existant.
 */

import { projectDoctor, type ProjectDoctor, type HealthReport } from "./ProjectDoctor.js";
import { opportunityEngine, type OpportunityEngine, type OpportunityReport } from "./OpportunityEngine.js";
import { projectProfile, type ProjectProfile } from "./ProjectProfile.js";

export type BriefingSeverity = "critical" | "pending" | "improvement";

/** One briefing item, bucketed by urgency. */
export interface BriefingItem {
  severity: BriefingSeverity;
  /** Where it came from (health / opportunity). */
  source: "health" | "opportunity";
  message: string;
  /** Recommended action (becomes a mission title if pre-staged). */
  suggestedAction: string;
  affectedResources: string[];
}

/** A mission the briefing recommends launching. */
export interface RecommendedMission {
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
}

export interface BriefingReport {
  greeting: string;
  /** Project name + overall health score. */
  projectName: string;
  healthScore: number;
  counts: { critical: number; pending: number; improvement: number };
  items: BriefingItem[];
  recommendedMissions: RecommendedMission[];
  /** Quick project facts (stack, mission win/loss). */
  highlights: string[];
  generatedAt: string;
  summary: string;
}

export interface DailyBriefingOptions {
  projectDoctor?: ProjectDoctor;
  opportunityEngine?: OpportunityEngine;
  projectProfile?: ProjectProfile;
}

const SEVERITY_TO_PRIORITY: Record<BriefingSeverity, RecommendedMission["priority"]> = {
  critical: "critical",
  pending: "high",
  improvement: "medium",
};

/** Deterministic morning digest composed from the knowledge engines. */
export class DailyBriefing {
  private readonly doctor: ProjectDoctor;
  private readonly opportunities: OpportunityEngine;
  private readonly profile: ProjectProfile;

  constructor(options: DailyBriefingOptions = {}) {
    this.doctor = options.projectDoctor ?? projectDoctor;
    this.opportunities = options.opportunityEngine ?? opportunityEngine;
    this.profile = options.projectProfile ?? projectProfile;
  }

  /**
   * Generate the briefing. `maxMissions` caps the pre-staged mission list.
   * `includeHealth` lets callers skip the (indexing-dependent) Doctor scan.
   */
  generate(opts: { maxMissions?: number; includeHealth?: boolean } = {}): BriefingReport {
    const items: BriefingItem[] = [];
    const seen = new Set<string>();
    const add = (item: BriefingItem) => {
      const key = `${item.source}:${item.message}`.slice(0, 120);
      if (seen.has(key)) return;
      seen.add(key);
      items.push(item);
    };

    // 1) Project health → critical/pending/improvement from Doctor issues.
    let health: HealthReport | undefined;
    if (opts.includeHealth !== false) {
      try {
        health = this.doctor.diagnose();
        for (const issue of health.issues) {
          const severity: BriefingSeverity =
            issue.severity === "critical" ? "critical"
              : issue.severity === "high" ? "pending"
                : "improvement";
          add({ severity, source: "health", message: `[${issue.dimension}] ${issue.message}`, suggestedAction: issue.suggestedAction, affectedResources: issue.affectedResources });
        }
      } catch { /* doctor best-effort (graph may be empty) */ }
    }

    // 2) Proactive opportunities → mostly improvements, high-value ones pending.
    let opportunities: OpportunityReport | undefined;
    try {
      opportunities = this.opportunities.scan({ includeHealth: false, limit: 10 });
      for (const opp of opportunities.opportunities) {
        const severity: BriefingSeverity = opp.value >= 80 ? "pending" : "improvement";
        add({ severity, source: "opportunity", message: opp.message, suggestedAction: opp.suggestedAction, affectedResources: opp.affectedResources });
      }
    } catch { /* opportunity best-effort */ }

    // 3) Project highlights from the profile.
    const highlights: string[] = [];
    let projectName = "";
    try {
      const p = this.profile.getProfile();
      projectName = p.projectName;
      const stack = [p.detected.packageManager !== "none" ? p.detected.packageManager : null, ...p.detected.frameworks].filter(Boolean);
      if (stack.length) highlights.push(`Stack : ${stack.join(", ")}`);
      if (!p.detected.hasTests) highlights.push("⚠️ Aucun test détecté");
      if (p.strategies.failing.length) highlights.push(`Outils peu fiables : ${p.strategies.failing.slice(0, 3).join(", ")}`);
      if (p.missionStats.completed || p.missionStats.failed) highlights.push(`Missions : ${p.missionStats.completed} ✓ / ${p.missionStats.failed} ✗`);
    } catch { /* profile best-effort */ }

    // Rank: critical first, then pending, then improvement.
    const order: BriefingSeverity[] = ["critical", "pending", "improvement"];
    items.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));

    const counts = {
      critical: items.filter((i) => i.severity === "critical").length,
      pending: items.filter((i) => i.severity === "pending").length,
      improvement: items.filter((i) => i.severity === "improvement").length,
    };

    // Pre-staged missions: top items by severity, bounded.
    const recommendedMissions: RecommendedMission[] = items
      .slice(0, opts.maxMissions ?? 5)
      .map((i) => ({ title: i.suggestedAction, description: `${i.message} ${i.suggestedAction}`.trim(), priority: SEVERITY_TO_PRIORITY[i.severity] }));

    const report: BriefingReport = {
      greeting: "☀️ Bonjour. Voici ce que Leanna a détecté :",
      projectName,
      healthScore: health?.global ?? 0,
      counts,
      items,
      recommendedMissions,
      highlights,
      generatedAt: new Date().toISOString(),
      summary: "",
    };
    report.summary = buildSummary(report, Boolean(health));
    return report;
  }
}

function buildSummary(r: BriefingReport, hasHealth: boolean): string {
  const lines: string[] = [];
  lines.push(r.greeting);
  lines.push("");
  lines.push(`🔴 ${r.counts.critical} problème(s) critique(s) · 🟠 ${r.counts.pending} en attente · 🟢 ${r.counts.improvement} amélioration(s)`);
  if (r.projectName || hasHealth) {
    lines.push("");
    lines.push(`Projet ${r.projectName || "actif"}${hasHealth ? ` — santé ${r.healthScore}/100` : ""}`);
  }
  for (const h of r.highlights) lines.push(`• ${h}`);

  const bucket = (sev: BriefingSeverity, label: string, icon: string) => {
    const list = r.items.filter((i) => i.severity === sev);
    if (list.length === 0) return;
    lines.push("");
    lines.push(`${icon} ${label}`);
    for (const i of list.slice(0, 6)) lines.push(`  - ${i.message}`);
  };
  bucket("critical", "Critiques", "🔴");
  bucket("pending", "En attente", "🟠");
  bucket("improvement", "Améliorations", "🟢");

  if (r.recommendedMissions.length) {
    lines.push("");
    lines.push(`Recommandation (Leanna peut préparer ces missions) :`);
    r.recommendedMissions.forEach((m, i) => lines.push(`  ${i + 1}. (${m.priority}) ${m.title}`));
  }
  return lines.join("\n");
}

/** Shared singleton. */
export const dailyBriefing = new DailyBriefing();
