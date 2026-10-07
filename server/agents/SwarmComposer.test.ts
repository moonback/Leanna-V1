import test from "node:test";
import assert from "node:assert/strict";
import { SwarmComposer } from "./SwarmComposer.js";
import { listAgentRoles } from "./roles.js";

const composer = new SwarmComposer();

test("always starts the pipeline with a researcher (understand first)", () => {
  const c = composer.plan({ objective: { title: "Ajouter l'authentification JWT" } });
  assert.equal(c.pipeline[0], "researcher");
});

test("a performance objective composes a performance-focused team", () => {
  const c = composer.plan({ objective: { title: "Optimise les performances de mon application" } });
  assert.ok(c.pipeline.includes("performance"));
  // Change is implied → a builder + verification + review are added.
  assert.ok(c.pipeline.includes("coder"));
  assert.ok(c.pipeline.includes("tester"));
  assert.ok(c.pipeline.includes("reviewer"));
});

test("a security objective includes the security agent", () => {
  const c = composer.plan({ objective: { title: "Audit de sécurité et correction des vulnérabilités XSS" } });
  assert.ok(c.pipeline.includes("security"));
});

test("the team is ordered as a coherent pipeline (research → build → verify → review)", () => {
  const c = composer.plan({ objective: { title: "Corrige le bug et refactorise le module auth" } });
  const idx = (r: string) => c.pipeline.indexOf(r);
  assert.ok(idx("researcher") < idx("tester"));
  if (c.pipeline.includes("reviewer")) assert.ok(idx("tester") <= idx("reviewer"));
});

test("planned write skills pull in a coder, and tests/review follow", () => {
  const c = composer.plan({
    objective: { title: "Mettre à jour la page profil" },
    plannedSkills: ["read_code", "str_replace", "fs_write"],
  });
  assert.ok(c.pipeline.includes("coder"));
  assert.ok(c.pipeline.includes("tester"));
  assert.ok(c.pipeline.includes("reviewer"));
});

test("every composed role is a real, registered agent (no invented roles)", () => {
  const c = composer.plan({ objective: { title: "Refactor, test, document et sécurise le module paiement" } });
  const roles = new Set(listAgentRoles());
  for (const member of c.members) {
    assert.ok(roles.has(member.role), `${member.role} should be a real registered role`);
  }
});

test("respects the max team size while keeping the essentials", () => {
  const c = composer.plan({
    objective: { title: "Refactorise, teste, revois, sécurise, optimise et documente tout le code" },
    maxMembers: 3,
  });
  assert.ok(c.members.length <= 3);
});

test("a documentation objective composes a doc-oriented team", () => {
  const c = composer.plan({ objective: { title: "Rédige la documentation et le guide d'installation" } });
  assert.ok(c.pipeline.includes("documentation"));
});

test("summary lists the pipeline and mentions teardown", () => {
  const c = composer.plan({ objective: { title: "Ajouter une fonctionnalité de recherche" } });
  assert.match(c.summary, /Équipe composée/);
  assert.match(c.summary, /→/);
  assert.match(c.summary, /dissoute/);
});

test("compose() returns a disposable handle whose dissolve() is safe to call", () => {
  const handle = composer.compose({ objective: { title: "Ajouter la pagination à l'API" } });
  assert.ok(Array.isArray(handle.pipeline));
  // Composition of static roles creates nothing dynamic → dissolve is a no-op.
  const { dissolved } = handle.dissolve();
  assert.deepEqual(dissolved, []);
});
