/**
 * ProjectProfile — "Project Intelligence Profile" (task.md §4, P0).
 *
 * Chaque projet a son propre cerveau : conventions, architecture, frameworks,
 * commandes de build/test, règles git, fichiers sensibles, stratégies efficaces
 * et stratégies qui échouent, préférences. Appris automatiquement et relu au
 * démarrage pour que « Leanna ne reparte jamais de zéro sur un projet ».
 *
 * Design (reuse, don't rebuild): this is an *aggregator*, not a new memory. It
 *   - detects stack/commands directly from the workspace (package.json + lockfiles),
 *   - reads effective/failing skills back from `strategyMemory`,
 *   - reads learned playbooks back from `playbookStore`,
 *   - summarises conventions/architecture already stored in `projectMemory`,
 *   - and records mission outcomes + preferences it is told about.
 *
 * Persistence mirrors StrategyMemory exactly: a per-workspace JSON file under
 * SELF_ROOT (`.Leanna/project-profile.json`), atomic tmp+rename, best-effort,
 * with an `ephemeral` mode for tests. Keyed by the active project id so switching
 * workspaces loads the right brain. Deterministic — never calls a model.
 */

import fs from "fs";
import path from "path";
import { SELF_ROOT, getActiveProjectId } from "../utils/selfRoot.js";
import { createLogger } from "../utils/logger.js";
import { strategyMemory, type StrategyMemory } from "./StrategyMemory.js";
import { playbookStore, type PlaybookStore } from "./PlaybookStore.js";
import { projectMemory, type ProjectMemory } from "./ProjectMemory.js";

const log = createLogger("ProjectProfile");

export type PackageManager = "npm" | "yarn" | "pnpm" | "bun" | "none";

/** Facts detected directly from the workspace filesystem. */
export interface DetectedStack {
  packageManager: PackageManager;
  /** Frameworks/libraries inferred from dependencies (react, vue, express…). */
  frameworks: string[];
  /** Languages inferred from config/extensions (typescript, javascript…). */
  languages: string[];
  /** npm scripts of interest, resolved to full commands. */
  commands: {
    build?: string;
    test?: string;
    lint?: string;
    dev?: string;
    typecheck?: string;
  };
  hasTests: boolean;
  hasTsConfig: boolean;
  isGit: boolean;
}

/** Strategy signals read back from the learning engines. */
export interface StrategyInsight {
  /** Skills with a strong recent success rate — prefer these. */
  effective: string[];
  /** Skills that fail repeatedly — avoid or replace these. */
  failing: string[];
  /** Learned playbooks: id → trigger signature. */
  playbooks: Array<{ id: string; triggerSignature: string; title: string; timesLearned: number }>;
}

/** Aggregate counts + highlights from ProjectMemory. */
export interface KnowledgeSummary {
  totalFacts: number;
  byCategory: Record<string, number>;
  /** A few high-value convention/architecture facts. */
  conventions: string[];
  architecture: string[];
}

export interface ProjectIntelligenceProfile {
  /** Stable workspace id (from getActiveProjectId); "" when no project is active. */
  projectId: string;
  projectName: string;
  detected: DetectedStack;
  strategies: StrategyInsight;
  knowledge: KnowledgeSummary;
  /** Free-form learned/declared preferences (e.g. "commitStyle": "conventional"). */
  preferences: Record<string, string>;
  missionStats: { completed: number; failed: number };
  createdAt: string;
  updatedAt: string;
}

const EMPTY_DETECTED: DetectedStack = {
  packageManager: "none",
  frameworks: [],
  languages: [],
  commands: {},
  hasTests: false,
  hasTsConfig: false,
  isGit: false,
};

function profilePath(): string {
  return path.join(SELF_ROOT || process.cwd(), ".Leanna", "project-profile.json");
}

function detectPackageManager(root: string): PackageManager {
  if (fs.existsSync(path.join(root, "bun.lockb"))) return "bun";
  if (fs.existsSync(path.join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(root, "yarn.lock"))) return "yarn";
  if (fs.existsSync(path.join(root, "package-lock.json")) || fs.existsSync(path.join(root, "package.json"))) return "npm";
  return "none";
}

/** Map well-known dependencies to a coarse framework label. */
const FRAMEWORK_HINTS: Array<[RegExp, string]> = [
  [/^react(-dom)?$/, "react"],
  [/^vue$/, "vue"],
  [/^svelte$/, "svelte"],
  [/^@angular\/core$/, "angular"],
  [/^next$/, "next"],
  [/^nuxt$/, "nuxt"],
  [/^express$/, "express"],
  [/^fastify$/, "fastify"],
  [/^@nestjs\/core$/, "nestjs"],
  [/^vite$/, "vite"],
  [/^webpack$/, "webpack"],
  [/^electron$/, "electron"],
  [/^vitest$/, "vitest"],
  [/^jest$/, "jest"],
  [/^tailwindcss$/, "tailwind"],
];

/**
 * Durable, per-workspace project intelligence. Aggregates signals rather than
 * owning them, so it stays consistent with the engines it reads from.
 */
export class ProjectProfile {
  private profile: ProjectIntelligenceProfile | undefined;
  private loadedFrom = "";
  private dirty = false;
  private readonly ephemeral: boolean;
  private readonly strategy: StrategyMemory;
  private readonly playbooks: PlaybookStore;
  private readonly memory: ProjectMemory;
  /** Optional override of the workspace root (tests). */
  private readonly rootOverride?: string;

  constructor(options: {
    ephemeral?: boolean;
    strategyMemory?: StrategyMemory;
    playbookStore?: PlaybookStore;
    projectMemory?: ProjectMemory;
    /** For tests: a concrete directory to detect the stack from. */
    root?: string;
  } = {}) {
    this.ephemeral = options.ephemeral === true;
    this.strategy = options.strategyMemory ?? strategyMemory;
    this.playbooks = options.playbookStore ?? playbookStore;
    this.memory = options.projectMemory ?? projectMemory;
    this.rootOverride = options.root;
  }

  private get root(): string {
    return this.rootOverride ?? SELF_ROOT ?? "";
  }

  /** Load lazily / reload when the active workspace changes. */
  private sync(): void {
    if (this.ephemeral) {
      if (!this.profile) this.profile = this.blank();
      return;
    }
    const target = profilePath();
    if (target === this.loadedFrom && this.profile) return;
    this.loadedFrom = target;
    this.profile = this.blank();
    try {
      if (fs.existsSync(target)) {
        const raw = JSON.parse(fs.readFileSync(target, "utf-8")) as Partial<ProjectIntelligenceProfile>;
        this.profile = {
          ...this.blank(),
          ...raw,
          detected: { ...EMPTY_DETECTED, ...(raw.detected ?? {}) },
          strategies: { effective: [], failing: [], playbooks: [], ...(raw.strategies ?? {}) },
          knowledge: { totalFacts: 0, byCategory: {}, conventions: [], architecture: [], ...(raw.knowledge ?? {}) },
          preferences: raw.preferences ?? {},
          missionStats: { completed: 0, failed: 0, ...(raw.missionStats ?? {}) },
        };
      }
    } catch (err) {
      log.warn(`Impossible de charger le profil projet: ${(err as Error).message}`);
      this.profile = this.blank();
    }
  }

  private blank(): ProjectIntelligenceProfile {
    const now = new Date().toISOString();
    return {
      projectId: this.ephemeral ? "ephemeral" : getActiveProjectId(),
      projectName: this.root ? path.basename(this.root) : "",
      detected: { ...EMPTY_DETECTED },
      strategies: { effective: [], failing: [], playbooks: [] },
      knowledge: { totalFacts: 0, byCategory: {}, conventions: [], architecture: [] },
      preferences: {},
      missionStats: { completed: 0, failed: 0 },
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Re-detect the stack from disk and re-aggregate strategy/knowledge signals.
   * Call at workspace open and after significant learning. Returns the profile.
   */
  refresh(): ProjectIntelligenceProfile {
    this.sync();
    const p = this.profile!;
    p.projectName = this.root ? path.basename(this.root) : p.projectName;
    if (!this.ephemeral) p.projectId = getActiveProjectId();
    p.detected = this.detectStack();
    p.strategies = this.aggregateStrategies();
    p.knowledge = this.summariseKnowledge();
    p.updatedAt = new Date().toISOString();
    this.dirty = true;
    this.save();
    return this.snapshot();
  }

  private detectStack(): DetectedStack {
    const root = this.root;
    if (!root) return { ...EMPTY_DETECTED };
    const detected: DetectedStack = {
      packageManager: detectPackageManager(root),
      frameworks: [],
      languages: [],
      commands: {},
      hasTests: false,
      hasTsConfig: fs.existsSync(path.join(root, "tsconfig.json")),
      isGit: fs.existsSync(path.join(root, ".git")),
    };
    if (detected.hasTsConfig) detected.languages.push("typescript");

    try {
      const pkgPath = path.join(root, "package.json");
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
          scripts?: Record<string, string>;
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        if (!detected.languages.includes("typescript")) detected.languages.push("javascript");

        const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
        const frameworks = new Set<string>();
        for (const name of Object.keys(deps)) {
          for (const [re, label] of FRAMEWORK_HINTS) {
            if (re.test(name)) frameworks.add(label);
          }
        }
        detected.frameworks = [...frameworks].sort();

        const scripts = pkg.scripts ?? {};
        const run = (script: string) => `${detected.packageManager === "none" ? "npm" : detected.packageManager} run ${script}`;
        const pick = (...names: string[]) => names.find((n) => scripts[n]);
        const build = pick("build");
        const test = pick("test", "tests", "test:unit");
        const lint = pick("lint", "lint:eslint");
        const dev = pick("dev", "start", "serve");
        const typecheck = pick("typecheck", "type-check", "tsc");
        if (build) detected.commands.build = run(build);
        if (test) { detected.commands.test = run(test); detected.hasTests = true; }
        if (lint) detected.commands.lint = run(lint);
        if (dev) detected.commands.dev = run(dev);
        if (typecheck) detected.commands.typecheck = run(typecheck);
      }
    } catch (err) {
      log.warn(`Lecture package.json ignorée: ${(err as Error).message}`);
    }

    // A test directory is also evidence of tests even without a test script.
    if (!detected.hasTests) {
      detected.hasTests = ["test", "tests", "__tests__", "spec"].some((d) =>
        fs.existsSync(path.join(root, d)),
      );
    }
    return detected;
  }

  private aggregateStrategies(): StrategyInsight {
    const insight: StrategyInsight = { effective: [], failing: [], playbooks: [] };
    try {
      const stats = this.strategy.getAllStats();
      insight.effective = stats
        .filter((s) => s.totalCalls >= 3 && s.recentSuccessRate >= 0.7)
        .sort((a, b) => b.recentSuccessRate - a.recentSuccessRate)
        .slice(0, 20)
        .map((s) => s.skillName);
      insight.failing = stats.filter((s) => s.failing).map((s) => s.skillName);
    } catch { /* best-effort */ }
    try {
      insight.playbooks = this.playbooks.list().slice(0, 20).map((p) => ({
        id: p.id,
        triggerSignature: p.triggerSignature,
        title: p.title,
        timesLearned: p.timesLearned,
      }));
    } catch { /* best-effort */ }
    return insight;
  }

  private summariseKnowledge(): KnowledgeSummary {
    const summary: KnowledgeSummary = { totalFacts: 0, byCategory: {}, conventions: [], architecture: [] };
    try {
      const facts = this.memory.getAllFacts();
      summary.totalFacts = facts.length;
      for (const fact of facts) {
        summary.byCategory[fact.category] = (summary.byCategory[fact.category] ?? 0) + 1;
      }
      const top = (category: string) =>
        facts
          .filter((f) => f.category === category)
          .sort((a, b) => (b.confidence * (1 + b.usageCount)) - (a.confidence * (1 + a.usageCount)))
          .slice(0, 5)
          .map((f) => (f.content.length > 120 ? f.content.slice(0, 120) + "…" : f.content));
      summary.conventions = top("convention");
      summary.architecture = top("architecture");
    } catch { /* best-effort */ }
    return summary;
  }

  /**
   * Record a terminal mission outcome. Strategy *reliability* is already tracked
   * by StrategyMemory per skill; here we only keep a coarse per-project tally so
   * the profile can report overall success at a glance.
   */
  recordMissionOutcome(success: boolean): void {
    this.sync();
    const p = this.profile!;
    if (success) p.missionStats.completed++;
    else p.missionStats.failed++;
    p.updatedAt = new Date().toISOString();
    this.dirty = true;
    this.save();
  }

  /** Record a learned/declared project preference (e.g. commit style, formatter). */
  setPreference(key: string, value: string): void {
    if (!key) return;
    this.sync();
    this.profile!.preferences[key] = value;
    this.profile!.updatedAt = new Date().toISOString();
    this.dirty = true;
    this.save();
  }

  /** Current profile snapshot (deep-ish copy to prevent external mutation). */
  getProfile(): ProjectIntelligenceProfile {
    this.sync();
    return this.snapshot();
  }

  private snapshot(): ProjectIntelligenceProfile {
    const p = this.profile!;
    return {
      ...p,
      detected: { ...p.detected, frameworks: [...p.detected.frameworks], languages: [...p.detected.languages], commands: { ...p.detected.commands } },
      strategies: { effective: [...p.strategies.effective], failing: [...p.strategies.failing], playbooks: p.strategies.playbooks.map((x) => ({ ...x })) },
      knowledge: { ...p.knowledge, byCategory: { ...p.knowledge.byCategory }, conventions: [...p.knowledge.conventions], architecture: [...p.knowledge.architecture] },
      preferences: { ...p.preferences },
      missionStats: { ...p.missionStats },
    };
  }

  /**
   * Compact Markdown summary for prompt injection — the read-back that lets
   * Leanna "never start from zero" on a project. Mirrors ProjectMemory.toContextSummary.
   */
  toContextSummary(): string {
    this.sync();
    const p = this.profile!;
    const lines: string[] = [];
    lines.push(`## 🧠 Profil du projet${p.projectName ? ` « ${p.projectName} »` : ""}`);

    const d = p.detected;
    const stack = [d.packageManager !== "none" ? d.packageManager : null, ...d.languages, ...d.frameworks].filter(Boolean);
    if (stack.length) lines.push(`- Stack : ${stack.join(", ")}`);
    const cmds = Object.entries(d.commands).filter(([, v]) => v).map(([k, v]) => `${k}=\`${v}\``);
    if (cmds.length) lines.push(`- Commandes : ${cmds.join(", ")}`);
    lines.push(`- Tests : ${d.hasTests ? "présents" : "aucun détecté"} · Git : ${d.isGit ? "oui" : "non"}`);

    if (p.strategies.effective.length) lines.push(`- Stratégies efficaces : ${p.strategies.effective.slice(0, 8).join(", ")}`);
    if (p.strategies.failing.length) lines.push(`- ⚠️ Outils peu fiables ici : ${p.strategies.failing.slice(0, 8).join(", ")}`);
    if (p.strategies.playbooks.length) {
      lines.push(`- Playbooks appris : ${p.strategies.playbooks.slice(0, 6).map((x) => `${x.id} (${x.title})`).join(", ")}`);
    }

    if (p.knowledge.conventions.length) {
      lines.push(`- Conventions :`);
      for (const c of p.knowledge.conventions) lines.push(`  - ${c}`);
    }
    const prefs = Object.entries(p.preferences);
    if (prefs.length) lines.push(`- Préférences : ${prefs.map(([k, v]) => `${k}=${v}`).join(", ")}`);
    if (p.missionStats.completed || p.missionStats.failed) {
      lines.push(`- Missions : ${p.missionStats.completed} réussies / ${p.missionStats.failed} échouées`);
    }

    return lines.join("\n");
  }

  /** Atomic best-effort persistence (tmp + rename), like StrategyMemory. */
  save(): void {
    if (this.ephemeral || !this.dirty || !this.profile) return;
    const target = this.loadedFrom || profilePath();
    try {
      const dir = path.dirname(target);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const payload = JSON.stringify({ version: 1, ...this.profile }, null, 2);
      const tmp = `${target}.tmp`;
      fs.writeFileSync(tmp, payload, "utf-8");
      fs.renameSync(tmp, target);
      this.dirty = false;
    } catch (err) {
      log.warn(`Écriture du profil projet échouée: ${(err as Error).message}`);
    }
  }

  /** Test/maintenance helper. */
  reset(): void {
    this.profile = this.blank();
    this.dirty = true;
    this.loadedFrom = "";
  }
}

/** Shared singleton, mirroring `strategyMemory` / `playbookStore` / `projectMemory`. */
export const projectProfile = new ProjectProfile();
