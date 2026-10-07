import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ToolRegistry } from "../runtime/ToolRegistry.js";
import { PermissionPolicy } from "../runtime/PermissionPolicy.js";
import { createCoreKernel, idempotencyEnabledFromEnv } from "./kernel.js";

function ledgerFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-kernel-"));
  return path.join(dir, "actions.jsonl");
}

function offRegistry(): ToolRegistry {
  return new ToolRegistry({
    permissionPolicy: PermissionPolicy.fromEnv({ Leanna_PERMISSION_MODE: "off" } as NodeJS.ProcessEnv),
  });
}

test("idempotencyEnabledFromEnv reads LEANNA_IDEMPOTENCY", () => {
  assert.equal(idempotencyEnabledFromEnv({ LEANNA_IDEMPOTENCY: "true" } as NodeJS.ProcessEnv), true);
  assert.equal(idempotencyEnabledFromEnv({ LEANNA_IDEMPOTENCY: "1" } as NodeJS.ProcessEnv), true);
  assert.equal(idempotencyEnabledFromEnv({ LEANNA_IDEMPOTENCY: "false" } as NodeJS.ProcessEnv), false);
  assert.equal(idempotencyEnabledFromEnv({} as NodeJS.ProcessEnv), false);
});

test("kernel exposes all P0 bricks", () => {
  const kernel = createCoreKernel({ enableIdempotency: false });
  assert.ok(kernel.ledger);
  assert.ok(kernel.guard);
  assert.ok(kernel.checkpoints);
  assert.ok(kernel.evidence);
  assert.ok(kernel.missionStore);
  assert.ok(kernel.supervisor);
  assert.equal(kernel.idempotencyEnabled, false);
});

test("guard is attached to the registry only when enabled", async () => {
  // Disabled: behavior unchanged, every call runs.
  const reg1 = offRegistry();
  const k1 = createCoreKernel({ registry: reg1, enableIdempotency: false, ledgerFile: ledgerFile() });
  assert.equal(k1.idempotencyEnabled, false);

  let runs1 = 0;
  reg1.register({
    declaration: { name: "w", description: "x", parameters: { type: "object", properties: {} } },
    handler: async () => ++runs1,
    permissions: ["write"],
  } as any);
  await reg1.call("w", { a: 1 });
  await reg1.call("w", { a: 1 });
  assert.equal(runs1, 2, "no guard => runs every time");

  // Enabled: effectful duplicate is deduplicated.
  const reg2 = offRegistry();
  const k2 = createCoreKernel({ registry: reg2, enableIdempotency: true, ledgerFile: ledgerFile() });
  k2.guard.setContext({ missionId: "m", stepId: "s" });
  assert.equal(k2.idempotencyEnabled, true);

  let runs2 = 0;
  reg2.register({
    declaration: { name: "w", description: "x", parameters: { type: "object", properties: {} } },
    handler: async () => ++runs2,
    permissions: ["write"],
  } as any);
  await reg2.call("w", { a: 1 });
  await reg2.call("w", { a: 1 });
  assert.equal(runs2, 1, "guard enabled => effectful call deduplicated");
});

test("enabling idempotency without a registry does not attach a guard", () => {
  const k = createCoreKernel({ enableIdempotency: true });
  assert.equal(k.idempotencyEnabled, false, "no registry => nothing to attach");
});
