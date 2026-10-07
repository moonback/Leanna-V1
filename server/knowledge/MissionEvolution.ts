/**
 * MissionEvolutionStore — "Mission Evolution" (task.md §6).
 *
 * Monter d'un niveau dans l'apprentissage :
 *
 *   Tool learning → Strategy learning → Mission learning → Goal learning
 *
 * Une mission ne doit pas seulement apprendre « cette action a échoué », mais
 * « cette MANIÈRE de résoudre ce type de problème est mauvaise » :
 *
 *   Mission 1  approche A → échec
 *   Mission 2  approche A → échec
 *   Mission 3  approche B → succès
 *   Mission 4 similaire → Leanna choisit automatiquement B
 *
 * Design : store durable par workspace (`.Leanna/mission-evolution.json`),
 * mirroring StrategyMemory (atomic tmp+rename, ephemeral pour tests). Clé =
 * signature de la *classe de problème* ; valeur = tableau d'approches, chacune
 * avec succès/échecs et un taux de réussite récent. `recommendApproach()`
 * retourne la meilleure approche établie, ou signale celles à éviter.
 * Déterministe, best-effort, aucun appel modèle.
 */

import fs from "fs";
import path from "path";
import { SELF_ROOT } from "../utils/selfRoot.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("MissionEvolution");

/** One attempted approach for a problem class. */
export interface ApproachRecord {
  /** Stable id of the approach (hash of its ordered skills, or an explicit label). */
  approachId: string;
  /** Human label, e.g. the ordered skills joined. */
  label: string;
  /** Ordered skills that define this approach. */
  steps: string[];
  successCount: number;
  failureCount: number;
  /** Last N boolean outcomes (recent last), capped. */
  recent: boolean[];
  lastUsedAt: string;
}

export interface ProblemEvolution {
  /** Problem-class signature (same key philosophy as PlaybookStore triggers). */
  signature: string;
  approaches: ApproachRecord[];
}

/** Recommendation returned to the planner. */
export interface ApproachRecommendation {
  signature: string;
  /** Best established approach to use, if any. */
  recommended?: { approachId: string; label: string; steps: string[]; successRate: number; attempts: number };
  /** Approaches to avoid (repeatedly failing). */
  avoid: Array<{ approachId: string; label: string; failures: number }>;
  reason: string;
}

const MAX_RECENT = 12;
const MAX_APPROACHES_PER_PROBLEM = 12;
const MAX_PROBLEMS = 300;
/** Min attempts before an approach can be recommended or flagged "avoid". */
const MIN_EVIDENCE = 2;
/** Recent success rate at/under which an approach (with evidence) is "avoid". */
const AVOID_THRESHOLD = 0.34;

function storePath(): string {
  return path.join(SELF_ROOT || process.cwd(), ".Leanna", "mission-evolution.json");
}

/** Stable id for an approach from its ordered skills. */
export function approachIdFromSteps(steps: string[]): string {
  const norm = steps.map((s) => s.toLowerCase().trim()).filter(Boolean).join(">");
  let hash = 0;
  for (let i = 0; i < norm.length; i++) {
    hash = (hash << 5) - hash + norm.charCodeAt(i);
    hash |= 0;
  }
  return `A${Math.abs(hash).toString(36)}`;
}

export class MissionEvolutionStore {
  private problems = new Map<string, ProblemEvolution>();
  private loadedFrom = "";
  private dirty = false;
  private readonly ephemeral: boolean;

  constructor(options: { ephemeral?: boolean } = {}) {
    this.ephemeral = options.ephemeral === true;
  }

  private sync(): void {
    if (this.ephemeral) return;
    const target = storePath();
    if (target === this.loadedFrom) return;
    this.loadedFrom = target;
    this.problems.clear();
    try {
      if (fs.existsSync(target)) {
        const raw = JSON.parse(fs.readFileSync(target, "utf-8")) as { problems?: ProblemEvolution[] };
        for (const p of raw.problems ?? []) {
          if (p && typeof p.signature === "string" && Array.isArray(p.approaches)) {
            this.problems.set(p.signature, {
              signature: p.signature,
              approaches: p.approaches.map((a) => ({
                approachId: a.approachId,
                label: a.label ?? a.approachId,
                steps: Array.isArray(a.steps) ? a.steps : [],
                successCount: Number(a.successCount) || 0,
                failureCount: Number(a.failureCount) || 0,
                recent: Array.isArray(a.recent) ? a.recent.slice(-MAX_RECENT) : [],
                lastUsedAt: a.lastUsedAt ?? new Date().toISOString(),
              })),
            });
          }
        }
      }
    } catch (err) {
      log.warn(`Impossible de charger l'évolution des missions: ${(err as Error).message}`);
      this.problems.clear();
    }
  }

  /**
   * Record the outcome of an approach for a problem class. `signature` keys the
   * problem; `steps` define the approach (its id is derived from them unless an
   * explicit `approachId`/`label` is given).
   */
  recordOutcome(input: {
    signature: string;
    steps: string[];
    success: boolean;
    approachId?: string;
    label?: string;
  }): void {
    if (!input.signature || input.steps.length === 0) return;
    this.sync();
    const problem = this.problems.get(input.signature) ?? { signature: input.signature, approaches: [] };
    const approachId = input.approachId ?? approachIdFromSteps(input.steps);
    const label = input.label ?? input.steps.join(" → ");

    let approach = problem.approaches.find((a) => a.approachId === approachId);
    if (!approach) {
      approach = { approachId, label, steps: input.steps, successCount: 0, failureCount: 0, recent: [], lastUsedAt: new Date().toISOString() };
      problem.approaches.push(approach);
    }
    if (input.success) approach.successCount++;
    else approach.failureCount++;
    approach.recent.push(input.success);
    if (approach.recent.length > MAX_RECENT) approach.recent.shift();
    approach.lastUsedAt = new Date().toISOString();

    // Bound memory.
    if (problem.approaches.length > MAX_APPROACHES_PER_PROBLEM) {
      problem.approaches.sort((a, b) => Date.parse(a.lastUsedAt) - Date.parse(b.lastUsedAt));
      problem.approaches = problem.approaches.slice(-MAX_APPROACHES_PER_PROBLEM);
    }
    this.problems.set(input.signature, problem);
    if (this.problems.size > MAX_PROBLEMS) this.prune();
    this.dirty = true;
    this.save();
  }

  /**
   * Recommend the best established approach for a problem class, and list the
   * approaches to avoid. "Leanna choisit automatiquement B."
   */
  recommendApproach(signature: string): ApproachRecommendation {
    this.sync();
    const problem = this.problems.get(signature);
    if (!problem || problem.approaches.length === 0) {
      return { signature, avoid: [], reason: "Aucun historique d'approche pour ce type de problème." };
    }
    const scored = problem.approaches.map((a) => {
      const attempts = a.successCount + a.failureCount;
      const recent = a.recent.slice(-MAX_RECENT);
      const recentRate = recent.length > 0 ? recent.filter(Boolean).length / recent.length : (attempts > 0 ? a.successCount / attempts : 0);
      return { a, attempts, recentRate };
    });

    const recommendable = scored
      .filter((s) => s.attempts >= MIN_EVIDENCE && s.recentRate > AVOID_THRESHOLD)
      .sort((x, y) => y.recentRate - x.recentRate || y.attempts - x.attempts)[0];

    const avoid = scored
      .filter((s) => s.attempts >= MIN_EVIDENCE && s.recentRate <= AVOID_THRESHOLD)
      .map((s) => ({ approachId: s.a.approachId, label: s.a.label, failures: s.a.failureCount }));

    return {
      signature,
      recommended: recommendable
        ? { approachId: recommendable.a.approachId, label: recommendable.a.label, steps: recommendable.a.steps, successRate: Math.round(recommendable.recentRate * 100) / 100, attempts: recommendable.attempts }
        : undefined,
      avoid,
      reason: recommendable
        ? `Approche gagnante établie (${Math.round(recommendable.recentRate * 100)}% sur ${recommendable.attempts} essais).`
        : avoid.length > 0
          ? "Des approches échouent de façon répétée — essayer une alternative."
          : "Pas encore assez d'évidence pour recommander une approche.",
    };
  }

  /** All known problem evolutions. */
  list(): ProblemEvolution[] {
    this.sync();
    return [...this.problems.values()];
  }

  private prune(): void {
    const entries = [...this.problems.values()];
    const latest = (p: ProblemEvolution) => Math.max(0, ...p.approaches.map((a) => Date.parse(a.lastUsedAt)));
    entries.sort((a, b) => latest(a) - latest(b));
    for (const p of entries.slice(0, this.problems.size - Math.floor(MAX_PROBLEMS * 0.9))) {
      this.problems.delete(p.signature);
    }
  }

  save(): void {
    if (this.ephemeral || !this.dirty) return;
    const target = this.loadedFrom || storePath();
    try {
      const dir = path.dirname(target);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const payload = JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), problems: [...this.problems.values()] }, null, 2);
      const tmp = `${target}.tmp`;
      fs.writeFileSync(tmp, payload, "utf-8");
      fs.renameSync(tmp, target);
      this.dirty = false;
    } catch (err) {
      log.warn(`Écriture de l'évolution des missions échouée: ${(err as Error).message}`);
    }
  }

  reset(): void {
    this.problems.clear();
    this.dirty = true;
    this.loadedFrom = "";
  }
}

/** Shared singleton, mirroring the other durable stores. */
export const missionEvolutionStore = new MissionEvolutionStore();
