/**
 * Test d'attaque C7 — Application de `requires` sur les sections.
 *
 * Prouve qu'une section déclarant `requires` est exclue quand la règle dont
 * elle dépend est inactive, et incluse quand elle est active.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { SectionRegistry } from "./SectionRegistry.js";
import type { PromptContext } from "./types/context.js";

function ctx(): PromptContext {
  return {
    mode: "full",
    taskType: "coding",
    taskTypeInferred: false,
    provider: "gemini",
    aiName: "Leanna",
    agents: { enabled: true },
    tools: { available: [], enabled: [] },
  };
}

test("C7 — section exclue quand sa dépendance est absente", () => {
  const reg = new SectionRegistry();
  reg.set({
    id: "needs-safety",
    scope: ["coding"],
    content: "dépend de safety.core",
    requires: ["safety.core"],
  });

  const activeRuleIds = new Set<string>(); // safety.core absent
  const selected = reg.select(ctx(), activeRuleIds);
  assert.ok(!selected.some(s => s.id === "needs-safety"));
});

test("C7 — section incluse quand sa dépendance est présente", () => {
  const reg = new SectionRegistry();
  reg.set({
    id: "needs-safety",
    scope: ["coding"],
    content: "dépend de safety.core",
    requires: ["safety.core"],
  });

  const activeRuleIds = new Set<string>(["safety.core"]);
  const selected = reg.select(ctx(), activeRuleIds);
  assert.ok(selected.some(s => s.id === "needs-safety"));
});

test("C7 — sans activeRuleIds, pas de vérification (rétrocompat)", () => {
  const reg = new SectionRegistry();
  reg.set({
    id: "needs-safety",
    scope: ["coding"],
    content: "x",
    requires: ["safety.core"],
  });
  const selected = reg.select(ctx()); // pas d'activeRuleIds
  assert.ok(selected.some(s => s.id === "needs-safety"));
});
