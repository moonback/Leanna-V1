/**
 * PlaybookStore — durable, cross-mission *playbooks* learned automatically.
 *
 * Positioning (task.md §3, P0 "Playbooks appris automatiquement"):
 *   Mission réussie → analyse de la stratégie → détection d'un pattern
 *   réutilisable → création d'un Playbook. Plus tard : « J'ai déjà résolu 6
 *   problèmes similaires. Je vais utiliser le Playbook TS-ERROR-001. »
 *
 * Design (reuse, don't rebuild):
 *   - This is NOT a replacement for LearningEngine. LearningEngine produces
 *     qualitative *prose lessons* in ProjectMemory; this store captures the
 *     complementary signal LearningEngine does not: a *replayable, ordered
 *     sequence of skills* keyed by a stable trigger signature, with reuse stats.
 *   - Persistence mirrors StrategyMemory exactly: a per-workspace JSON file under
 *     SELF_ROOT (`.Leanna/playbooks.json`) written atomically (tmp + rename),
 *     fully optional and best-effort — any I/O error degrades to in-memory only
 *     and never throws into the mission loop. `ephemeral` isolates tests.
 *
 * Deterministic. Never calls a model.
 */

import fs from "fs";
import path from "path";
import { SELF_ROOT } from "../utils/selfRoot.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("PlaybookStore");

/** One ordered step of a playbook: a skill/tool to run. */
export interface PlaybookStep {
  order: number;
  skillName: string;
}

/** A reusable, replayable strategy learned from one or more successful missions. */
export interface Playbook {
  /** Human-readable stable id, e.g. "PLAYBOOK-TS-ERROR-001". */
  id: string;
  /** Normalized signature of the problem class this playbook solves. */
  triggerSignature: string;
  /** Short label, e.g. "Corriger erreur TypeScript". */
  title: string;
  /** Ordered skills to execute. */
  steps: PlaybookStep[];
  /** How many successful missions contributed to (reinforced) this playbook. */
  timesLearned: number;
  /** How many times it was proposed/matched for reuse. */
  timesMatched: number;
  /** Files frequently touched by missions of this class (hints, bounded). */
  relatedFiles: string[];
  /** A few example mission ids that produced this playbook. */
  exampleMissionIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Minimal view of a completed mission the store needs. Mirrors MissionState. */
export interface PlaybookMissionInput {
  id: string;
  title: string;
  status: string;
  goals: Record<string, {
    status: string;
    dependsOn?: string[];
    completedAt?: string;
    plannedActions: Array<{ skillName: string; order: number; status: string }>;
    parentId?: string | null;
  }>;
  errors: Array<{ action?: string; error: string }>;
  relevantFiles: string[];
}

const MAX_PLAYBOOKS = 300;
const MAX_RELATED_FILES = 10;
const MAX_EXAMPLE_MISSIONS = 10;
/** A playbook needs at least this many steps to be worth storing. */
const MIN_STEPS = 2;

function getStorePath(): string {
  return path.join(SELF_ROOT || process.cwd(), ".Leanna", "playbooks.json");
}

/**
 * Normalise un texte d'erreur en une famille stable : retire chemins, IP, hex,
 * numéros de ligne/colonne, puis minuscule. Même recette que LearningEngine
 * (répliquée car la fonction y est privée) afin que les signatures soient
 * cohérentes entre les deux moteurs.
 */
function normalizeError(message: string): string {
  return message
    .replace(/[A-Z]:\\[^:\s"']+/g, "<PATH>")
    .replace(/\/[^:\s"']{10,}/g, "<PATH>")
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, "<IP>")
    .replace(/\b0x[0-9a-f]+\b/gi, "<HEX>")
    .replace(/line\s+\d+/gi, "line <N>")
    .replace(/column\s+\d+/gi, "column <N>")
    .toLowerCase()
    .trim();
}

/** Extract a coarse error-family token, e.g. "ts2345", "eslint", "enoent". */
function errorFamily(message: string): string | undefined {
  const norm = normalizeError(message);
  const ts = norm.match(/ts\d{3,5}/);
  if (ts) return "ts-error";
  if (/typescript|type error|type '.*' is not assignable/.test(norm)) return "ts-error";
  if (/eslint|lint/.test(norm)) return "lint-error";
  if (/enoent|no such file|not found/.test(norm)) return "missing-file";
  if (/test(s)? failed|assert|expect/.test(norm)) return "test-failure";
  if (/timeout|timed out/.test(norm)) return "timeout";
  if (/permission|denied|eacces/.test(norm)) return "permission";
  if (/network|econnrefused|fetch failed/.test(norm)) return "network";
  return undefined;
}

/** Coarse keyword from a mission title/objective, used when no error is present. */
function titleFamily(title: string): string {
  const t = title.toLowerCase();
  if (/typescript|\bts\b|type/.test(t)) return "ts";
  if (/test|spec|vitest|jest/.test(t)) return "test";
  if (/refactor|clean|rename/.test(t)) return "refactor";
  if (/perf|performance|optimi/.test(t)) return "perf";
  if (/security|secure|vuln|audit/.test(t)) return "security";
  if (/doc|readme|comment/.test(t)) return "docs";
  if (/depend|upgrade|bump|version/.test(t)) return "deps";
  if (/build|compile|bundle/.test(t)) return "build";
  if (/fix|bug|error|repair|corrige|récup|recup/.test(t)) return "fix";
  return "generic";
}

/**
 * Derive a stable trigger signature + readable title for a mission. The signature
 * keys the playbook (same class of problem → same playbook), so it is deliberately
 * resource-independent (no file paths / ids), exactly like the goal-dedup
 * philosophy in AutonomousExecutive.
 */
function deriveTrigger(input: PlaybookMissionInput): { signature: string; title: string } {
  const families = new Set<string>();
  for (const e of input.errors) {
    const fam = errorFamily(e.error);
    if (fam) families.add(fam);
  }
  if (families.size > 0) {
    const sorted = [...families].sort();
    return {
      signature: sorted.join("+"),
      title: sorted.length === 1 ? titleForFamily(sorted[0]) : `Résoudre: ${sorted.join(", ")}`,
    };
  }
  const fam = titleFamily(input.title);
  return { signature: `objective:${fam}`, title: titleForFamily(fam) };
}

function titleForFamily(family: string): string {
  switch (family) {
    case "ts-error": case "ts": return "Corriger erreur TypeScript";
    case "lint-error": return "Corriger erreurs de lint";
    case "missing-file": return "Résoudre un fichier manquant";
    case "test-failure": case "test": return "Réparer les tests en échec";
    case "timeout": return "Résoudre un dépassement de délai";
    case "permission": return "Résoudre un refus de permission";
    case "network": return "Résoudre une erreur réseau";
    case "refactor": return "Refactoriser le code";
    case "perf": return "Optimiser les performances";
    case "security": return "Renforcer la sécurité";
    case "docs": return "Mettre à jour la documentation";
    case "deps": return "Mettre à jour les dépendances";
    case "build": return "Réparer le build";
    case "fix": return "Corriger un bug";
    default: return "Stratégie réutilisable";
  }
}

/**
 * Topologically order goals by `dependsOn` (falling back to completion time),
 * then concatenate each goal's successful actions sorted by `order`. This yields
 * a globally-correct skill sequence across dependency "waves".
 */
function orderedSkillSequence(input: PlaybookMissionInput): string[] {
  const goals = Object.entries(input.goals)
    // Only leaf/sub-goals carry real work; the root goal aggregates.
    .filter(([, g]) => g.parentId !== null && g.status === "completed");

  const idByEntry = new Map(goals.map(([id]) => [id, true]));
  const indegree = new Map<string, number>();
  const order: string[] = [];
  for (const [id, g] of goals) {
    const deps = (g.dependsOn ?? []).filter((d) => idByEntry.has(d));
    indegree.set(id, deps.length);
  }
  // Kahn's algorithm; ties broken by completedAt then insertion order.
  const ready = goals
    .filter(([id]) => (indegree.get(id) ?? 0) === 0)
    .map(([id]) => id);
  const byTime = (a: string, b: string) =>
    Date.parse(input.goals[a].completedAt ?? "") - Date.parse(input.goals[b].completedAt ?? "");
  ready.sort(byTime);
  const emitted = new Set<string>();
  while (ready.length > 0) {
    const id = ready.shift()!;
    if (emitted.has(id)) continue;
    emitted.add(id);
    order.push(id);
    for (const [other, g] of goals) {
      if (emitted.has(other)) continue;
      if ((g.dependsOn ?? []).includes(id)) {
        indegree.set(other, (indegree.get(other) ?? 1) - 1);
        if ((indegree.get(other) ?? 0) <= 0 && !ready.includes(other)) ready.push(other);
      }
    }
    ready.sort(byTime);
  }
  // Any goals left out of the topo order (cycles / missing deps) appended by time.
  for (const [id] of goals.sort(([a], [b]) => byTime(a, b))) {
    if (!emitted.has(id)) { emitted.add(id); order.push(id); }
  }

  const skills: string[] = [];
  for (const goalId of order) {
    const actions = input.goals[goalId].plannedActions
      .filter((a) => a.status === "completed")
      .sort((a, b) => a.order - b.order);
    for (const a of actions) {
      if (a.skillName) skills.push(a.skillName);
    }
  }
  return skills;
}

/** Collapse immediate duplicate skills (a retry loop re-running the same skill). */
function dedupeConsecutive(skills: string[]): string[] {
  const out: string[] = [];
  for (const s of skills) {
    if (out[out.length - 1] !== s) out.push(s);
  }
  return out;
}

export class PlaybookStore {
  private playbooks = new Map<string, Playbook>();
  private loadedFrom = "";
  private dirty = false;
  private readonly ephemeral: boolean;
  /** Monotonic per-signature counter feeding the human-readable id suffix. */
  private seq = new Map<string, number>();

  constructor(options: { ephemeral?: boolean } = {}) {
    this.ephemeral = options.ephemeral === true;
  }

  /** Load lazily / reload when the active workspace (SELF_ROOT) changes. */
  private sync(): void {
    if (this.ephemeral) return;
    const target = getStorePath();
    if (target === this.loadedFrom) return;
    this.loadedFrom = target;
    this.playbooks.clear();
    this.seq.clear();
    try {
      if (fs.existsSync(target)) {
        const raw = JSON.parse(fs.readFileSync(target, "utf-8")) as { playbooks?: Playbook[] };
        for (const p of raw.playbooks ?? []) {
          if (p && typeof p.triggerSignature === "string" && Array.isArray(p.steps)) {
            this.playbooks.set(p.triggerSignature, {
              id: p.id,
              triggerSignature: p.triggerSignature,
              title: p.title ?? p.triggerSignature,
              steps: p.steps.map((s, i) => ({ order: Number(s.order) || i, skillName: String(s.skillName) })),
              timesLearned: Number(p.timesLearned) || 1,
              timesMatched: Number(p.timesMatched) || 0,
              relatedFiles: Array.isArray(p.relatedFiles) ? p.relatedFiles.slice(0, MAX_RELATED_FILES) : [],
              exampleMissionIds: Array.isArray(p.exampleMissionIds) ? p.exampleMissionIds.slice(0, MAX_EXAMPLE_MISSIONS) : [],
              createdAt: p.createdAt ?? new Date().toISOString(),
              updatedAt: p.updatedAt ?? new Date().toISOString(),
            });
          }
        }
      }
    } catch (err) {
      log.warn(`Impossible de charger les playbooks: ${(err as Error).message}`);
      this.playbooks.clear();
    }
  }

  /**
   * Analyse a completed mission and upsert its playbook. No-op (returns
   * undefined) when the mission did not complete or produced too few steps to be
   * reusable. Best-effort: never throws into the mission loop.
   */
  learnFromMission(input: PlaybookMissionInput): Playbook | undefined {
    try {
      if (input.status !== "completed") return undefined;
      this.sync();

      const steps = dedupeConsecutive(orderedSkillSequence(input));
      if (steps.length < MIN_STEPS) return undefined;

      const { signature, title } = deriveTrigger(input);
      const existing = this.playbooks.get(signature);

      if (existing) {
        // Reinforce: keep the strategy that keeps working. Replace the step
        // sequence only when the new mission is at least as detailed, so a
        // richer successful run can refine the playbook over time.
        if (steps.length >= existing.steps.length) {
          existing.steps = steps.map((skillName, i) => ({ order: i, skillName }));
        }
        existing.timesLearned++;
        existing.relatedFiles = mergeBounded(existing.relatedFiles, input.relevantFiles, MAX_RELATED_FILES);
        existing.exampleMissionIds = mergeBounded(existing.exampleMissionIds, [input.id], MAX_EXAMPLE_MISSIONS);
        existing.updatedAt = new Date().toISOString();
        this.dirty = true;
        this.save();
        return existing;
      }

      const playbook: Playbook = {
        id: this.nextId(signature),
        triggerSignature: signature,
        title,
        steps: steps.map((skillName, i) => ({ order: i, skillName })),
        timesLearned: 1,
        timesMatched: 0,
        relatedFiles: input.relevantFiles.slice(0, MAX_RELATED_FILES),
        exampleMissionIds: [input.id],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.playbooks.set(signature, playbook);
      this.dirty = true;
      if (this.playbooks.size > MAX_PLAYBOOKS) this.prune();
      this.save();
      return playbook;
    } catch (err) {
      log.warn(`Apprentissage de playbook ignoré: ${(err as Error).message}`);
      return undefined;
    }
  }

  /**
   * Find a playbook matching a new objective/error. Derives the same signature
   * used at learn time, so an identical problem class resolves to its playbook.
   * Increments `timesMatched` on a hit (so reuse is observable).
   */
  findMatching(query: { title?: string; description?: string; errors?: string[] }): Playbook | undefined {
    this.sync();
    const synthetic: PlaybookMissionInput = {
      id: "query",
      title: query.title ?? query.description ?? "",
      status: "completed",
      goals: {},
      errors: (query.errors ?? []).map((error) => ({ error })),
      relevantFiles: [],
    };
    const { signature } = deriveTrigger(synthetic);
    const hit = this.playbooks.get(signature);
    if (hit) {
      hit.timesMatched++;
      this.dirty = true;
      this.save();
    }
    return hit;
  }

  /** Playbook for an exact signature, if any. Read-only (no match counting). */
  getBySignature(signature: string): Playbook | undefined {
    this.sync();
    return this.playbooks.get(signature);
  }

  /** All known playbooks, most reinforced first. */
  list(): Playbook[] {
    this.sync();
    return [...this.playbooks.values()].sort((a, b) => b.timesLearned - a.timesLearned);
  }

  private nextId(signature: string): string {
    const slug = signature.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "GENERIC";
    const n = (this.seq.get(slug) ?? this.countWithSlug(slug)) + 1;
    this.seq.set(slug, n);
    return `PLAYBOOK-${slug}-${String(n).padStart(3, "0")}`;
  }

  private countWithSlug(slug: string): number {
    let max = 0;
    for (const p of this.playbooks.values()) {
      const m = p.id.match(new RegExp(`^PLAYBOOK-${slug}-(\\d+)$`));
      if (m) max = Math.max(max, Number(m[1]));
    }
    return max;
  }

  private prune(): void {
    const sorted = [...this.playbooks.values()].sort(
      (a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt),
    );
    const toRemove = sorted.slice(0, this.playbooks.size - Math.floor(MAX_PLAYBOOKS * 0.9));
    for (const p of toRemove) this.playbooks.delete(p.triggerSignature);
  }

  /** Atomic best-effort persistence (tmp + rename), like StrategyMemory. */
  save(): void {
    if (this.ephemeral || !this.dirty) return;
    const target = this.loadedFrom || getStorePath();
    try {
      const dir = path.dirname(target);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const payload = JSON.stringify(
        { version: 1, updatedAt: new Date().toISOString(), playbooks: [...this.playbooks.values()] },
        null,
        2,
      );
      const tmp = `${target}.tmp`;
      fs.writeFileSync(tmp, payload, "utf-8");
      fs.renameSync(tmp, target);
      this.dirty = false;
    } catch (err) {
      log.warn(`Écriture des playbooks échouée: ${(err as Error).message}`);
    }
  }

  /** Test/maintenance helper. */
  reset(): void {
    this.playbooks.clear();
    this.seq.clear();
    this.dirty = true;
    this.loadedFrom = "";
  }
}

function mergeBounded(current: string[], incoming: string[], max: number): string[] {
  const set = new Set(current);
  for (const item of incoming) {
    if (item) set.add(item);
  }
  return [...set].slice(0, max);
}

/** Shared singleton, mirroring `strategyMemory` / `learningEngine`. */
export const playbookStore = new PlaybookStore();
