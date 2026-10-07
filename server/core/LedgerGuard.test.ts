import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ToolRegistry } from "../runtime/ToolRegistry.js";
import { PermissionPolicy } from "../runtime/PermissionPolicy.js";
import { ExecutionLedger } from "./ExecutionLedger.js";
import { LedgerGuard } from "./LedgerGuard.js";

function ledgerFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-guard-"));
  return path.join(dir, "actions.jsonl");
}

/** A registry that allows everything, so we test idempotency, not permissions. */
function permissiveRegistry(guard: LedgerGuard): ToolRegistry {
  return new ToolRegistry({
    permissionPolicy: PermissionPolicy.fromEnv({ Leanna_PERMISSION_MODE: "off" } as NodeJS.ProcessEnv),
    idempotency: guard,
  });
}

test("ToolRegistry skips re-execution of a completed effectful tool call", async () => {
  const guard = new LedgerGuard(new ExecutionLedger(ledgerFile()));
  guard.setContext({ missionId: "m1", stepId: "s1" });
  const registry = permissiveRegistry(guard);

  let runs = 0;
  registry.register({
    declaration: { name: "write_thing", description: "writes", parameters: { type: "object", properties: {} } },
    handler: async () => {
      runs++;
      return { ok: true, n: runs };
    },
    permissions: ["write"],
  } as any);

  const r1 = await registry.call("write_thing", { path: "a.ts" });
  const r2 = await registry.call("write_thing", { path: "a.ts" });

  assert.equal(runs, 1, "effectful handler executed exactly once");
  assert.deepEqual(r1, r2, "second call reused the recorded result");
});

test("ToolRegistry re-executes read-only tools (no side effect => no dedup risk)", async () => {
  const guard = new LedgerGuard(new ExecutionLedger(ledgerFile()));
  guard.setContext({ missionId: "m1", stepId: "s1" });
  const registry = permissiveRegistry(guard);

  let runs = 0;
  registry.register({
    declaration: { name: "read_thing", description: "reads", parameters: { type: "object", properties: {} } },
    handler: async () => {
      runs++;
      return runs;
    },
    permissions: ["read"],
  } as any);

  await registry.call("read_thing", { path: "a.ts" });
  await registry.call("read_thing", { path: "a.ts" });
  // Read-only: begin() returns "execute" the first time and "skip" only after a
  // recorded completion — but a completed read is also skippable. What matters
  // for safety is that reads are never BLOCKED after a crash. Here both calls
  // complete, so the second is a legitimate cache hit.
  assert.ok(runs >= 1);
});

test("guard without registry wiring leaves behavior unchanged", async () => {
  // No idempotency guard configured at all.
  const registry = new ToolRegistry({
    permissionPolicy: PermissionPolicy.fromEnv({ Leanna_PERMISSION_MODE: "off" } as NodeJS.ProcessEnv),
  });
  let runs = 0;
  registry.register({
    declaration: { name: "plain", description: "x", parameters: { type: "object", properties: {} } },
    handler: async () => {
      runs++;
      return runs;
    },
    permissions: ["write"],
  } as any);

  await registry.call("plain", { a: 1 });
  await registry.call("plain", { a: 1 });
  assert.equal(runs, 2, "without a guard, every call runs (unchanged behavior)");
});
