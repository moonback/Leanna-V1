import test from "node:test";
import assert from "node:assert/strict";
import { ToolRegistry, SafetyGateBlockedError, type SafetyGate } from "./ToolRegistry.js";
import { PermissionPolicy } from "./PermissionPolicy.js";

/** Registry permissif : on isole le comportement du safety gate, pas les permissions. */
function registryWithGate(gate: SafetyGate): ToolRegistry {
  return new ToolRegistry({
    permissionPolicy: PermissionPolicy.fromEnv({ Leanna_PERMISSION_MODE: "off" } as NodeJS.ProcessEnv),
    safetyGate: gate,
    enableMetrics: false,
  });
}

/** Gate déterministe : bloque si le nom d'outil contient "delete", sinon laisse passer. */
const fakeGate: SafetyGate = {
  async evaluate(tool) {
    if (tool.includes("delete")) {
      return { decision: "block", reason: "action destructrice simulée" };
    }
    return { decision: "allow" };
  },
};

test("le safety gate BLOQUE un outil à effet de bord jugé risqué", async () => {
  const registry = registryWithGate(fakeGate);
  let ran = false;
  registry.register({
    declaration: { name: "delete_project_file", description: "supprime", parameters: { type: "object", properties: {} } },
    handler: async () => { ran = true; return { ok: true }; },
    permissions: ["write"],
  } as any);

  await assert.rejects(
    () => registry.call("delete_project_file", { path: "a.ts" }),
    (err: unknown) => err instanceof SafetyGateBlockedError && (err as SafetyGateBlockedError).toolName === "delete_project_file",
  );
  assert.equal(ran, false, "le handler ne doit jamais s'exécuter quand le gate bloque");
});

test("le safety gate LAISSE PASSER un outil à effet de bord jugé sûr", async () => {
  const registry = registryWithGate(fakeGate);
  let ran = false;
  registry.register({
    declaration: { name: "write_project_file", description: "écrit", parameters: { type: "object", properties: {} } },
    handler: async () => { ran = true; return { ok: true }; },
    permissions: ["write"],
  } as any);

  const res = await registry.call("write_project_file", { path: "a.ts" });
  assert.equal(ran, true);
  assert.deepEqual(res, { ok: true });
});

test("le safety gate N'EST PAS consulté pour un outil en lecture seule", async () => {
  let consulted = false;
  const spyGate: SafetyGate = {
    async evaluate() { consulted = true; return { decision: "allow" }; },
  };
  const registry = registryWithGate(spyGate);
  registry.register({
    declaration: { name: "read_thing", description: "lit", parameters: { type: "object", properties: {} } },
    handler: async () => ({ ok: true }),
    permissions: ["read"],
  } as any);

  await registry.call("read_thing", { path: "a.ts" });
  assert.equal(consulted, false, "un outil de lecture ne doit pas déclencher le gate");
});

test("sans safety gate configuré, le comportement est inchangé", async () => {
  const registry = new ToolRegistry({
    permissionPolicy: PermissionPolicy.fromEnv({ Leanna_PERMISSION_MODE: "off" } as NodeJS.ProcessEnv),
    enableMetrics: false,
  });
  let ran = false;
  registry.register({
    declaration: { name: "delete_project_file", description: "supprime", parameters: { type: "object", properties: {} } },
    handler: async () => { ran = true; return { ok: true }; },
    permissions: ["write"],
  } as any);

  const res = await registry.call("delete_project_file", { path: "a.ts" });
  assert.equal(ran, true, "sans gate, l'outil s'exécute normalement");
  assert.deepEqual(res, { ok: true });
});
