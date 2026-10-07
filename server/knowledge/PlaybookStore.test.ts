import test from "node:test";
import assert from "node:assert/strict";
import { PlaybookStore, type PlaybookMissionInput } from "./PlaybookStore.js";

/** Build a completed-mission input with one goal running an ordered skill list. */
function mission(id: string, skills: string[], opts: { errors?: string[]; title?: string; files?: string[] } = {}): PlaybookMissionInput {
  return {
    id,
    title: opts.title ?? "Fix the build",
    status: "completed",
    goals: {
      g1: {
        status: "completed",
        parentId: "root",
        completedAt: new Date().toISOString(),
        plannedActions: skills.map((skillName, order) => ({ skillName, order, status: "completed" })),
      },
      root: {
        status: "completed",
        parentId: null,
        plannedActions: [],
      },
    },
    errors: (opts.errors ?? []).map((error) => ({ error })),
    relevantFiles: opts.files ?? [],
  };
}

test("learns a playbook from a successful mission with a TS error signature", () => {
  const store = new PlaybookStore({ ephemeral: true });
  const pb = store.learnFromMission(
    mission("m1", ["read_code", "str_replace", "run_typecheck"], { errors: ["error TS2345: Argument of type"], files: ["src/a.ts"] }),
  );

  assert.ok(pb, "a playbook should be learned");
  assert.equal(pb!.triggerSignature, "ts-error");
  assert.deepEqual(pb!.steps.map((s) => s.skillName), ["read_code", "str_replace", "run_typecheck"]);
  assert.equal(pb!.timesLearned, 1);
  assert.match(pb!.id, /^PLAYBOOK-TS-ERROR-001$/);
  assert.ok(pb!.relatedFiles.includes("src/a.ts"));
});

test("does not learn from a non-completed mission", () => {
  const store = new PlaybookStore({ ephemeral: true });
  const input = mission("m-fail", ["read_code", "str_replace"]);
  input.status = "failed";
  assert.equal(store.learnFromMission(input), undefined);
  assert.equal(store.list().length, 0);
});

test("does not learn a trivial single-step playbook", () => {
  const store = new PlaybookStore({ ephemeral: true });
  assert.equal(store.learnFromMission(mission("m-tiny", ["read_code"])), undefined);
});

test("reinforces an existing playbook on repeated similar missions", () => {
  const store = new PlaybookStore({ ephemeral: true });
  store.learnFromMission(mission("m1", ["read_code", "str_replace", "run_typecheck"], { errors: ["error TS2345"] }));
  const again = store.learnFromMission(mission("m2", ["read_code", "str_replace", "run_typecheck"], { errors: ["error TS1005"] }));

  assert.ok(again);
  assert.equal(again!.timesLearned, 2, "same signature should reinforce, not create a second playbook");
  assert.equal(store.list().length, 1);
  assert.ok(again!.exampleMissionIds.includes("m1"));
  assert.ok(again!.exampleMissionIds.includes("m2"));
});

test("a richer successful run refines the stored step sequence", () => {
  const store = new PlaybookStore({ ephemeral: true });
  store.learnFromMission(mission("m1", ["read_code", "str_replace"], { errors: ["error TS2345"] }));
  const refined = store.learnFromMission(
    mission("m2", ["read_code", "grep_search", "str_replace", "run_typecheck"], { errors: ["error TS2345"] }),
  );
  assert.equal(refined!.steps.length, 4, "a longer successful sequence should refine the playbook");
});

test("findMatching resolves a new objective to its learned playbook and counts reuse", () => {
  const store = new PlaybookStore({ ephemeral: true });
  store.learnFromMission(mission("m1", ["read_code", "str_replace", "run_typecheck"], { errors: ["error TS2345"] }));

  const match = store.findMatching({ errors: ["error TS2322: Type 'string' is not assignable"] });
  assert.ok(match, "a new TS error should match the TS playbook");
  assert.equal(match!.triggerSignature, "ts-error");
  assert.equal(match!.timesMatched, 1);

  const miss = store.findMatching({ errors: ["ECONNREFUSED fetch failed"] });
  assert.equal(miss, undefined, "an unrelated error family should not match");
});

test("distinct problem families produce distinct playbooks", () => {
  const store = new PlaybookStore({ ephemeral: true });
  store.learnFromMission(mission("m1", ["read_code", "str_replace", "run_typecheck"], { errors: ["error TS2345"] }));
  store.learnFromMission(mission("m2", ["read_file", "run_tests"], { errors: ["3 tests failed, expect(x).toBe(y)"] }));

  const list = store.list();
  assert.equal(list.length, 2);
  assert.ok(list.some((p) => p.triggerSignature === "ts-error"));
  assert.ok(list.some((p) => p.triggerSignature === "test-failure"));
});

test("falls back to an objective-based signature when there is no error", () => {
  const store = new PlaybookStore({ ephemeral: true });
  const pb = store.learnFromMission(mission("m1", ["read_code", "str_replace"], { title: "Refactor the auth module" }));
  assert.ok(pb);
  assert.equal(pb!.triggerSignature, "objective:refactor");
});

test("orders skills across dependent goals topologically", () => {
  const store = new PlaybookStore({ ephemeral: true });
  const input: PlaybookMissionInput = {
    id: "m-topo",
    title: "Fix TypeScript",
    status: "completed",
    errors: [{ error: "error TS2345" }],
    relevantFiles: [],
    goals: {
      root: { status: "completed", parentId: null, plannedActions: [] },
      // Declared out of execution order; "analyze" must come before "apply".
      apply: {
        status: "completed", parentId: "root", dependsOn: ["analyze"],
        completedAt: "2026-01-01T00:00:02Z",
        plannedActions: [{ skillName: "str_replace", order: 0, status: "completed" }],
      },
      analyze: {
        status: "completed", parentId: "root",
        completedAt: "2026-01-01T00:00:01Z",
        plannedActions: [{ skillName: "read_code", order: 0, status: "completed" }],
      },
    },
  };
  const pb = store.learnFromMission(input);
  assert.deepEqual(pb!.steps.map((s) => s.skillName), ["read_code", "str_replace"]);
});

test("collapses consecutive duplicate skills from retry loops", () => {
  const store = new PlaybookStore({ ephemeral: true });
  const pb = store.learnFromMission(
    mission("m1", ["read_code", "str_replace", "str_replace", "run_typecheck"], { errors: ["error TS2345"] }),
  );
  assert.deepEqual(pb!.steps.map((s) => s.skillName), ["read_code", "str_replace", "run_typecheck"]);
});
