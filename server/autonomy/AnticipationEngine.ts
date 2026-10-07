/**
 * AnticipationEngine — Leanna's proactive observation loop (P0).
 *
 * Positioning: Leanna already executes goals on demand ("give me an objective →
 * I run it"). This engine moves her to the next level:
 *
 *   « J'observe ton environnement → je détecte ce qui mérite ton attention →
 *     je propose ou lance une mission. »
 *
 * It deliberately reuses the existing autonomy infrastructure rather than adding
 * a parallel runtime:
 *   - PerceptionEngine classifies reactive runtime events (deterministic, no LLM).
 *   - StrategyMemory / LearningEngine supply durable problem & opportunity signals
 *     (failing skills, recurring error patterns, repeated manual operations).
 *   - A periodic sweep is driven by the shared HeartbeatService tick (autonomy:
 *     heartbeat), so there is no second timer competing with the heartbeat.
 *
 * It never executes anything itself. It emits typed `autonomy:anticipation`
 * proposals on the EventBus (surfaced to the UI by LeannaCore's broadcaster) and,
 * only for actionable high-importance signals, submits a `mission` task through
 * the existing TaskManager so launch stays behind
 * AutonomousExecutive → executeMission → PermissionPolicy / DryRun / approval.
 *
 * Pure/deterministic scoring; best-effort reads that must never throw into the
 * loop — exactly the conventions used by PerceptionEngine / AutonomousExecutive.
 */

import { randomUUID } from "crypto";
import type { AgentRuntime, RuntimeEvent } from "../runtime/index.js";
import { PerceptionEngine } from "./PerceptionEngine.js";
import type { AutonomousTask } from "./TaskManager.js";
import { strategyMemory, type StrategyMemory } from "../knowledge/StrategyMemory.js";
import { learningEngine, type LearningEngine } from "../knowledge/LearningEngine.js";

/** Signal classes an anticipation proposal can describe. */
export type AnticipationKind =
  | "problem"
  | "opportunity"
  | "optimization"
  | "risk"
  | "automation";

export type AnticipationPriority = "low" | "medium" | "high" | "critical";

/** A proposal: something Leanna thinks deserves the user's attention. */
export interface AnticipationProposal {
  id: string;
  kind: AnticipationKind;
  /** Normalised 0..1 noteworthiness. */
  importance: number;
  priority: AnticipationPriority;
  /** User-facing message, e.g. "3 skills échouent régulièrement." */
  message: string;
  /** Concrete action proposed (becomes a mission title if launched). */
  suggestedAction: string;
  /** Resources concerned (skill names, files, workflow ids…). */
  affectedResources: string[];
  /** Stable dedupe key for the signal *class*. */
  fingerprint: string;
  createdAt: number;
  /** Was this proposal handed to the TaskManager as a mission task? */
  queuedAsTask: boolean;
}

/** How an anticipation proposal is turned into a mission task (optional). */
export type AnticipationTaskSubmitter = (
  input: Omit<AutonomousTask, "id" | "createdAt" | "status" | "attempts" | "maxRetries" | "timeoutMs">,
) => AutonomousTask | undefined;

export interface AnticipationEngineConfig {
  /**
   * Minimum heartbeat ticks between two full proactive sweeps. The heartbeat is
   * adaptive (active 15s / idle 60s / sleep 300s), so this throttles the sweep
   * without introducing a second timer.
   */
  sweepEveryTicks: number;
  /** Minimum importance before a proposal is emitted at all. */
  minImportance: number;
  /**
   * Importance at/above which an actionable proposal is also submitted as a
   * `mission` task (auto-launch). Below it, the proposal is surfaced only.
   */
  autoLaunchThreshold: number;
  /** How long (ms) a proposal fingerprint is suppressed after being emitted. */
  dedupeTtlMs: number;
  /** Max proposals kept for inspection via getProposals(). */
  historyLimit: number;
  /**
   * Background reflection ("vivant"). When the heartbeat reports idle/sleep,
   * Leanna keeps thinking on her own instead of going fully silent: every
   * `reflectEveryTicks` idle/sleep ticks she runs a sweep and, if nothing more
   * pressing surfaced, emits a low-importance "reflection" proposal. Set to 0
   * to disable background reflection entirely. Reflections never auto-launch a
   * mission (their importance stays below autoLaunchThreshold).
   */
  reflectEveryTicks: number;
}

const positive = (value: number, fallback: number): number =>
  Number.isFinite(value) && value > 0 ? value : fallback;

const ratio = (value: number, fallback: number): number =>
  Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;

export const anticipationConfigFromEnv = (
  env: NodeJS.ProcessEnv = process.env,
): AnticipationEngineConfig => ({
  sweepEveryTicks: positive(Number(env.LEANNA_ANTICIPATION_SWEEP_TICKS), 4),
  minImportance: ratio(Number(env.LEANNA_ANTICIPATION_MIN_IMPORTANCE), 0.4),
  autoLaunchThreshold: ratio(Number(env.LEANNA_ANTICIPATION_AUTOLAUNCH), 0.85),
  dedupeTtlMs: positive(Number(env.LEANNA_ANTICIPATION_DEDUPE_TTL_MS), 600_000),
  historyLimit: positive(Number(env.LEANNA_ANTICIPATION_HISTORY_LIMIT), 50),
  // 0 = désactivé. Défaut 3 : au bout de ~3 ticks idle/sleep sans signal, Leanna
  // "réfléchit" d'elle-même (proposition de faible importance, jamais auto-lancée).
  reflectEveryTicks: Math.max(
    0,
    Number.isFinite(Number(env.LEANNA_ANTICIPATION_REFLECT_TICKS))
      ? Number(env.LEANNA_ANTICIPATION_REFLECT_TICKS)
      : 3,
  ),
});

export interface AnticipationEngineOptions {
  config?: AnticipationEngineConfig;
  /** Reliability signal source. Defaults to the shared singleton. */
  strategyMemory?: StrategyMemory;
  /** Pattern/lesson signal source. Defaults to the shared singleton. */
  learningEngine?: LearningEngine;
  /**
   * Optional seam to turn high-importance proposals into mission tasks. When
   * omitted, the engine only emits proposals (observe-and-suggest mode).
   */
  submitTask?: AnticipationTaskSubmitter;
}

const PRIORITY_FROM_IMPORTANCE = (importance: number): AnticipationPriority =>
  importance >= 0.85 ? "critical" : importance >= 0.6 ? "high" : importance >= 0.35 ? "medium" : "low";

const PRIORITY_TO_TASK = (priority: AnticipationPriority): AutonomousTask["priority"] =>
  priority === "critical" ? "critical" : priority === "high" ? "high" : priority === "medium" ? "medium" : "low";

/**
 * Observe → detect → evaluate → propose. Mirrors the PerceptionEngine/Executive
 * style: constructor-injected deps, env-driven config, best-effort side effects.
 */
export class AnticipationEngine {
  private readonly perception = new PerceptionEngine();
  private readonly strategy: StrategyMemory;
  private readonly learning: LearningEngine;
  private readonly config: AnticipationEngineConfig;
  private readonly submitTask?: AnticipationTaskSubmitter;

  private readonly unsubscribers: Array<() => void> = [];
  private readonly dedupe = new Map<string, number>();
  private readonly proposals: AnticipationProposal[] = [];
  private started = false;
  private ticksSinceSweep = 0;
  /** Consecutive idle/sleep heartbeat ticks, for background reflection. */
  private idleTicks = 0;

  constructor(private readonly runtime: AgentRuntime, options: AnticipationEngineOptions = {}) {
    this.config = options.config ?? anticipationConfigFromEnv();
    this.strategy = options.strategyMemory ?? strategyMemory;
    this.learning = options.learningEngine ?? learningEngine;
    this.submitTask = options.submitTask;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    // Reactive stream: classify meaningful runtime events as they happen.
    this.unsubscribers.push(this.runtime.events.onAny((event) => this.onEvent(event)));
    // Proactive stream: piggyback on the heartbeat tick to run periodic sweeps,
    // avoiding a second timer. The initial sweep runs on the first tick.
    this.unsubscribers.push(
      this.runtime.events.on("autonomy:heartbeat", (event) => this.onHeartbeat(event.state)),
    );
  }

  stop(): void {
    if (!this.started) return;
    this.unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
    this.started = false;
  }

  /** Most recent proposals (newest first), for the UI / state snapshot. */
  getProposals(): AnticipationProposal[] {
    return [...this.proposals].reverse();
  }

  /**
   * Run a proactive sweep immediately. Exposed for tests and for callers that
   * want an on-demand "look at my project now" without waiting for a heartbeat.
   */
  sweepNow(): AnticipationProposal[] {
    return this.sweep();
  }

  // ─── Reactive path ─────────────────────────────────────────────────────────

  private onEvent(event: RuntimeEvent): void {
    // Ignore our own emissions and heartbeat noise (handled by onHeartbeat).
    if (event.type === "autonomy:anticipation" || event.type === "autonomy:heartbeat") return;
    if (event.type.startsWith("autonomy:" as never)) return;

    try {
      const perception = this.perception.perceive(event);
      if (perception.importance < this.config.minImportance || !perception.requiresAttention) return;

      const kind: AnticipationKind =
        event.type === "tool:permissionDenied" ? "risk"
          : perception.possibleActions.includes("maintenance") ? "problem"
            : "opportunity";

      this.propose({
        kind,
        importance: perception.importance,
        message: perception.reason,
        suggestedAction: this.actionFor(event, perception.reason),
        affectedResources: perception.affectedResources,
        // Dedupe by event class + resources so repeated instances collapse.
        fingerprint: `event:${event.type}:${[...perception.affectedResources].sort().join(",")}`,
      });
    } catch {
      /* perception/scoring is best-effort and must never break the bus */
    }
  }

  private actionFor(event: RuntimeEvent, reason: string): string {
    switch (event.type) {
      case "task:failed":
        return "Diagnostiquer et récupérer la tâche en échec.";
      case "tool:permissionDenied":
        return `Revoir la permission refusée pour l'outil ${event.toolName}.`;
      case "workflow:completed":
        return event.success ? "Consigner le workflow terminé." : "Récupérer le workflow en échec.";
      default:
        return reason;
    }
  }

  // ─── Proactive path ──────────────────────────────────────────────────────────

  private onHeartbeat(state: "active" | "idle" | "sleep"): void {
    // Background reflection: track how long Leanna has been quiet. Any activity
    // (active tick) resets the idle streak.
    if (state === "active") {
      this.idleTicks = 0;
    } else {
      this.idleTicks++;
    }

    this.ticksSinceSweep++;
    const dueForSweep = this.ticksSinceSweep >= this.config.sweepEveryTicks;
    const dueForReflection =
      this.config.reflectEveryTicks > 0 &&
      state !== "active" &&
      this.idleTicks > 0 &&
      this.idleTicks % this.config.reflectEveryTicks === 0;

    if (!dueForSweep && !dueForReflection) return;

    this.ticksSinceSweep = 0;
    const emitted = this.sweep();

    // "Vivant" : si rien de plus pressant n'a émergé pendant une période calme,
    // Leanna remarque tout de même qu'elle est disponible et réfléchit au projet.
    // Faible importance → surfacé seulement, jamais transformé en mission.
    if (dueForReflection && emitted.length === 0) {
      this.reflect(state);
    }
  }

  /**
   * Emit a low-importance "idle reflection" proposal. Deterministic and bounded
   * by the same dedupe window as every other proposal. This is what gives the
   * sense of a présence that keeps thinking rather than freezing between events.
   */
  private reflect(state: "idle" | "sleep"): void {
    // Dedupe par tranche temporelle pour éviter le spam : au plus une réflexion
    // par fenêtre de dédup (dedupeTtlMs), quelle que soit la cadence des ticks.
    const bucket = Math.floor(Date.now() / this.config.dedupeTtlMs);
    this.propose({
      kind: "opportunity",
      // Volontairement sous minImportance par défaut n'est PAS souhaité : on veut
      // qu'elle s'affiche. On la garde basse mais >= minImportance plancher.
      importance: Math.max(this.config.minImportance, 0.3),
      message:
        state === "sleep"
          ? "Rien d'urgent — je reste en veille et je garde un œil sur le projet."
          : "Rien d'urgent en cours — je réfléchis au contexte du projet et reste disponible.",
      suggestedAction: "Proposer une revue légère ou une amélioration du projet.",
      affectedResources: [],
      fingerprint: `reflect:${bucket}`,
    });
  }

  /**
   * Scan durable signals for problems/opportunities that no single runtime event
   * surfaces: skills that fail repeatedly, recurring error patterns, and
   * repeated manual operations worth automating.
   */
  private sweep(): AnticipationProposal[] {
    const emitted: AnticipationProposal[] = [];
    const push = (proposal: AnticipationProposal | undefined) => {
      if (proposal) emitted.push(proposal);
    };

    // 1) Problem: skills with enough evidence and low recent success.
    try {
      const failing = this.strategy.getFailingSkills();
      if (failing.length > 0) {
        const names = failing.map((s) => s.skillName);
        // Importance grows with how many skills are failing and how badly.
        const worst = Math.min(...failing.map((s) => s.recentSuccessRate));
        const importance = Math.min(1, 0.55 + (1 - worst) * 0.3 + Math.min(0.15, (failing.length - 1) * 0.05));
        push(this.propose({
          kind: "problem",
          importance,
          message: failing.length === 1
            ? `L'outil « ${names[0]} » échoue régulièrement (succès récent ${(worst * 100) | 0}%).`
            : `${failing.length} outils échouent régulièrement : ${names.slice(0, 4).join(", ")}.`,
          suggestedAction: "Analyser les échecs récurrents et proposer une stratégie alternative.",
          affectedResources: names,
          fingerprint: `sweep:failing-skills:${[...names].sort().join(",")}`,
        }));
      }
    } catch {
      /* reliability read is best-effort */
    }

    // 2) Problem / automation: recurring error & success patterns.
    try {
      const patterns = this.learning.getPatternsHistory(10);

      for (const p of patterns.errorPatterns) {
        if (!p.isRecurring) continue;
        const importance = Math.min(1, 0.5 + Math.min(0.4, p.occurrenceCount * 0.08) + p.aggregatedImportance * 0.1);
        push(this.propose({
          kind: "problem",
          importance,
          message: `Tu as rencontré ce problème ${p.occurrenceCount} fois : ${p.description}`,
          suggestedAction: "Automatiser la prévention de cette erreur récurrente.",
          affectedResources: p.relatedFiles,
          fingerprint: `sweep:error-pattern:${p.signature}`,
        }));
      }

      for (const p of patterns.optimizations) {
        if (!p.isRecurring) continue;
        const importance = Math.min(1, 0.4 + Math.min(0.3, p.occurrenceCount * 0.06) + p.aggregatedImportance * 0.1);
        push(this.propose({
          kind: "optimization",
          importance,
          message: `Opportunité d'optimisation récurrente détectée : ${p.description}`,
          suggestedAction: "Appliquer l'optimisation identifiée.",
          affectedResources: p.relatedFiles,
          fingerprint: `sweep:optimization:${p.signature}`,
        }));
      }
    } catch {
      /* pattern read is best-effort */
    }

    // 3) Risk: runtime currently has failed tasks that nobody is handling.
    try {
      const stats = this.runtime.getStats();
      if (stats.tasks.failed > 0) {
        const importance = Math.min(1, 0.5 + Math.min(0.4, stats.tasks.failed * 0.1));
        push(this.propose({
          kind: "risk",
          importance,
          message: `${stats.tasks.failed} tâche(s) runtime en échec nécessitent une attention.`,
          suggestedAction: "Investiguer les tâches en échec et planifier une remédiation.",
          affectedResources: [],
          fingerprint: `sweep:failed-tasks:${stats.tasks.failed}`,
        }));
      }
    } catch {
      /* stats read is best-effort */
    }

    return emitted;
  }

  // ─── Proposal lifecycle ──────────────────────────────────────────────────────

  /**
   * Score, deduplicate, record, broadcast, and (optionally) launch a proposal.
   * Returns the proposal when it was actually emitted, or undefined if it was
   * below threshold or suppressed by the dedupe window.
   */
  private propose(input: {
    kind: AnticipationKind;
    importance: number;
    message: string;
    suggestedAction: string;
    affectedResources: string[];
    fingerprint: string;
  }): AnticipationProposal | undefined {
    const importance = Math.max(0, Math.min(1, input.importance));
    if (importance < this.config.minImportance) return undefined;
    if (this.isSuppressed(input.fingerprint)) return undefined;

    const priority = PRIORITY_FROM_IMPORTANCE(importance);
    const proposal: AnticipationProposal = {
      id: randomUUID(),
      kind: input.kind,
      importance,
      priority,
      message: input.message,
      suggestedAction: input.suggestedAction,
      affectedResources: input.affectedResources,
      fingerprint: input.fingerprint,
      createdAt: Date.now(),
      queuedAsTask: false,
    };

    // Auto-launch only for high-importance, actionable proposals, and only when a
    // task submitter is wired. Launch still goes through the full existing
    // executive → executeMission → permission/dry-run pipeline.
    if (importance >= this.config.autoLaunchThreshold && this.submitTask) {
      const task = this.submitTask({
        type: "mission",
        title: `Anticipation: ${proposal.suggestedAction}`,
        priority: PRIORITY_TO_TASK(priority),
        sourceEventId: proposal.id,
        fingerprint: `anticipation:${proposal.fingerprint}`,
        metadata: {
          anticipation: {
            kind: proposal.kind,
            message: proposal.message,
            suggestedAction: proposal.suggestedAction,
            affectedResources: proposal.affectedResources,
            importance: proposal.importance,
          },
        },
      });
      proposal.queuedAsTask = Boolean(task);
    }

    this.record(proposal);
    this.emit(proposal);
    return proposal;
  }

  private isSuppressed(fingerprint: string): boolean {
    const now = Date.now();
    // Prune expired dedupe entries lazily.
    for (const [key, expiry] of this.dedupe) {
      if (expiry <= now) this.dedupe.delete(key);
    }
    if (this.dedupe.has(fingerprint)) return true;
    this.dedupe.set(fingerprint, now + this.config.dedupeTtlMs);
    return false;
  }

  private record(proposal: AnticipationProposal): void {
    this.proposals.push(proposal);
    if (this.proposals.length > this.config.historyLimit) {
      this.proposals.splice(0, this.proposals.length - this.config.historyLimit);
    }
  }

  private emit(proposal: AnticipationProposal): void {
    this.runtime.events.emit({
      type: "autonomy:anticipation",
      proposalId: proposal.id,
      kind: proposal.kind,
      importance: proposal.importance,
      priority: proposal.priority,
      message: proposal.message,
      affectedResources: proposal.affectedResources,
      suggestedAction: proposal.suggestedAction,
      queuedAsTask: proposal.queuedAsTask,
    });
  }
}
