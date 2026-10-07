import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  toRunnerOutcome,
  verificationsToChecks,
  outcomeToRecovery,
  type AgentResultLike,
  type AgenticLike,
} from "./AgenticMissionRunner.js";
import { createCoreKernel } from "./kernel.js";

function result(overrides: Partial<AgentResultLike> = {}): AgentResultLike {
  return {
    success: true,
    outcome: "success",
    verifications: [],
    filesModified: [],
    filesRead: [],
    toolsExecuted: [],
    ...overrides,
  };
}

/** A deterministic fake runtime that returns scripted results per attempt. */
function fakeRuntime(scripted: AgentResultLike[]): AgenticLike & { calls: number } {
  const rt = {
    calls: 0,
    async run() {
      const r = scripted[Math.min(rt.calls, scripted.length - 1)];
      rt.calls++;
      return r;
    },
  };
  return rt;
}

test("verificationsToChecks turns checks into passed and issues into failures", () => {
  const checks = verificationsToChecks([
    { passed: true, checks: ["typecheck ok"], issues: [] },
    { passed: false, checks: ["build"], issues: ["TS2322 type error"], summary: "build failed" },
  ]);
  assert.deepEqual(
    checks.find((c) => c.name === "typecheck ok"),
    { name: "typecheck ok", passed: true }
  );
  assert.equal(checks.find((c) => c.name === "build")?.passed, false);
  assert.equal(checks.find((c) => c.name === "TS2322 type error")?.passed, false);
});

test("outcomeToRecovery maps agent outcomes to recovery decisions", () => {
  assert.equal(outcomeToRecovery("blocked"), "escalate");
  assert.equal(outcomeToRecovery("no_change"), "replan");
  assert.equal(outcomeToRecovery("failed"), "retry");
  assert.equal(outcomeToRecovery("partial"), "repair");
  assert.equal(outcomeToRecovery("success"), undefined);
});

test("toRunnerOutcome carries evidence and files through", () => {
  const outcome = toRunnerOutcome(
    result({
      success: true,
      filesModified: ["a.ts", "b.ts"],
      filesRead: ["c.ts"],
      toolsExecuted: ["write_project_file", "verify_file"],
      verifications: [{ passed: true, checks: ["verify_file ok"], issues: [] }],
    })
  );
  assert.equal(outcome.success, true);
  assert.deepEqual(outcome.touchedFiles, ["a.ts", "b.ts"]);
  assert.deepEqual(outcome.evidence?.changes, [{ path: "a.ts" }, { path: "b.ts" }]);
  assert.deepEqual(outcome.evidence?.filesRead, ["c.ts"]);
  assert.equal(outcome.evidence?.runtimeChecks?.length, 1);
  assert.equal(outcome.suggestedRecovery, undefined);
});

test("governed mission COMPLETES when the agent proves success", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-amr-"));
  const kernel = createCoreKernel({ ledgerFile: path.join(dir, "l.jsonl") });
  const rt = fakeRuntime([
    result({ success: true, filesModified: ["a.ts"], verifications: [{ passed: true, checks: ["verify_file ok"], issues: [] }] }),
  ]);

  const res = await kernel.runSupervisedAgenticMission(rt, { goal: "add feature", plannedFiles: ["a.ts"] });
  assert.equal(res.finalState, "COMPLETED");
  assert.equal(res.evidence?.passed, true);
  assert.equal(rt.calls, 1);

  fs.rmSync(dir, { recursive: true, force: true });
});

test("governed mission ESCALATES when the agent's proof keeps failing, with rollback", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-amr-"));
  const kernel = createCoreKernel({ ledgerFile: path.join(dir, "l.jsonl") });
  const failing = result({
    success: false,
    outcome: "failed",
    filesModified: ["a.ts"],
    verifications: [{ passed: false, checks: [], issues: ["compile error"], summary: "failed" }],
  });
  const rt = fakeRuntime([failing]); // always fails

  const res = await kernel.runSupervisedAgenticMission(rt, { goal: "fix", plannedFiles: ["a.ts"] });
  assert.equal(res.finalState, "ESCALATED");
  assert.equal(res.evidence?.passed, false);
  assert.ok(rt.calls >= 1);

  fs.rmSync(dir, { recursive: true, force: true });
});

test("governed mission recovers on a later attempt (fail then succeed)", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-amr-"));
  const kernel = createCoreKernel({ ledgerFile: path.join(dir, "l.jsonl") });
  const rt = fakeRuntime([
    result({ success: false, outcome: "failed", filesModified: ["a.ts"], verifications: [{ passed: false, checks: [], issues: ["oops"] }] }),
    result({ success: true, filesModified: ["a.ts"], verifications: [{ passed: true, checks: ["verify_file ok"], issues: [] }] }),
  ]);

  const res = await kernel.runSupervisedAgenticMission(rt, { goal: "fix flaky", plannedFiles: ["a.ts"] });
  assert.equal(res.finalState, "COMPLETED");
  assert.equal(res.attempts, 2);

  fs.rmSync(dir, { recursive: true, force: true });
});

test("blocked outcome escalates immediately (no wasted retries)", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-amr-"));
  const kernel = createCoreKernel({ ledgerFile: path.join(dir, "l.jsonl") });
  const rt = fakeRuntime([
    result({ success: false, outcome: "blocked", verifications: [{ passed: false, checks: [], issues: ["preexisting error"] }] }),
  ]);

  const res = await kernel.runSupervisedAgenticMission(rt, { goal: "touch blocked area" });
  assert.equal(res.finalState, "ESCALATED");
  assert.equal(rt.calls, 1, "blocked => escalate on first attempt, no retries");

  fs.rmSync(dir, { recursive: true, force: true });
});

test("guard context is set during the mission and cleared afterwards", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-amr-"));
  const kernel = createCoreKernel({ ledgerFile: path.join(dir, "l.jsonl") });

  // Observe the guard context AT THE MOMENT the runtime runs (mid-mission) by
  // inspecting the deterministic idempotency key the guard would produce.
  let midMissionKey: string | undefined;
  const rt: AgenticLike = {
    async run() {
      const g = kernel.guard.guard("probe_tool", { x: 1 }, ["read"], undefined);
      // The guard returns an "execute" decision; the ledger entry it just wrote
      // carries the mission id in its key, proving the context was active.
      if (g.decision === "execute") g.commit(null);
      const entry = fs.readFileSync(path.join(dir, "l.jsonl"), "utf8").trim().split("\n").pop()!;
      midMissionKey = JSON.parse(entry).idempotencyKey as string;
      return result({ success: true, verifications: [{ passed: true, checks: ["ok"], issues: [] }] });
    },
  };

  await kernel.runSupervisedAgenticMission(rt, { goal: "x", missionId: "fixed-id" });
  assert.ok(midMissionKey?.startsWith("fixed-id:"), "mission id was active in the idempotency key mid-mission");

  // After the mission, a fresh guard call must NOT carry the mission id.
  const after = kernel.guard.guard("probe_tool_2", { y: 2 }, ["read"], undefined);
  if (after.decision === "execute") after.commit(null);
  const lastEntry = fs.readFileSync(path.join(dir, "l.jsonl"), "utf8").trim().split("\n").pop()!;
  const afterKey = JSON.parse(lastEntry).idempotencyKey as string;
  assert.ok(afterKey.startsWith("-:"), "context cleared: no mission id in later keys");

  fs.rmSync(dir, { recursive: true, force: true });
});
