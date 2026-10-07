import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  ExecutionLedger,
  runIdempotent,
  idempotencyKeyFor,
  hashArguments,
  permissionsHaveSideEffect,
} from "./ExecutionLedger.js";

function tmpFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-ledger-"));
  return path.join(dir, "actions.jsonl");
}

test("idempotency key is deterministic and argument-order independent", () => {
  const a = idempotencyKeyFor({ tool: "write_file", args: { path: "a.ts", content: "x" }, missionId: "m", stepId: "s" });
  const b = idempotencyKeyFor({ tool: "write_file", args: { content: "x", path: "a.ts" }, missionId: "m", stepId: "s" });
  assert.equal(a, b);
  assert.equal(hashArguments({ x: 1, y: 2 }), hashArguments({ y: 2, x: 1 }));
});

test("a completed action is skipped and its result reused (single side effect)", async () => {
  const ledger = new ExecutionLedger(tmpFile());
  let executions = 0;
  const parts = { tool: "write_file", args: { path: "a.ts" }, missionId: "m1", stepId: "s1" };

  const r1 = await runIdempotent(ledger, parts, true, async () => {
    executions++;
    return { written: "a.ts" };
  });
  const r2 = await runIdempotent(ledger, parts, true, async () => {
    executions++;
    return { written: "a.ts" };
  });

  assert.equal(executions, 1, "the effectful action ran exactly once");
  assert.deepEqual(r1, r2);
});

test("failed actions can be retried (not skipped)", async () => {
  const ledger = new ExecutionLedger(tmpFile());
  const parts = { tool: "run_command", args: { cmd: "build" }, missionId: "m", stepId: "s" };

  await assert.rejects(
    runIdempotent(ledger, parts, true, async () => {
      throw new Error("boom");
    })
  );

  let ran = false;
  const ok = await runIdempotent(ledger, parts, true, async () => {
    ran = true;
    return "ok";
  });
  assert.equal(ran, true);
  assert.equal(ok, "ok");
});

test("crash mid-side-effect: an unknown effectful action is NOT replayed", () => {
  const file = tmpFile();
  const ledger = new ExecutionLedger(file);
  const parts = { tool: "delete_file", args: { path: "danger.ts" }, missionId: "m", stepId: "s" };

  // begin() writes a "started" entry, then we simulate a crash (no complete/fail).
  const decision = ledger.begin(parts, true);
  assert.equal(decision.action, "execute");

  // "Restart" : a fresh ledger hydrates from disk and marks orphan started -> unknown.
  const ledger2 = new ExecutionLedger(file);
  assert.equal(ledger2.listUnknown().length, 1);

  const decision2 = ledger2.begin(parts, true);
  assert.equal(decision2.action, "block");
});

test("crash mid-read (no side effect): a read-only action is safely re-executed", () => {
  const file = tmpFile();
  const ledger = new ExecutionLedger(file);
  const parts = { tool: "read_file", args: { path: "a.ts" }, missionId: "m", stepId: "s" };

  ledger.begin(parts, false); // started, then "crash"

  const ledger2 = new ExecutionLedger(file);
  const decision = ledger2.begin(parts, false);
  assert.equal(decision.action, "execute", "read-only actions are safe to replay");
});

test("permissionsHaveSideEffect flags write/exec/network/dangerous", () => {
  assert.equal(permissionsHaveSideEffect(["read"]), false);
  assert.equal(permissionsHaveSideEffect([]), false);
  assert.equal(permissionsHaveSideEffect(undefined), false);
  assert.equal(permissionsHaveSideEffect(["read", "write"]), true);
  assert.equal(permissionsHaveSideEffect(["exec"]), true);
  assert.equal(permissionsHaveSideEffect(["network"]), true);
  assert.equal(permissionsHaveSideEffect(["dangerous"]), true);
});
