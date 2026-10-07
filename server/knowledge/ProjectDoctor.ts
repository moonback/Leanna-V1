/**
 * ProjectDoctor — "AI Project Doctor" (task.md §5, P0).
 *
 * Un bouton « Diagnostiquer mon projet » : Leanna scanne l'architecture, la
 * qualité, la sécurité, les dépendances, la performance, les tests, git et la
 * dette technique, produit un PROJECT HEALTH par dimension + un score global,
 * puis — surtout — génère les missions nécessaires pour améliorer le score.
 *
 *   Score 80 → 12 problèmes → priorisation → plan d'amélioration → missions
 *
 * Design (reuse, don't rebuild): the Doctor is an *aggregator + scorer*. It reads
 * signals that already exist — KnowledgeGraph stats, DependencyGraph cycles /
 * critical modules, ProjectProfile (stack/commands/tests/strategies), ProjectMemory
 * (known-bugs / todos), StrategyMemory (failing skills) — and turns the gaps into
 * prioritized improvement mission requests. It never executes anything itself and
 * never calls a model; mission launch stays behind the existing pipeline.
 */

import { knowledgeGraph, type KnowledgeGraph } from "./KnowledgeGraph.js";
import { dependencyGraph, type DependencyGraph } from "./DependencyGraph.js";
import { projectProfile, type ProjectProfile } from "./ProjectProfile.js";
import { projectMemory, type ProjectMemory } from "./ProjectMemory.js";
import { strategyMemory, type StrategyMemory } from "./StrategyMemory.js";
import type { DetectedStack } from "./ProjectProfile.js";

export type HealthDimension =
  | "architecture"
  | "security"
  | "tests"
  | "performance"
  | "technicalDebt"
  | "maintainability"
  | "autonomy";

export type IssueSeverity = "critical" | "high" | "medium" | "low";

/** One concrete finding, tied to the dimension it degrades. */
export interface HealthIssue {
  dimension: HealthDimension;
  severity: IssueSeverity;
  /** User-facing description, e.g. "3 cycles de dépendance détectés". */
  message: string;
  /** How many points this issue removed from its dimension (for transparency). */
  penalty: number;
  /** Files/resources concerned, when known. */
  affectedResources: string[];
  /** The improvement action proposed to fix it (mission title). */
  suggestedAction: string;
}

/** A ready-to-launch improvement proposal derived from the top issues. */
export interface ImprovementMissionRequest {
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
  dimension: HealthDimension;
  affectedResources: string[];
}

export interface HealthReport {
  /** Per-dimension score 0..100. */
  scores: Record<HealthDimension, number>;
  /** Weighted global score 0..100. */
  global: number;
  issues: HealthIssue[];
  /** Prioritized improvement missions to raise the score. */
  improvementMissions: ImprovementMissionRequest[];
  generatedAt: string;
  /** Compact Markdown report for display / prompt injection. */
  summary: string;
}

/** Weights for the global score. Autonomy is Leanna-specific and lighter. */
const DIMENSION_WEIGHTS: Record<HealthDimension, number> = {
  architecture: 0.18,
  security: 0.2,
  tests: 0.16,
  performance: 0.12,
  technicalDebt: 0.14,
  maintainability: 0.14,
  autonomy: 0.06,
};

const SEVERITY_PRIORITY: Record<IssueSeverity, ImprovementMissionRequest["priority"]> = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
};

const clampScore = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

export interface ProjectDoctorOptions {
  knowledgeGraph?: KnowledgeGraph;
  dependencyGraph?: DependencyGraph;
  projectProfile?: ProjectProfile;
  projectMemory?: ProjectMemory;
  strategyMemory?: StrategyMemory;
}

/**
 * Optional externally-sourced security result (e.g. from the async `npm audit`
 * security-audit skill), folded into the security dimension when provided.
 */
export interface SecuritySignal {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

/** Deterministic project health diagnosis + improvement mission generation. */
export class ProjectDoctor {
  private readonly kg: KnowledgeGraph;
  private readonly deps: DependencyGraph;
  private readonly profile: ProjectProfile;
  private readonly memory: ProjectMemory;
  private readonly strategy: StrategyMemory;

  constructor(options: ProjectDoctorOptions = {}) {
    this.kg = options.knowledgeGraph ?? knowledgeGraph;
    this.deps = options.dependencyGraph ?? dependencyGraph;
    this.profile = options.projectProfile ?? projectProfile;
    this.memory = options.projectMemory ?? projectMemory;
    this.strategy = options.strategyMemory ?? strategyMemory;
  }

  /**
   * Run a full diagnosis. `security` is optional: pass the result of the async
   * security-audit skill to fold real advisory counts into the security score;
   * omitted, security is scored from a lightweight heuristic.
   */
  diagnose(opts: { security?: SecuritySignal } = {}): HealthReport {
    const issues: HealthIssue[] = [];
    const scores = {
      architecture: this.scoreArchitecture(issues),
      security: this.scoreSecurity(issues, opts.security),
      tests: this.scoreTests(issues),
      performance: this.scorePerformance(issues),
      technicalDebt: this.scoreTechnicalDebt(issues),
      maintainability: this.scoreMaintainability(issues),
      autonomy: this.scoreAutonomy(issues),
    } satisfies Record<HealthDimension, number>;

    const global = clampScore(
      (Object.entries(scores) as Array<[HealthDimension, number]>).reduce(
        (sum, [dim, score]) => sum + score * DIMENSION_WEIGHTS[dim],
        0,
      ),
    );

    const improvementMissions = this.buildImprovementMissions(issues);
    const generatedAt = new Date().toISOString();
    const summary = this.buildSummary(scores, global, issues, improvementMissions);

    return { scores, global, issues, improvementMissions, generatedAt, summary };
  }

  // ─── Dimension scorers ───────────────────────────────────────────────────────

  private scoreArchitecture(issues: HealthIssue[]): number {
    let score = 100;
    try {
      const cycles = this.deps.detectCycles();
      if (cycles.length > 0) {
        const penalty = Math.min(45, 12 + cycles.length * 8);
        score -= penalty;
        issues.push({
          dimension: "architecture",
          severity: cycles.length >= 3 ? "high" : "medium",
          message: `${cycles.length} cycle(s) de dépendance détecté(s).`,
          penalty,
          affectedResources: cycles.flatMap((c) => c.files).slice(0, 10),
          suggestedAction: "Casser les cycles de dépendance pour découpler les modules.",
        });
      }
      const critical = this.deps.getCriticalModules(12);
      if (critical.length > 0) {
        const penalty = Math.min(25, critical.length * 6);
        score -= penalty;
        issues.push({
          dimension: "architecture",
          severity: critical.length >= 3 ? "medium" : "low",
          message: `${critical.length} module(s) très partagé(s) (couplage élevé).`,
          penalty,
          affectedResources: critical.slice(0, 8).map((m) => m.filePath),
          suggestedAction: "Introduire des interfaces/abstractions pour réduire le couplage des modules critiques.",
        });
      }
    } catch { /* graph may be empty before indexing */ }
    return clampScore(score);
  }

  private scoreSecurity(issues: HealthIssue[], signal?: SecuritySignal): number {
    let score = 100;
    if (signal) {
      const penalty = Math.min(100, signal.critical * 30 + signal.high * 15 + signal.medium * 5 + signal.low * 1);
      score -= penalty;
      if (signal.critical + signal.high > 0) {
        issues.push({
          dimension: "security",
          severity: signal.critical > 0 ? "critical" : "high",
          message: `Vulnérabilités de dépendances : ${signal.critical} critiques, ${signal.high} élevées.`,
          penalty,
          affectedResources: [],
          suggestedAction: "Mettre à jour les dépendances vulnérables (npm audit fix / montées de version ciblées).",
        });
      }
    } else {
      // Lightweight heuristic when no audit was run: lockfile presence is a
      // minimum hygiene signal (reproducible installs).
      const d = this.safeProfile().detected;
      if (d.packageManager !== "none" && !d.hasTsConfig && d.languages.includes("javascript")) {
        // JS-only projects miss compile-time safety; a soft nudge, not a hard fail.
        score -= 8;
      }
    }
    return clampScore(score);
  }

  private scoreTests(issues: HealthIssue[]): number {
    const d = this.safeProfile().detected;
    let score = 100;
    if (!d.hasTests) {
      score -= 55;
      issues.push({
        dimension: "tests",
        severity: "high",
        message: "Aucun test détecté dans le projet.",
        penalty: 55,
        affectedResources: [],
        suggestedAction: "Mettre en place un harnais de tests et couvrir les chemins critiques.",
      });
    } else if (!d.commands.test) {
      score -= 20;
      issues.push({
        dimension: "tests",
        severity: "medium",
        message: "Des tests existent mais aucune commande de test n'est configurée.",
        penalty: 20,
        affectedResources: [],
        suggestedAction: "Ajouter un script `test` au package.json pour exécuter la suite.",
      });
    }
    return clampScore(score);
  }

  private scorePerformance(issues: HealthIssue[]): number {
    let score = 100;
    try {
      const stats = this.kg.getStats();
      // Oversized files are a proxy for hot, hard-to-optimize modules.
      const big = this.kg.getAllFiles().filter((f) => (f.lines ?? 0) > 800);
      if (big.length > 0) {
        const penalty = Math.min(30, big.length * 5);
        score -= penalty;
        issues.push({
          dimension: "performance",
          severity: big.length >= 5 ? "medium" : "low",
          message: `${big.length} fichier(s) très volumineux (>800 lignes).`,
          penalty,
          affectedResources: big.slice(0, 8).map((f) => f.path),
          suggestedAction: "Découper les fichiers volumineux et profiler les chemins chauds.",
        });
      }
      void stats;
    } catch { /* graph may be empty */ }
    return clampScore(score);
  }

  private scoreTechnicalDebt(issues: HealthIssue[]): number {
    let score = 100;
    try {
      const bugs = this.memory.getAllFacts("known-bug");
      const todos = this.memory.getAllFacts("todo");
      if (bugs.length > 0) {
        const penalty = Math.min(35, bugs.length * 7);
        score -= penalty;
        issues.push({
          dimension: "technicalDebt",
          severity: bugs.length >= 3 ? "high" : "medium",
          message: `${bugs.length} bug(s) connu(s) non résolu(s).`,
          penalty,
          affectedResources: bugs.slice(0, 8).map((f) => f.sourceFile ?? "").filter(Boolean),
          suggestedAction: "Résoudre les bugs connus consignés en mémoire projet.",
        });
      }
      if (todos.length > 3) {
        const penalty = Math.min(20, (todos.length - 3) * 3);
        score -= penalty;
        issues.push({
          dimension: "technicalDebt",
          severity: "low",
          message: `${todos.length} TODO(s) en attente.`,
          penalty,
          affectedResources: [],
          suggestedAction: "Trier et traiter les TODOs accumulés.",
        });
      }
    } catch { /* memory may be empty */ }
    return clampScore(score);
  }

  private scoreMaintainability(issues: HealthIssue[]): number {
    let score = 100;
    try {
      const stats = this.kg.getStats();
      if (stats.averageFileSize > 300) {
        const penalty = Math.min(25, Math.round((stats.averageFileSize - 300) / 40));
        score -= penalty;
        issues.push({
          dimension: "maintainability",
          severity: stats.averageFileSize > 500 ? "medium" : "low",
          message: `Taille moyenne de fichier élevée (${Math.round(stats.averageFileSize)} lignes).`,
          penalty,
          affectedResources: [],
          suggestedAction: "Refactoriser vers des unités plus petites et cohérentes.",
        });
      }
      const d = this.safeProfile().detected;
      if (d.packageManager !== "none" && !d.commands.lint) {
        score -= 12;
        issues.push({
          dimension: "maintainability",
          severity: "low",
          message: "Aucune commande de lint configurée.",
          penalty: 12,
          affectedResources: [],
          suggestedAction: "Configurer un linter et un script `lint`.",
        });
      }
    } catch { /* graph may be empty */ }
    return clampScore(score);
  }

  private scoreAutonomy(issues: HealthIssue[]): number {
    let score = 100;
    try {
      const failing = this.strategy.getFailingSkills();
      if (failing.length > 0) {
        const penalty = Math.min(40, failing.length * 10);
        score -= penalty;
        issues.push({
          dimension: "autonomy",
          severity: failing.length >= 3 ? "high" : "medium",
          message: `${failing.length} outil(s) peu fiable(s) sur ce projet.`,
          penalty,
          affectedResources: failing.map((s) => s.skillName),
          suggestedAction: "Analyser les échecs d'outils récurrents et adopter des stratégies alternatives.",
        });
      }
    } catch { /* strategy memory may be empty */ }
    return clampScore(score);
  }

  // ─── Mission generation ──────────────────────────────────────────────────────

  /**
   * Turn the diagnosed issues into prioritized improvement missions — the core
   * value of the Doctor ("Leanna crée elle-même les missions nécessaires pour
   * améliorer le score"). Ordered by severity then penalty; bounded.
   */
  buildImprovementMissions(issues: HealthIssue[]): ImprovementMissionRequest[] {
    const order: IssueSeverity[] = ["critical", "high", "medium", "low"];
    const ranked = [...issues].sort(
      (a, b) => order.indexOf(a.severity) - order.indexOf(b.severity) || b.penalty - a.penalty,
    );
    return ranked.slice(0, 10).map((issue) => ({
      title: issue.suggestedAction,
      description: `${issue.message} ${issue.suggestedAction}`.trim(),
      priority: SEVERITY_PRIORITY[issue.severity],
      dimension: issue.dimension,
      affectedResources: issue.affectedResources,
    }));
  }

  // ─── Reporting ─────────────────────────────────────────────────────────────

  private buildSummary(
    scores: Record<HealthDimension, number>,
    global: number,
    issues: HealthIssue[],
    missions: ImprovementMissionRequest[],
  ): string {
    const label: Record<HealthDimension, string> = {
      architecture: "Architecture",
      security: "Sécurité",
      tests: "Tests",
      performance: "Performance",
      technicalDebt: "Dette technique",
      maintainability: "Maintenabilité",
      autonomy: "Autonomie",
    };
    const bar = (n: number) => (n >= 85 ? "🟢" : n >= 70 ? "🟡" : n >= 50 ? "🟠" : "🔴");
    const lines: string[] = [];
    lines.push(`# PROJECT HEALTH`);
    lines.push("");
    for (const dim of Object.keys(scores) as HealthDimension[]) {
      lines.push(`${bar(scores[dim])} ${label[dim].padEnd(16)} ${String(scores[dim]).padStart(3)}/100`);
    }
    lines.push("");
    lines.push(`${bar(global)} **GLOBAL** ${String(global).padStart(3)}/100`);
    if (issues.length > 0) {
      lines.push("");
      lines.push(`## ${issues.length} problème(s) détecté(s)`);
      for (const issue of issues) {
        const icon = issue.severity === "critical" ? "🔴" : issue.severity === "high" ? "🟠" : issue.severity === "medium" ? "🟡" : "🟢";
        lines.push(`- ${icon} [${issue.dimension}] ${issue.message}`);
      }
    }
    if (missions.length > 0) {
      lines.push("");
      lines.push(`## Plan d'amélioration (${missions.length} mission(s))`);
      missions.forEach((m, i) => lines.push(`${i + 1}. (${m.priority}) ${m.title}`));
    }
    return lines.join("\n");
  }

  private safeProfile(): { detected: DetectedStack } {
    try {
      return this.profile.getProfile();
    } catch {
      const detected: DetectedStack = {
        packageManager: "none",
        frameworks: [],
        languages: [],
        commands: {},
        hasTests: false,
        hasTsConfig: false,
        isGit: false,
      };
      return { detected };
    }
  }
}

/** Shared singleton, mirroring the other knowledge engines. */
export const projectDoctor = new ProjectDoctor();
