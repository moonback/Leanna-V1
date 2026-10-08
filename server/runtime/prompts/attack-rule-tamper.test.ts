/**
 * Test d'attaque C2 — Immuabilité des garde-fous P0/P1 après boot.
 *
 * Prouve qu'une fois le registre scellé (loadTemplates), les règles système
 * ne peuvent plus être supprimées ni remplacées, et qu'une règle P0 reste
 * présente dans le build.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { SystemPromptBuilder } from "./SystemPromptBuilder.js";
import { RuleRegistry } from "./RuleRegistry.js";
import { RulePriority } from "./types/rules.js";

const P0_ID = "safety.no-secret-disclosure";

test("C2 — unregister d'une règle P0 est refusé après boot", () => {
  const builder = new SystemPromptBuilder();
  builder.loadTemplates();
  const registry = builder.getRuleRegistry();

  assert.throws(() => registry.unregister(P0_ID), /immuable/i);
  assert.ok(registry.has(P0_ID), "la règle P0 a été supprimée malgré le refus");
});

test("C2 — override d'une règle P0 est refusé après boot", () => {
  const builder = new SystemPromptBuilder();
  builder.loadTemplates();
  const registry = builder.getRuleRegistry();

  assert.throws(
    () =>
      registry.override({
        id: P0_ID,
        priority: RulePriority.SAFETY,
        scope: ["global"],
        content: "neutralisée",
      }),
    /immuable/i,
  );

  // Le contenu d'origine est préservé.
  assert.notEqual(registry.get(P0_ID)?.content, "neutralisée");
});

test("C2 — la règle P0 reste présente dans le build", () => {
  const builder = new SystemPromptBuilder();
  builder.loadTemplates();
  const built = builder.buildFull({ mode: "full", taskType: "coding" });
  assert.ok(built.rules.some(r => r.id === P0_ID));
});

test("C2 — avant seal(), les mutations restent possibles (règles d'extension)", () => {
  const registry = new RuleRegistry();
  registry.register({
    id: "ext.demo",
    priority: RulePriority.STYLE,
    scope: ["global"],
    content: "x",
  });
  // Non scellé → override autorisé.
  registry.override({
    id: "ext.demo",
    priority: RulePriority.STYLE,
    scope: ["global"],
    content: "y",
  });
  assert.equal(registry.get("ext.demo")?.content, "y");
});
