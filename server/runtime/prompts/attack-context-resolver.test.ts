/**
 * Test d'attaque C8 — taskType inféré vs fourni, et C10 — sanitation des rôles.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { ContextResolver } from "./ContextResolver.js";

test("C8 — taskType fourni explicitement n'est pas marqué inféré", () => {
  const ctx = new ContextResolver().resolve({ mode: "full", taskType: "coding" });
  assert.equal(ctx.taskType, "coding");
  assert.equal(ctx.taskTypeInferred, false);
});

test("C8 — taskType absent en mode full est marqué inféré", () => {
  const ctx = new ContextResolver().resolve({ mode: "full" });
  assert.equal(ctx.taskType, "general");
  assert.equal(ctx.taskTypeInferred, true);
});

test("C8 — mode ask déduit 'document' et marque inféré", () => {
  const ctx = new ContextResolver().resolve({ mode: "ask" });
  assert.equal(ctx.taskType, "document");
  assert.equal(ctx.taskTypeInferred, true);
});

test("C10 — rôles inconnus filtrés du contexte", () => {
  const ctx = new ContextResolver().resolve({
    mode: "full",
    agents: { enabled: true, allowedRoles: ["coder", "super-admin", "anything"] as any },
  });
  assert.deepEqual(ctx.agents.allowedRoles, ["coder"]);
});

test("C10 — allowedRoles absent reste undefined (aucune restriction)", () => {
  const ctx = new ContextResolver().resolve({
    mode: "full",
    agents: { enabled: true },
  });
  assert.equal(ctx.agents.allowedRoles, undefined);
});
