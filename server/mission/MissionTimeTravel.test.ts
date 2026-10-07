import test from "node:test";
import assert from "node:assert/strict";
import { MissionTimeTravel, type TimelineMissionView } from "./MissionTimeTravel.js";

const engine = new MissionTimeTravel();

/** A mission that failed once, replanned, then succeeded. */
function missionWithReplan(): TimelineMissionView {
  return {
    id: "m1",
    title: "Corriger erreur TypeScript",
    status: "completed",
    createdAt: "2026-01-01T10:42:00Z",
    completedAt: "2026-01-01T10:49:00Z",
    goals: {
      g1: {
        id: "g1", title: "Analyser et corriger", status: "completed", parentId: "root",
        startedAt: "2026-01-01T10:43:00Z", completedAt: "2026-01-01T10:49:00Z",
        result: { success: true, summary: "Erreur corrigée." },
        plannedActions: [
          { id: "a1", skillName: "read_code", args: { path: "src/x.ts" }, rationale: "comprendre", score: 80, order: 0, status: "completed",
            reflection: { timestamp: "2026-01-01T10:43:30Z", decision: "continue", reasoning: "contexte acquis", confidence: 0.8, observation: "lu" } },
          { id: "a2", skillName: "str_replace", args: { path: "src/x.ts" }, rationale: "corriger", score: 70, order: 1, status: "failed", result: { error: "boom" },
            reflection: { timestamp: "2026-01-01T10:45:00Z", decision: "replan", reasoning: "mauvaise cible", confidence: 0.4, failure: "patch invalide" } },
          { id: "a3", skillName: "str_replace", args: { path: "src/x.ts" }, rationale: "corriger (2)", score: 75, order: 2, status: "completed",
            reflection: { timestamp: "2026-01-01T10:47:00Z", decision: "continue", reasoning: "appliqué", confidence: 0.9 } },
          { id: "a4", skillName: "run_typecheck", args: {}, rationale: "vérifier", score: 85, order: 3, status: "completed",
            reflection: { timestamp: "2026-01-01T10:48:30Z", decision: "continue", reasoning: "0 erreur", confidence: 0.95 } },
        ],
      },
      root: { id: "root", title: "root", status: "completed", parentId: null, plannedActions: [] },
    },
    metrics: { totalActions: 4, totalDurationMs: 420000, estimatedTokens: 5000 },
  };
}

test("timeline begins with PLAN and ends with SUCCESS", () => {
  const t = engine.buildTimeline(missionWithReplan());
  assert.equal(t.events[0].type, "plan");
  assert.equal(t.events[t.events.length - 1].type, "success");
});

test("timeline captures the failure and the replan in order", () => {
  const t = engine.buildTimeline(missionWithReplan());
  const types = t.events.map((e) => e.type);
  const failureIdx = types.indexOf("failure");
  const replanIdx = types.indexOf("replan");
  assert.ok(failureIdx >= 0, "a FAILURE event should exist");
  assert.ok(replanIdx > failureIdx, "REPLAN should come after FAILURE");
});

test("events are chronologically ordered by timestamp", () => {
  const t = engine.buildTimeline(missionWithReplan());
  const times = t.events.filter((e) => e.at).map((e) => Date.parse(e.at!));
  for (let i = 1; i < times.length; i++) assert.ok(times[i] >= times[i - 1], "non-decreasing timestamps");
});

test("action events carry a full snapshot (tool, args, result, reasoning)", () => {
  const t = engine.buildTimeline(missionWithReplan());
  const modify = t.events.find((e) => e.type === "action" && e.snapshot?.skillName === "str_replace" && e.snapshot?.status === "completed");
  assert.ok(modify);
  assert.equal(modify!.snapshot!.skillName, "str_replace");
  assert.deepEqual(modify!.snapshot!.args, { path: "src/x.ts" });
  assert.equal(modify!.snapshot!.decision, "continue");
});

test("labels classify actions as MODIFY / TEST / ACT", () => {
  const t = engine.buildTimeline(missionWithReplan());
  assert.ok(t.events.some((e) => e.label.startsWith("MODIFY — str_replace")));
  assert.ok(t.events.some((e) => e.label.startsWith("TEST — run_typecheck") || e.label.startsWith("ACT — run_typecheck")));
});

test("getStep returns the event at an index", () => {
  const mission = missionWithReplan();
  const t = engine.buildTimeline(mission);
  const step = engine.getStep(mission, 2);
  assert.ok(step);
  assert.equal(step!.index, 2);
  assert.deepEqual(step, t.events[2]);
});

test("rewindTo returns the target plus the trail leading to it", () => {
  const mission = missionWithReplan();
  const { target, trail } = engine.rewindTo(mission, 3);
  assert.ok(target);
  assert.equal(target!.index, 3);
  assert.equal(trail.length, 4);
  assert.equal(trail[trail.length - 1].index, 3);
});

test("out-of-range rewind is handled safely", () => {
  const r = engine.rewindTo(missionWithReplan(), 999);
  assert.equal(r.target, undefined);
  assert.deepEqual(r.trail, []);
});

test("a failed mission ends with an END event, not SUCCESS", () => {
  const mission = missionWithReplan();
  mission.status = "blocked";
  mission.completedAt = "2026-01-01T10:50:00Z";
  const t = engine.buildTimeline(mission);
  const last = t.events[t.events.length - 1];
  assert.equal(last.type, "end");
  assert.match(last.label, /blocked/);
});

test("summary renders the timeline with indices and metrics", () => {
  const t = engine.buildTimeline(missionWithReplan());
  assert.match(t.summary, /Timeline/);
  assert.match(t.summary, /\[0\]/);
  assert.match(t.summary, /4 action/);
});
