import test from "node:test";
import assert from "node:assert/strict";
import { JevSafetyGate } from "./JevSafetyGate.js";

/**
 * Ces tests valident le PRÉ-FILTRE (shouldEvaluate) sans appel réseau : les
 * outils d'état interne / lecture ne doivent jamais consulter Jev. On le
 * vérifie indirectement — en mode "enforce" et SANS clé OpenRouter, un appel
 * réellement transmis à Jev échouerait et serait mis en revue (donc bloqué,
 * fail-closed). Un outil filtré, lui, renvoie "allow" instantanément.
 */

function gateWithoutKey(): JevSafetyGate {
  // Pas de clé → si Jev est appelé, gateAgentAction échoue → review → block.
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_FREE_API_KEY;
  return new JevSafetyGate("enforce");
}

test("save_memory est laissé passer sans consulter Jev (pré-filtre)", async () => {
  const gate = gateWithoutKey();
  const verdict = await gate.evaluate("save_memory", { content: "x" }, ["network"], "coder");
  assert.deepEqual(verdict, { decision: "allow" }, "un outil d'état interne ne doit pas être jugé");
});

test("mission_status est laissé passer sans consulter Jev", async () => {
  const gate = gateWithoutKey();
  const verdict = await gate.evaluate("mission_status", { id: "m1" }, ["network"], "coder");
  assert.deepEqual(verdict, { decision: "allow" });
});

test("verify_file (lecture/vérif) est laissé passer sans consulter Jev", async () => {
  const gate = gateWithoutKey();
  const verdict = await gate.evaluate("verify_file", { path: "a.ts" }, ["read"], "tester");
  assert.deepEqual(verdict, { decision: "allow" });
});

test("delete_project_folder EST jugé (et bloqué fail-closed sans clé)", async () => {
  const gate = gateWithoutKey();
  const verdict = await gate.evaluate(
    "delete_project_folder",
    { path: "node_modules", recursive: true },
    ["write", "dangerous"],
    "coder",
  );
  // Jev injoignable (pas de clé) → gateAgentAction renvoie review → block.
  assert.equal(verdict.decision, "block", "un outil risqué doit être évalué (ici bloqué faute de clé)");
});

test('mode "off" laisse tout passer', async () => {
  const gate = new JevSafetyGate("off");
  const verdict = await gate.evaluate("delete_project_folder", { path: "/" }, ["dangerous"], "coder");
  assert.deepEqual(verdict, { decision: "allow" });
});
