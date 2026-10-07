import test from "node:test";
import assert from "node:assert/strict";
import { MissionEvolutionStore, approachIdFromSteps } from "./MissionEvolution.js";

function store() {
  return new MissionEvolutionStore({ ephemeral: true });
}

test("no history yields no recommendation", () => {
  const rec = store().recommendApproach("ts-error:fix");
  assert.equal(rec.recommended, undefined);
  assert.deepEqual(rec.avoid, []);
});

test("learns that approach B wins after approach A fails repeatedly", () => {
  const s = store();
  const sig = "ts-error:fix";
  const A = ["read_code", "str_replace"];
  const B = ["read_code", "grep_search", "str_replace", "run_typecheck"];
  // A fails twice, B succeeds twice.
  s.recordOutcome({ signature: sig, steps: A, success: false });
  s.recordOutcome({ signature: sig, steps: A, success: false });
  s.recordOutcome({ signature: sig, steps: B, success: true });
  s.recordOutcome({ signature: sig, steps: B, success: true });

  const rec = s.recommendApproach(sig);
  assert.ok(rec.recommended, "an approach should be recommended");
  assert.deepEqual(rec.recommended!.steps, B);
  assert.ok(rec.avoid.some((a) => a.approachId === approachIdFromSteps(A)), "approach A should be flagged to avoid");
});

test("the same ordered steps map to one stable approach id", () => {
  const s = store();
  const sig = "test-failure:test";
  const steps = ["read_file", "run_tests"];
  s.recordOutcome({ signature: sig, steps, success: true });
  s.recordOutcome({ signature: sig, steps, success: true });
  const problem = s.list().find((p) => p.signature === sig)!;
  assert.equal(problem.approaches.length, 1, "same steps should not create duplicate approaches");
  assert.equal(problem.approaches[0].successCount, 2);
});

test("an approach needs enough evidence before being recommended", () => {
  const s = store();
  s.recordOutcome({ signature: "x:fix", steps: ["a", "b"], success: true }); // only 1 attempt
  const rec = s.recommendApproach("x:fix");
  assert.equal(rec.recommended, undefined, "1 attempt is below the evidence threshold");
});

test("recently recovering approach is preferred over a historically mixed one", () => {
  const s = store();
  const sig = "perf:perf";
  const good = ["profile", "optimize"];
  s.recordOutcome({ signature: sig, steps: good, success: true });
  s.recordOutcome({ signature: sig, steps: good, success: true });
  s.recordOutcome({ signature: sig, steps: good, success: true });
  const rec = s.recommendApproach(sig);
  assert.ok(rec.recommended);
  assert.ok(rec.recommended!.successRate >= 0.7);
});

test("records are isolated per problem signature", () => {
  const s = store();
  s.recordOutcome({ signature: "sig-a", steps: ["x"], success: true });
  s.recordOutcome({ signature: "sig-b", steps: ["y"], success: false });
  assert.equal(s.list().length, 2);
  assert.equal(s.recommendApproach("sig-a").signature, "sig-a");
});

test("empty steps or empty signature are ignored", () => {
  const s = store();
  s.recordOutcome({ signature: "", steps: ["x"], success: true });
  s.recordOutcome({ signature: "sig", steps: [], success: true });
  assert.equal(s.list().length, 0);
});
