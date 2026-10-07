import test from "node:test";
import assert from "node:assert/strict";
import { OpportunityEngine, type OpportunityEngineOptions } from "./OpportunityEngine.js";

function pattern(type: string, signature: string, occurrenceCount: number, isRecurring = true) {
  return { type, signature, description: `${type} ${signature}`, occurrenceCount, sourceIds: [], relatedFiles: ["f.ts"], aggregatedImportance: 0.5, isRecurring };
}

function makeEngine(overrides: {
  optimizations?: ReturnType<typeof pattern>[];
  errorPatterns?: ReturnType<typeof pattern>[];
  failing?: string[];
  playbooks?: Array<{ id: string; title: string; triggerSignature: string; timesLearned: number }>;
  issues?: Array<{ dimension: string; severity: string; message: string; suggestedAction: string; affectedResources: string[] }>;
} = {}) {
  const options: OpportunityEngineOptions = {
    learningEngine: {
      getPatternsHistory: () => ({
        optimizations: overrides.optimizations ?? [],
        errorPatterns: overrides.errorPatterns ?? [],
        successPatterns: [],
        decisions: [],
      }),
    } as never,
    strategyMemory: {
      getFailingSkills: () => (overrides.failing ?? []).map((n) => ({ skillName: n, totalCalls: 5, successRate: 0.1, recentSuccessRate: 0.1, avgDurationMs: 100, failing: true })),
    } as never,
    playbookStore: {
      list: () => (overrides.playbooks ?? []).map((p) => ({ ...p, steps: [], timesMatched: 0, relatedFiles: [], exampleMissionIds: [], createdAt: "", updatedAt: "" })),
    } as never,
    projectDoctor: {
      diagnose: () => ({ issues: overrides.issues ?? [], scores: {}, global: 100, improvementMissions: [], generatedAt: "", summary: "" }),
    } as never,
  };
  return new OpportunityEngine(options);
}

test("empty history yields no opportunities", () => {
  const report = makeEngine().scan();
  assert.equal(report.opportunities.length, 0);
  assert.match(report.summary, /Aucune opportunité/);
});

test("a recurring optimization becomes an optimization opportunity", () => {
  const report = makeEngine({ optimizations: [pattern("optimization", "opt-1", 4)] }).scan();
  assert.ok(report.opportunities.some((o) => o.kind === "optimization" && o.signature === "optimization:opt-1"));
});

test("a recurring error becomes a prevention opportunity", () => {
  const report = makeEngine({ errorPatterns: [pattern("error_pattern", "err-1", 6)] }).scan();
  const opp = report.opportunities.find((o) => o.kind === "prevention");
  assert.ok(opp);
  assert.match(opp!.message, /6×/);
});

test("non-recurring patterns are ignored", () => {
  const report = makeEngine({ optimizations: [pattern("optimization", "opt-x", 1, false)] }).scan();
  assert.equal(report.opportunities.length, 0);
});

test("a mature playbook (>=3 uses) becomes an automation opportunity", () => {
  const report = makeEngine({ playbooks: [{ id: "PLAYBOOK-TS-ERROR-001", title: "Corriger TS", triggerSignature: "ts-error", timesLearned: 5 }] }).scan();
  const opp = report.opportunities.find((o) => o.kind === "automation");
  assert.ok(opp);
  assert.match(opp!.suggestedAction, /workflow/);
  assert.match(opp!.suggestedAction, /PLAYBOOK-TS-ERROR-001/);
});

test("a young playbook (<3 uses) is not yet an opportunity", () => {
  const report = makeEngine({ playbooks: [{ id: "PLAYBOOK-X-001", title: "X", triggerSignature: "x", timesLearned: 2 }] }).scan();
  assert.equal(report.opportunities.filter((o) => o.kind === "automation").length, 0);
});

test("failing skills become a reliability opportunity", () => {
  const report = makeEngine({ failing: ["flaky_a", "flaky_b"] }).scan();
  const opp = report.opportunities.find((o) => o.kind === "reliability");
  assert.ok(opp);
  assert.ok(opp!.affectedResources.includes("flaky_a"));
});

test("project-doctor non-low issues become health opportunities (and low ones are skipped)", () => {
  const report = makeEngine({
    issues: [
      { dimension: "security", severity: "critical", message: "vuln", suggestedAction: "patch", affectedResources: [] },
      { dimension: "maintainability", severity: "low", message: "nit", suggestedAction: "cleanup", affectedResources: [] },
    ],
  }).scan();
  const health = report.opportunities.filter((o) => o.kind === "health");
  assert.equal(health.length, 1);
  assert.equal(health[0].message.includes("security"), true);
});

test("include_health=false skips the doctor scan", () => {
  const report = makeEngine({ issues: [{ dimension: "tests", severity: "high", message: "no tests", suggestedAction: "add tests", affectedResources: [] }] })
    .scan({ includeHealth: false });
  assert.equal(report.opportunities.filter((o) => o.kind === "health").length, 0);
});

test("opportunities are ranked by payoff and the limit is respected", () => {
  const report = makeEngine({
    optimizations: [pattern("optimization", "o1", 10)],
    errorPatterns: [pattern("error_pattern", "e1", 10)],
    failing: ["x"],
  }).scan({ limit: 2 });
  assert.equal(report.opportunities.length, 2);
  // payoff is non-increasing across the ranked list
  for (let i = 1; i < report.opportunities.length; i++) {
    assert.ok(report.opportunities[i - 1].payoff >= report.opportunities[i].payoff);
  }
});

test("duplicate signatures are collapsed", () => {
  // Two scans worth of the same recurring optimization in one history call.
  const report = makeEngine({ optimizations: [pattern("optimization", "dup", 4), pattern("optimization", "dup", 4)] }).scan();
  assert.equal(report.opportunities.filter((o) => o.signature === "optimization:dup").length, 1);
});
