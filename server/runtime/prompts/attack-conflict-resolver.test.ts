/**
 * Test d'attaque C5 — Déterminisme des conflits à priorité égale.
 *
 * Prouve que deux règles en conflit, de même priorité, produisent le MÊME
 * gagnant quel que soit l'ordre d'enregistrement — et que le cas P0 ambigu
 * échoue fermé (throw) au lieu de dépendre de l'ordre d'insertion.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { ConflictResolver } from "./ConflictResolver.js";
import { RulePriority, type PromptRule } from "./types/rules.js";

function rule(partial: Partial<PromptRule> & { id: string }): PromptRule {
  return {
    priority: RulePriority.TOOLS,
    scope: ["global"],
    content: partial.id,
    ...partial,
  };
}

test("C5 — restrictiveness départage à priorité égale, indépendamment de l'ordre", () => {
  const resolver = new ConflictResolver();

  const permissive = rule({ id: "p", conflictsWith: ["r"], restrictiveness: 0 });
  const restrictive = rule({ id: "r", conflictsWith: ["p"], restrictiveness: 5 });

  const a = resolver.resolve([permissive, restrictive]);
  const b = resolver.resolve([restrictive, permissive]);

  const survivorsA = a.rules.map(x => x.id).sort();
  const survivorsB = b.rules.map(x => x.id).sort();

  assert.deepEqual(survivorsA, survivorsB, "résultat dépendant de l'ordre");
  // Le plus restrictif survit dans les deux cas.
  assert.ok(a.rules.some(x => x.id === "r"));
  assert.ok(!a.rules.some(x => x.id === "p"));
});

test("C5 — égalité stricte hors P0/P1 est départagée par ID (stable)", () => {
  const resolver = new ConflictResolver();
  const x = rule({ id: "aaa", conflictsWith: ["bbb"] });
  const y = rule({ id: "bbb", conflictsWith: ["aaa"] });

  const r1 = resolver.resolve([x, y]).rules.map(r => r.id);
  const r2 = resolver.resolve([y, x]).rules.map(r => r.id);

  assert.deepEqual(r1, r2);
  assert.deepEqual(r1, ["aaa"]); // tri par ID : "aaa" < "bbb"
});

test("C5 — conflit P0 non départageable échoue fermé (throw)", () => {
  const resolver = new ConflictResolver();
  const p0a = rule({ id: "safety.a", priority: RulePriority.SAFETY, conflictsWith: ["safety.b"] });
  const p0b = rule({ id: "safety.b", priority: RulePriority.SAFETY, conflictsWith: ["safety.a"] });

  assert.throws(() => resolver.resolve([p0a, p0b]), /non départageable/i);
});
