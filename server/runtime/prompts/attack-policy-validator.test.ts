/**
 * Test d'attaque C9 — PolicyValidator.
 *
 * Prouve que les configurations incohérentes sont détectées : ID dupliqué,
 * dépendance cassée, cycle, P0/P1 manquant, scope invalide, tie P0 non
 * départageable, section critique absente. Et que la politique core réelle
 * passe la validation en mode strict.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { PolicyValidator } from "./PolicyValidator.js";
import { CORE_RULES } from "./rules/core.js";
import { RulePriority, type PromptRule } from "./types/rules.js";

function rule(partial: Partial<PromptRule> & { id: string }): PromptRule {
  return {
    priority: RulePriority.TOOLS,
    scope: ["global"],
    content: partial.id,
    ...partial,
  };
}

const v = new PolicyValidator();

function codes(rules: PromptRule[], sections: any[] = [], critical: string[] = []): string[] {
  return v.validate({ rules, sections, criticalSectionIds: critical }).issues.map(i => i.code);
}

test("C9 — ID de règle dupliqué détecté", () => {
  const rules = [rule({ id: "x", priority: RulePriority.SAFETY }), rule({ id: "x", priority: RulePriority.AUTHORITY })];
  assert.ok(codes(rules).includes("DUPLICATE_RULE_ID"));
});

test("C9 — absence de P0 et P1 détectée", () => {
  const rules = [rule({ id: "only.style", priority: RulePriority.STYLE })];
  const c = codes(rules);
  assert.ok(c.includes("MISSING_P0"));
  assert.ok(c.includes("MISSING_P1"));
});

test("C9 — requires vers une règle inexistante détecté", () => {
  const rules = [
    rule({ id: "a", priority: RulePriority.SAFETY }),
    rule({ id: "b", priority: RulePriority.AUTHORITY, requires: ["ghost"] }),
  ];
  assert.ok(codes(rules).includes("UNKNOWN_REQUIRES"));
});

test("C9 — cycle de dépendance détecté", () => {
  const rules = [
    rule({ id: "a", priority: RulePriority.SAFETY, requires: ["b"] }),
    rule({ id: "b", priority: RulePriority.AUTHORITY, requires: ["a"] }),
  ];
  assert.ok(codes(rules).includes("DEPENDENCY_CYCLE"));
});

test("C9 — scope invalide détecté", () => {
  const rules = [
    rule({ id: "a", priority: RulePriority.SAFETY, scope: ["nope" as any] }),
    rule({ id: "b", priority: RulePriority.AUTHORITY }),
  ];
  assert.ok(codes(rules).includes("INVALID_SCOPE"));
});

test("C9 — tie P0 non départageable détecté comme critique", () => {
  const rules = [
    rule({ id: "a", priority: RulePriority.SAFETY, conflictsWith: ["b"] }),
    rule({ id: "b", priority: RulePriority.SAFETY, conflictsWith: ["a"] }),
    rule({ id: "p1", priority: RulePriority.AUTHORITY }),
  ];
  const res = v.validate({ rules, sections: [] });
  const tie = res.issues.find(i => i.code === "UNRESOLVABLE_TIE");
  assert.ok(tie && tie.severity === "critical");
});

test("C9 — section critique absente détectée", () => {
  const rules = [
    rule({ id: "a", priority: RulePriority.SAFETY }),
    rule({ id: "b", priority: RulePriority.AUTHORITY }),
  ];
  assert.ok(codes(rules, [], ["safety"]).includes("MISSING_CRITICAL_SECTION"));
});

test("C9 — la politique core réelle passe la validation (pas de critique)", () => {
  const res = v.validate({ rules: CORE_RULES, sections: [] });
  assert.deepEqual(
    res.critical.map(i => i.code),
    [],
    `problèmes critiques inattendus : ${JSON.stringify(res.critical)}`,
  );
});
