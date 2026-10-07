/**
 * MissionTimeTravel — "Mission Time Travel" (task.md §8, P1).
 *
 * Ouvrir une mission et parcourir sa timeline :
 *
 *   10:42 PLAN · 10:43 ANALYZE · 10:44 MODIFY · 10:45 TEST · 10:46 FAILURE
 *   10:47 REPLAN · 10:49 SUCCESS
 *
 * …puis « revenir à l'étape N » pour inspecter l'état à ce moment : décision,
 * outil, arguments, résultat, réflexion, raisonnement résumé, confiance.
 *
 * Design (reuse, don't rebuild): the Mission already records everything needed —
 * goals (createdAt/startedAt/completedAt), plannedActions (skill, args, result,
 * reflection), reflections[] (decision/reasoning/confidence), context decisions
 * & errors (with timestamps), and metrics. This engine is a pure, read-only
 * *reconstruction* of that data into a chronological timeline. It never executes
 * or mutates anything and never calls a model.
 */

export type TimelineEventType =
  | "plan"
  | "goal_start"
  | "analyze"
  | "action"
  | "reflect"
  | "failure"
  | "replan"
  | "escalate"
  | "goal_complete"
  | "success"
  | "end";

/** One point on the mission timeline. */
export interface TimelineEvent {
  /** Chronological index (0-based). */
  index: number;
  type: TimelineEventType;
  /** ISO timestamp (best-effort; falls back to mission ordering). */
  at?: string;
  /** Short label, e.g. "MODIFY str_replace". */
  label: string;
  /** The goal this event belongs to, when applicable. */
  goalId?: string;
  goalTitle?: string;
  /** Rich detail for a step snapshot (tool, args, result, reasoning…). */
  snapshot?: StepSnapshot;
}

/** The inspectable state when you "rewind" to a step. */
export interface StepSnapshot {
  skillName?: string;
  args?: Record<string, unknown>;
  rationale?: string;
  score?: number;
  status?: string;
  result?: unknown;
  /** Post-action reflection, if any. */
  decision?: string;
  reasoning?: string;
  confidence?: number;
  observation?: string;
  success?: string | null;
  failure?: string | null;
}

/** Minimal MissionState view the engine reconstructs from. Mirrors MissionState. */
export interface TimelineMissionView {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  completedAt?: string;
  goals: Record<string, {
    id?: string;
    title: string;
    status: string;
    parentId?: string | null;
    createdAt?: string;
    startedAt?: string;
    completedAt?: string;
    result?: { success: boolean; summary: string } | undefined;
    plannedActions: Array<{
      id?: string;
      skillName: string;
      args?: Record<string, unknown>;
      rationale?: string;
      score?: number;
      order: number;
      status: string;
      result?: unknown;
      reflection?: ReflectionView;
    }>;
  }>;
  reflections?: ReflectionView[];
  context?: {
    decisions?: Array<{ what: string; why: string; when?: string }>;
    errors?: Array<{ action: string; error: string; when?: string }>;
  };
  metrics?: { totalActions?: number; totalDurationMs?: number; estimatedTokens?: number };
}

interface ReflectionView {
  actionId?: string;
  timestamp?: string;
  observation?: string;
  success?: string | null;
  failure?: string | null;
  hypothesis?: string | null;
  confidence?: number;
  decision?: string;
  reasoning?: string;
}

export interface MissionTimeline {
  missionId: string;
  title: string;
  status: string;
  events: TimelineEvent[];
  summary: string;
}

/** Deterministic, read-only reconstruction of a mission timeline. */
export class MissionTimeTravel {
  /** Build the chronological timeline for a mission. */
  buildTimeline(mission: TimelineMissionView): MissionTimeline {
    const raw: Array<Omit<TimelineEvent, "index">> = [];

    // Mission start → PLAN.
    raw.push({ type: "plan", at: mission.createdAt, label: `PLAN — ${mission.title}` });

    // Walk goals in start/creation order; each goal's actions and reflections.
    const goals = Object.values(mission.goals)
      .filter((g) => g.parentId !== null || Object.values(mission.goals).length === 1)
      .sort((a, b) => ts(a.startedAt ?? a.createdAt) - ts(b.startedAt ?? b.createdAt));

    for (const goal of goals) {
      const goalId = goal.id;
      raw.push({ type: "goal_start", at: goal.startedAt ?? goal.createdAt, label: `ANALYZE — ${goal.title}`, goalId, goalTitle: goal.title });

      const actions = [...goal.plannedActions].sort((a, b) => a.order - b.order);
      for (const action of actions) {
        // Classify for the label. Verification first (typecheck/test/lint), then
        // side effects, else a generic ACT — so "run_typecheck" reads as TEST,
        // not MODIFY.
        const isVerify = /test|typecheck|type-check|lint|vitest|jest|verify|check/i.test(action.skillName);
        const isSideEffect = !isVerify && /write|edit|replace|create|delete|\brun\b|run_command|exec|command|patch|deploy|install|migrat/i.test(action.skillName);
        raw.push({
          type: "action",
          at: action.reflection?.timestamp,
          label: `${isVerify ? "TEST" : isSideEffect ? "MODIFY" : "ACT"} — ${action.skillName}`,
          goalId,
          goalTitle: goal.title,
          snapshot: {
            skillName: action.skillName,
            args: action.args,
            rationale: action.rationale,
            score: action.score,
            status: action.status,
            result: action.result,
            decision: action.reflection?.decision,
            reasoning: action.reflection?.reasoning,
            confidence: action.reflection?.confidence,
            observation: action.reflection?.observation,
            success: action.reflection?.success,
            failure: action.reflection?.failure,
          },
        });

        // A failed action is a FAILURE marker; its reflection may REPLAN/ESCALATE.
        if (action.status === "failed") {
          raw.push({ type: "failure", at: action.reflection?.timestamp, label: `FAILURE — ${action.skillName}`, goalId, goalTitle: goal.title, snapshot: { failure: action.reflection?.failure, result: action.result } });
        }
        const decision = action.reflection?.decision;
        if (decision === "replan") raw.push({ type: "replan", at: action.reflection?.timestamp, label: `REPLAN — ${goal.title}`, goalId, goalTitle: goal.title, snapshot: { reasoning: action.reflection?.reasoning } });
        else if (decision === "escalate" || decision === "abort") raw.push({ type: "escalate", at: action.reflection?.timestamp, label: `ESCALATE — ${goal.title}`, goalId, goalTitle: goal.title, snapshot: { reasoning: action.reflection?.reasoning } });
      }

      if (goal.completedAt || goal.status === "completed" || goal.status === "failed") {
        raw.push({
          type: "goal_complete",
          at: goal.completedAt,
          label: `${goal.status === "completed" ? "DONE" : "GOAL-" + goal.status.toUpperCase()} — ${goal.title}`,
          goalId,
          goalTitle: goal.title,
          snapshot: goal.result ? { success: goal.result.success ? "oui" : "non", observation: goal.result.summary } : undefined,
        });
      }
    }

    // Mission end → SUCCESS / END.
    raw.push({
      type: mission.status === "completed" ? "success" : "end",
      at: mission.completedAt,
      label: mission.status === "completed" ? "SUCCESS" : `END (${mission.status})`,
    });

    // Stable chronological sort: by timestamp when present, else keep insertion
    // order (which already follows the mission's logical progression).
    const events = this.stableChronological(raw).map((event, index) => ({ ...event, index }));
    return { missionId: mission.id, title: mission.title, status: mission.status, events, summary: buildSummary(mission, events) };
  }

  /** Snapshot of a single step by index (the "rewind" view). */
  getStep(mission: TimelineMissionView, index: number): TimelineEvent | undefined {
    const { events } = this.buildTimeline(mission);
    return events[index];
  }

  /**
   * Rewind to a step: return that step plus everything that led to it (the state
   * trail up to and including the chosen point).
   */
  rewindTo(mission: TimelineMissionView, index: number): { target?: TimelineEvent; trail: TimelineEvent[] } {
    const { events } = this.buildTimeline(mission);
    if (index < 0 || index >= events.length) return { target: undefined, trail: [] };
    return { target: events[index], trail: events.slice(0, index + 1) };
  }

  /**
   * Stable chronological sort. Events with timestamps are ordered by time; events
   * without a timestamp keep their insertion position relative to timestamped
   * neighbours (so the plan→action→reflect→end skeleton is never scrambled).
   */
  private stableChronological(events: Array<Omit<TimelineEvent, "index">>): Array<Omit<TimelineEvent, "index">> {
    // Decorate with insertion order; sort by (timestamp or inherited), tie-break
    // on insertion order to stay stable.
    const decorated = events.map((event, i) => ({ event, i, t: event.at ? ts(event.at) : Number.NaN }));
    // Forward-fill NaN timestamps with the previous known timestamp so an
    // untimed event sits right after the last timed one.
    let last = Number.NEGATIVE_INFINITY;
    for (const d of decorated) {
      if (!Number.isNaN(d.t)) last = d.t;
      else d.t = last;
    }
    decorated.sort((a, b) => a.t - b.t || a.i - b.i);
    return decorated.map((d) => d.event);
  }
}

function ts(iso?: string): number {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? 0 : t;
}

function buildSummary(mission: TimelineMissionView, events: TimelineEvent[]): string {
  const lines: string[] = [];
  lines.push(`## 🕰️ Timeline — « ${mission.title} »`);
  lines.push("");
  for (const e of events) {
    const time = e.at ? new Date(e.at).toISOString().slice(11, 19) : "  --:--  ".trim();
    lines.push(`${time.padEnd(8)} [${e.index}] ${e.label}`);
  }
  if (mission.metrics) {
    lines.push("");
    lines.push(`${mission.metrics.totalActions ?? 0} action(s) · ${Math.round((mission.metrics.totalDurationMs ?? 0) / 1000)}s · ~${mission.metrics.estimatedTokens ?? 0} tokens`);
  }
  lines.push("");
  lines.push(`Reviens à une étape : « revenir à l'étape N » pour inspecter décision / outil / résultat / raisonnement.`);
  return lines.join("\n");
}

/** Shared singleton. */
export const missionTimeTravel = new MissionTimeTravel();
