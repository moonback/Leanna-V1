import test from "node:test";
import assert from "node:assert/strict";
import { PredictionEngine, type PredictionEngineOptions } from "./PredictionEngine.js";

type Stats = { skillName: string; totalCalls: number; successRate: number; recentSuccessRate: number; avgDurationMs: number; failing: boolean };

/** Build an engine with injected reliability + playbook fakes. */
function makeEngine(opts: {
  stats?: Record<string, Partial<Stats>>;
  failing?: string[];
  playbook?: { id: string; title: string; steps: string[]; timesLearned: number } | null;
} = {}) {
  const statsMap = new Map<string, Stats>();
  for (const [name, s] of Object.entries(opts.stats ?? {})) {
    statsMap.set(name, {
      skillName: name, totalCalls: s.totalCalls ?? 10, successRate: s.successRate ?? s.recentSuccessRate ?? 0.9,
      recentSuccessRate: s.recentSuccessRate ?? 0.9, avgDurationMs: s.avgDurationMs ?? 100, failing: s.failing ?? false,
    });
  }
  const options: PredictionEngineOptions = {
    strategyMemory: {
      getSkillStats: (name: string) => statsMap.get(name),
      getFailingSkills: () => (opts.failing ?? []).map((n) => statsMap.get(n) ?? { skillName: n, totalCalls: 5, successRate: 0.1, recentSuccessRate: 0.1, avgDurationMs: 100, failing: true }),
    } as never,
    playbookStore: {
      findMatching: () =>
        opts.playbook
          ? { id: opts.playbook.id, triggerSignature: "sig", title: opts.playbook.title, steps: opts.playbook.steps.map((skillName, order) => ({ order, skillName })), timesLearned: opts.playbook.timesLearned, timesMatched: 0, relatedFiles: [], exampleMissionIds: [], createdAt: "", updatedAt: "" }
          : undefined,
    } as never,
  };
  return new PredictionEngine(options);
}

test("high-reliability plan yields a high success probability", () => {
  const engine = makeEngine({ stats: { read_code: { recentSuccessRate: 0.95 }, str_replace: { recentSuccessRate: 0.9 } } });
  const r = engine.predict({ objective: { title: "edit" }, plannedSkills: ["read_code", "str_replace"] });
  assert.ok(r.successPercent >= 85, `got ${r.successPercent}`);
  assert.equal(r.riskLevel, "low");
});

test("a weak step drags the whole probability down and is flagged", () => {
  const engine = makeEngine({ stats: { read_code: { recentSuccessRate: 0.95 }, flaky: { recentSuccessRate: 0.2 } } });
  const r = engine.predict({ objective: { title: "edit" }, plannedSkills: ["read_code", "flaky"] });
  assert.ok(r.successPercent < 70, `got ${r.successPercent}`);
  assert.ok(r.weakestStep);
  assert.equal(r.weakestStep!.skillName, "flaky");
  assert.ok(r.risks.some((x) => x.includes("flaky")));
});

test("failing skills in the plan are penalized and listed", () => {
  const engine = makeEngine({
    stats: { read_code: { recentSuccessRate: 0.95 }, bad_tool: { recentSuccessRate: 0.1, failing: true } },
    failing: ["bad_tool"],
  });
  const r = engine.predict({ objective: { title: "x" }, plannedSkills: ["read_code", "bad_tool"] });
  assert.ok(r.risks.some((x) => x.includes("défaillant") && x.includes("bad_tool")));
});

test("a matching playbook boosts confidence and sets the recommended strategy", () => {
  const engine = makeEngine({
    stats: { read_code: { recentSuccessRate: 0.8 }, str_replace: { recentSuccessRate: 0.8 } },
    playbook: { id: "PLAYBOOK-TS-ERROR-001", title: "Corriger TS", steps: ["read_code", "str_replace", "run_typecheck"], timesLearned: 6 },
  });
  const r = engine.predict({ objective: { title: "Fix TS", errors: ["error TS2345"] }, plannedSkills: ["read_code", "str_replace"] });
  assert.equal(r.playbookId, "PLAYBOOK-TS-ERROR-001");
  assert.deepEqual(r.recommendedStrategy, ["read_code", "str_replace", "run_typecheck"]);
  assert.ok(r.risks.some((x) => x.includes("Playbook éprouvé")));
});

test("no matching playbook falls back to a generic strategy", () => {
  const engine = makeEngine({ stats: { read_code: { recentSuccessRate: 0.9 } }, playbook: null });
  const r = engine.predict({ objective: { title: "misc" }, plannedSkills: ["read_code"] });
  assert.equal(r.playbookId, undefined);
  assert.ok(r.recommendedStrategy.includes("rollback si échec"));
});

test("unknown skills use a neutral prior and lower the prediction confidence", () => {
  const engine = makeEngine({ stats: {} });
  const r = engine.predict({ objective: { title: "x" }, plannedSkills: ["unknown_a", "unknown_b"] });
  assert.ok(r.confidence <= 0.1, `confidence should be low, got ${r.confidence}`);
  assert.ok(r.risks.some((x) => x.includes("Aucun historique")));
});

test("side-effect heavy plans raise the risk level", () => {
  const stats: Record<string, Partial<Stats>> = {};
  const skills = ["run_a", "run_b", "write_c", "exec_d", "deploy_e"];
  for (const s of skills) stats[s] = { recentSuccessRate: 0.9 };
  const r = makeEngine({ stats }).predict({ objective: { title: "deploy" }, plannedSkills: skills });
  assert.ok(["high", "critical"].includes(r.riskLevel));
  assert.ok(r.risks.some((x) => x.includes("effet de bord")));
});

test("carries through estimated duration and cost, and renders a summary", () => {
  const engine = makeEngine({ stats: { read_code: { recentSuccessRate: 0.9 } } });
  const r = engine.predict({ objective: { title: "x" }, plannedSkills: ["read_code"] }, { durationMs: 260000, costUsd: 0.38 });
  assert.equal(r.estimatedCostUsd, 0.38);
  assert.match(r.summary, /Probabilité de réussite/);
  assert.match(r.summary, /\$0\.38/);
  assert.match(r.summary, /Stratégie recommandée/);
});

test("empty plan is handled safely", () => {
  const r = makeEngine().predict({ objective: { title: "x" }, plannedSkills: [] });
  assert.ok(r.successPercent >= 0 && r.successPercent <= 100);
  assert.ok(r.risks.some((x) => x.includes("Aucune action")));
  assert.equal(r.steps.length, 0);
});
