import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProjectProfile } from "./ProjectProfile.js";
import { StrategyMemory } from "./StrategyMemory.js";
import { PlaybookStore } from "./PlaybookStore.js";
import { ProjectMemory } from "./ProjectMemory.js";

/** Create a throwaway project directory with the given files, auto-cleaned. */
function tempProject(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-profile-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, "utf-8");
  }
  test.after(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ } });
  return root;
}

/** A ProjectProfile wired to isolated, ephemeral engines and a temp root. */
function makeProfile(root: string, opts: { strategy?: StrategyMemory; playbooks?: PlaybookStore } = {}) {
  const strategy = opts.strategy ?? new StrategyMemory({ ephemeral: true });
  const playbooks = opts.playbooks ?? new PlaybookStore({ ephemeral: true });
  // ProjectMemory has no ephemeral mode; a real instance with no active workspace
  // reads back an empty fact set, which is exactly what we want for isolation.
  const projectMemory = new ProjectMemory();
  return new ProjectProfile({ ephemeral: true, strategyMemory: strategy, playbookStore: playbooks, projectMemory, root });
}

test("detects package manager, frameworks, languages and commands from package.json", () => {
  const root = tempProject({
    "package.json": JSON.stringify({
      scripts: { build: "vite build", test: "vitest run", lint: "eslint .", dev: "vite", typecheck: "tsc --noEmit" },
      dependencies: { react: "^18", express: "^4" },
      devDependencies: { vite: "^5", vitest: "^1" },
    }),
    "tsconfig.json": "{}",
    "yarn.lock": "",
  });

  const profile = makeProfile(root).refresh();

  assert.equal(profile.detected.packageManager, "yarn");
  assert.ok(profile.detected.languages.includes("typescript"));
  assert.deepEqual(profile.detected.frameworks.sort(), ["express", "react", "vite", "vitest"]);
  assert.equal(profile.detected.commands.build, "yarn run build");
  assert.equal(profile.detected.commands.test, "yarn run test");
  assert.equal(profile.detected.commands.typecheck, "yarn run typecheck");
  assert.equal(profile.detected.hasTests, true);
  assert.equal(profile.detected.hasTsConfig, true);
});

test("falls back to npm and detects a test directory without a test script", () => {
  const root = tempProject({
    "package.json": JSON.stringify({ scripts: { build: "node build.js" } }),
    "tests/example.test.js": "",
  });

  const profile = makeProfile(root).refresh();

  assert.equal(profile.detected.packageManager, "npm");
  assert.ok(profile.detected.languages.includes("javascript"));
  assert.equal(profile.detected.commands.build, "npm run build");
  assert.equal(profile.detected.hasTests, true, "a tests/ directory counts as tests present");
});

test("aggregates effective and failing strategies from StrategyMemory", () => {
  const root = tempProject({ "package.json": "{}" });
  const strategy = new StrategyMemory({ ephemeral: true });
  // "reliable" succeeds consistently; "flaky" fails consistently (enough evidence).
  for (let i = 0; i < 6; i++) strategy.recordSkillOutcome("reliable_tool", true, 50);
  for (let i = 0; i < 6; i++) strategy.recordSkillOutcome("flaky_tool", false, 50);

  const profile = makeProfile(root, { strategy }).refresh();

  assert.ok(profile.strategies.effective.includes("reliable_tool"));
  assert.ok(profile.strategies.failing.includes("flaky_tool"));
  assert.ok(!profile.strategies.effective.includes("flaky_tool"));
});

test("surfaces learned playbooks from PlaybookStore", () => {
  const root = tempProject({ "package.json": "{}" });
  const playbooks = new PlaybookStore({ ephemeral: true });
  playbooks.learnFromMission({
    id: "m1", title: "Fix TS", status: "completed",
    errors: [{ error: "error TS2345" }], relevantFiles: [],
    goals: { g1: { status: "completed", parentId: "root", plannedActions: [
      { skillName: "read_code", order: 0, status: "completed" },
      { skillName: "str_replace", order: 1, status: "completed" },
    ] }, root: { status: "completed", parentId: null, plannedActions: [] } },
  });

  const profile = makeProfile(root, { playbooks }).refresh();

  assert.equal(profile.strategies.playbooks.length, 1);
  assert.equal(profile.strategies.playbooks[0].triggerSignature, "ts-error");
});

test("records mission outcomes and preferences, and persists them in-session", () => {
  const root = tempProject({ "package.json": "{}" });
  const profile = makeProfile(root);
  profile.refresh();

  profile.recordMissionOutcome(true);
  profile.recordMissionOutcome(true);
  profile.recordMissionOutcome(false);
  profile.setPreference("commitStyle", "conventional");

  const p = profile.getProfile();
  assert.equal(p.missionStats.completed, 2);
  assert.equal(p.missionStats.failed, 1);
  assert.equal(p.preferences.commitStyle, "conventional");
});

test("toContextSummary produces a readable brain for prompt injection", () => {
  const root = tempProject({
    "package.json": JSON.stringify({ scripts: { build: "vite build", test: "vitest run" }, dependencies: { react: "^18" } }),
    "tsconfig.json": "{}",
  });
  const profile = makeProfile(root);
  profile.refresh();
  profile.setPreference("formatter", "prettier");

  const summary = profile.toContextSummary();
  assert.match(summary, /Profil du projet/);
  assert.match(summary, /react/);
  assert.match(summary, /build=`npm run build`/);
  assert.match(summary, /formatter=prettier/);
});

test("empty project yields a safe, empty profile without throwing", () => {
  const root = tempProject({});
  const profile = makeProfile(root).refresh();
  assert.equal(profile.detected.packageManager, "none");
  assert.deepEqual(profile.detected.frameworks, []);
  assert.equal(profile.detected.hasTests, false);
});
