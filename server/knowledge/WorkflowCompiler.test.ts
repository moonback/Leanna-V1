import test from "node:test";
import assert from "node:assert/strict";
import { WorkflowCompiler } from "./WorkflowCompiler.js";

const compiler = new WorkflowCompiler();

test("compiles the canonical weekly repo-scan → report automation", () => {
  const { workflow, warnings } = compiler.compile(
    "Tous les lundis matin, vérifie mes repositories GitHub, détecte les issues critiques et prépare-moi un rapport, puis notifie-moi.",
  );
  assert.equal(workflow.trigger.type, "schedule");
  assert.match(workflow.schedule ?? "", /weekly:mon/);
  const actions = workflow.steps.map((s) => s.action);
  assert.ok(actions.includes("github_list_prs"));
  assert.ok(actions.includes("knowledge_project_doctor"));
  assert.ok(actions.includes("knowledge_daily_briefing"));
  assert.ok(actions.includes("notify"));
  assert.equal(warnings.length, 0);
});

test("parses a daily morning schedule with a default time", () => {
  const { workflow } = compiler.compile("Chaque matin, lance un audit de sécurité et prépare un résumé.");
  assert.equal(workflow.trigger.type, "schedule");
  assert.match(workflow.schedule ?? "", /daily:08:00/);
});

test("parses an interval schedule", () => {
  const { workflow } = compiler.compile("Toutes les 30 minutes, vérifie l'état des tests.");
  assert.equal(workflow.trigger.type, "schedule");
  assert.equal(workflow.schedule, "30m");
});

test("parses a weekday with an explicit time", () => {
  const { workflow } = compiler.compile("Tous les vendredis 17:30, génère un rapport.");
  assert.match(workflow.schedule ?? "", /weekly:fri@17:30/);
});

test("detects an event trigger", () => {
  const { workflow } = compiler.compile("Quand une mission échoue, lance un diagnostic et notifie-moi.");
  assert.equal(workflow.trigger.type, "event");
});

test("defaults to a manual trigger when no schedule/event is present", () => {
  const { workflow } = compiler.compile("Analyse le contexte du projet et génère un rapport.");
  assert.equal(workflow.trigger.type, "manual");
});

test("chains steps sequentially via dependsOn", () => {
  const { workflow } = compiler.compile("Analyse le code puis génère un rapport puis notifie-moi.");
  assert.ok(workflow.steps.length >= 3);
  assert.equal(workflow.steps[0].dependsOn, undefined);
  assert.deepEqual(workflow.steps[1].dependsOn, [workflow.steps[0].id]);
  assert.deepEqual(workflow.steps[2].dependsOn, [workflow.steps[1].id]);
});

test("unrecognized clauses become a placeholder step with a warning", () => {
  const { workflow, warnings } = compiler.compile("Fais quelque chose de totalement inédit et bizarre.");
  assert.ok(workflow.steps.some((s) => s.action === "TODO_choose_action"));
  assert.ok(warnings.length >= 1);
});

test("validates against an available-actions catalog and downgrades unknown actions", () => {
  // Catalog excludes github_list_prs → that mapped step must be downgraded.
  const limited = new WorkflowCompiler({ availableActions: ["knowledge_daily_briefing"] });
  const { workflow, warnings } = limited.compile("Vérifie mes repositories github et prépare un rapport.");
  const scan = workflow.steps.find((s) => s.label.includes("repositories"));
  assert.equal(scan?.action, "TODO_choose_action");
  assert.ok(warnings.some((w) => /catalogue/.test(w)));
  // The in-catalog action stays intact.
  assert.ok(workflow.steps.some((s) => s.action === "knowledge_daily_briefing"));
});

test("an empty request yields a single placeholder step and a warning", () => {
  const { workflow, warnings } = compiler.compile("   ");
  assert.equal(workflow.steps.length, 1);
  assert.equal(workflow.steps[0].action, "TODO_choose_action");
  assert.ok(warnings.length >= 1);
});

test("summary renders the trigger and numbered steps", () => {
  const { summary } = compiler.compile("Tous les lundis, génère un rapport et notifie-moi.");
  assert.match(summary, /Workflow compilé/);
  assert.match(summary, /Planifié/);
  assert.match(summary, /workflow_create/);
});
