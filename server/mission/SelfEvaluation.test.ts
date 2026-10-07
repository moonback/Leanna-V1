import test from "node:test";
import assert from "node:assert/strict";
import { SelfEvaluationEngine, type SelfEvalMissionView } from "./SelfEvaluation.js";

const engine = new SelfEvaluationEngine();

function mission(partial: Partial<SelfEvalMissionView> & { actions: Array<{ skillName: string; status: string; reflection?: { decision?: string; confidence?: number } }> }): SelfEvalMissionView {
  const { actions, ...rest } = partial;
  return {
    id: "m1",
    title: "Fix the thing",
    status: "completed",
    reflections: [],
    metrics: { totalActions: actions.length, estimatedTokens: 2000 },
    goals: {
      g1: { status: "completed", parentId: "root", plannedActions: actions.map((a, order) => ({ ...a, order })) },
      root: { status: "completed", parentId: null, plannedActions: [] },
    },
    ...rest,
  };
}

test("a clean, verified run scores high overall", () => {
  const e = engine.evaluate(mission({
    actions: [
      { skillName: "read_code", status: "completed" },
      { skillName: "str_replace", status: "completed" },
      { skillName: "run_typecheck", status: "completed" },
    ],
  }));
  assert.ok(e.overall >= 85, `overall ${e.overall}`);
  assert.equal(e.scores.verification, 100);
});

test("missing verification lowers the verification score and notes it", () => {
  const e = engine.evaluate(mission({
    actions: [{ skillName: "read_code", status: "completed" }, { skillName: "str_replace", status: "completed" }],
  }));
  assert.ok(e.scores.verification < 100);
  assert.ok(e.notes.some((n) => /vérification/i.test(n)));
});

test("failed actions reduce tool efficiency", () => {
  const e = engine.evaluate(mission({
    actions: [{ skillName: "read_code", status: "completed" }, { skillName: "str_replace", status: "failed" }],
  }));
  assert.ok(e.scores.toolEfficiency < 100);
});

test("recovery after failure (replan → success) scores recovery quality well", () => {
  const m = mission({
    actions: [
      { skillName: "str_replace", status: "failed", reflection: { decision: "replan" } },
      { skillName: "str_replace", status: "completed" },
      { skillName: "run_tests", status: "completed" },
    ],
  });
  m.reflections = [{ decision: "replan" }];
  const e = engine.evaluate(m);
  assert.ok(e.scores.recoveryQuality >= 60);
});

test("giving up (escalate) after failure scores recovery quality poorly", () => {
  const m = mission({ status: "blocked", actions: [{ skillName: "str_replace", status: "failed", reflection: { decision: "escalate" } }] });
  m.status = "blocked";
  m.reflections = [{ decision: "escalate" }];
  const e = engine.evaluate(m);
  assert.ok(e.scores.recoveryQuality < 60);
});

test("a long, token-heavy mission has lower cost efficiency", () => {
  const actions = Array.from({ length: 14 }, (_, i) => ({ skillName: `tool_${i}`, status: "completed" }));
  const m = mission({ actions });
  m.metrics = { totalActions: 14, estimatedTokens: 30000 };
  const e = engine.evaluate(m);
  assert.ok(e.scores.costEfficiency < 70);
});

test("recommends not starting with a skill that failed first", () => {
  const e = engine.evaluate(mission({
    actions: [{ skillName: "str_replace", status: "failed" }, { skillName: "read_code", status: "completed" }],
  }));
  assert.match(e.nextTimeStartWith, /str_replace/);
  assert.match(e.nextTimeStartWith, /Ne pas commencer/);
});

test("summary renders all five dimensions and the GLOBAL score", () => {
  const e = engine.evaluate(mission({ actions: [{ skillName: "read_code", status: "completed" }, { skillName: "str_replace", status: "completed" }, { skillName: "run_tests", status: "completed" }] }));
  assert.match(e.summary, /Plan accuracy/);
  assert.match(e.summary, /Cost efficiency/);
  assert.match(e.summary, /GLOBAL/);
  assert.match(e.summary, /Prochaine fois/);
});
