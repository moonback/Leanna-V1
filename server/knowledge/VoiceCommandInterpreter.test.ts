import test from "node:test";
import assert from "node:assert/strict";
import { VoiceCommandInterpreter } from "./VoiceCommandInterpreter.js";

const vci = new VoiceCommandInterpreter();

test("parses the canonical multi-command voice session", () => {
  const r = vci.interpret(
    "Leanna, regarde mon projet. Trouve les trois problèmes les plus importants. Corrige le premier. Lance les tests. Si tout est bon, commit.",
  );
  assert.equal(r.wakeWord, true);
  const intents = r.commands.map((c) => c.intent);
  assert.deepEqual(intents, ["diagnose", "find_issues", "fix", "test", "commit"]);
});

test("detects the wake word and strips it", () => {
  const r = vci.interpret("Leanna, lance les tests.");
  assert.equal(r.wakeWord, true);
  assert.equal(r.commands[0].intent, "test");
  assert.ok(!r.commands[0].utterance.toLowerCase().startsWith("leanna"));
});

test("maps intents to real skills", () => {
  const r = vci.interpret("diagnostique mon projet, puis fais-moi le briefing");
  const diag = r.commands.find((c) => c.intent === "diagnose");
  const brief = r.commands.find((c) => c.intent === "briefing");
  assert.equal(diag?.skill, "knowledge_project_doctor");
  assert.equal(brief?.skill, "knowledge_daily_briefing");
});

test("extracts an ordinal target", () => {
  const r = vci.interpret("corrige le premier");
  assert.equal(r.commands[0].intent, "fix");
  assert.equal(r.commands[0].target?.ordinal, 1);
});

test("extracts a count target from a number word", () => {
  const r = vci.interpret("trouve les trois problèmes importants");
  assert.equal(r.commands[0].intent, "find_issues");
  assert.equal(r.commands[0].target?.count, 3);
});

test("attaches a standalone condition to the next command", () => {
  const r = vci.interpret("lance les tests. Si tout est bon, commit.");
  const commit = r.commands.find((c) => c.intent === "commit");
  assert.ok(commit);
  assert.match(commit!.condition ?? "", /si tout est bon/i);
});

test("flags risky intents as requiring confirmation", () => {
  const r = vci.interpret("corrige le bug et commit");
  const fix = r.commands.find((c) => c.intent === "fix");
  const commit = r.commands.find((c) => c.intent === "commit");
  assert.equal(fix?.requiresConfirmation, true);
  assert.equal(commit?.requiresConfirmation, true);
});

test("read-only intents do not require confirmation", () => {
  const r = vci.interpret("regarde mon projet et fais le résumé");
  assert.ok(r.commands.every((c) => c.intent === "diagnose" || c.intent === "briefing"));
  assert.ok(r.commands.every((c) => c.requiresConfirmation === false));
});

test("extracts an open-file target", () => {
  const r = vci.interpret("ouvre le fichier src/server.ts");
  assert.equal(r.commands[0].intent, "open");
  assert.equal(r.commands[0].target?.text, "src/server.ts");
});

test("extracts a search query", () => {
  const r = vci.interpret("cherche les meilleures pratiques de sécurité JWT");
  assert.equal(r.commands[0].intent, "search");
  assert.match(r.commands[0].target?.text ?? "", /sécurité jwt/i);
});

test("recognizes a stop command", () => {
  const r = vci.interpret("Leanna, arrête tout");
  assert.equal(r.commands[0].intent, "stop");
});

test("unrecognized clauses are reported, not guessed", () => {
  const r = vci.interpret("fais un truc vague et indéfini xyz");
  assert.ok(r.unrecognized.length >= 1);
});

test("summary lists the ordered command plan", () => {
  const r = vci.interpret("Leanna, diagnostique le projet puis corrige le premier");
  assert.match(r.summary, /Commandes vocales/);
  assert.match(r.summary, /mot d'activation/);
  assert.match(r.summary, /knowledge_project_doctor/);
  assert.match(r.summary, /confirmation requise/);
});

test("works without a wake word (still interprets commands)", () => {
  const r = vci.interpret("lance les tests");
  assert.equal(r.wakeWord, false);
  assert.equal(r.commands[0].intent, "test");
});
