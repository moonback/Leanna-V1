import test from "node:test";
import assert from "node:assert/strict";
import { MissionSimulator, type SimulatorExecutor, type SimulatedMission, type DryRunReportView } from "./MissionSimulator.js";

/** Build a fake dry-run mission with the given plan and metrics. */
function fakeMission(opts: {
  id?: string;
  status?: string;
  plan?: Array<{ skillName: string; order: number; goalTitle: string }>;
  totalActions?: number;
  totalDurationMs?: number;
}): SimulatedMission {
  const id = opts.id ?? "sim-1";
  const status = opts.status ?? "completed";
  const goals: Record<string, { title: string; status: string; plannedActions: Array<{ skillName: string; args?: Record<string, unknown>; order: number; status: string }> }> = {};
  for (const step of opts.plan ?? []) {
    const key = step.goalTitle;
    goals[key] ??= { title: step.goalTitle, status: "completed", plannedActions: [] };
    goals[key].plannedActions.push({ skillName: step.skillName, order: step.order, status: "completed" });
  }
  return {
    id,
    status,
    getState: () => ({
      title: "Refactor auth",
      description: "Refactor the auth module and run tests",
      status,
      goals,
      context: { relevantFiles: [] },
      metrics: { totalActions: opts.totalActions ?? (opts.plan?.length ?? 0), totalDurationMs: opts.totalDurationMs ?? 5000, estimatedTokens: 1234 },
    }),
  };
}

/** A fake executor that records the dryRun flag and returns a prepared mission. */
function fakeExecutor(mission: SimulatedMission): { exec: SimulatorExecutor; sawDryRun: () => boolean } {
  let dryRunSeen = false;
  const exec: SimulatorExecutor = {
    async startMission(params) { dryRunSeen = params.dryRun === true; return mission; },
    async waitForMission() { return mission; },
  };
  return { exec, sawDryRun: () => dryRunSeen };
}

test("always runs the mission in dry-run (no real side effects)", async () => {
  const { exec, sawDryRun } = fakeExecutor(fakeMission({ plan: [{ skillName: "read_code", order: 0, goalTitle: "Analyze" }] }));
  const sim = new MissionSimulator(exec);
  await sim.simulate({ title: "t", description: "d", availableSkills: [] });
  assert.equal(sawDryRun(), true);
});

test("surfaces the ordered plan with goals", async () => {
  const { exec } = fakeExecutor(fakeMission({
    plan: [
      { skillName: "read_code", order: 0, goalTitle: "Analyze" },
      { skillName: "str_replace", order: 1, goalTitle: "Apply" },
      { skillName: "run_tests", order: 0, goalTitle: "Verify" },
    ],
  }));
  const report = await new MissionSimulator(exec).simulate({ title: "t", description: "d", availableSkills: [] });
  assert.deepEqual(report.steps.map((s) => s.skillName), ["read_code", "str_replace", "run_tests"]);
  assert.ok(report.steps.some((s) => s.goalTitle === "Verify"));
});

test("derives files-would-change and commands-would-run from simulated effects", async () => {
  const dryRunReport: DryRunReportView = {
    totalSimulated: 3,
    byTool: { str_replace: 2, run_command: 1 },
    byEffect: { write: 2, exec: 1 },
    effects: [
      { toolName: "str_replace", effects: ["write"], args: { path: "src/auth.ts" } },
      { toolName: "fs_write", effects: ["write"], args: { file_path: "src/login.ts" } },
      { toolName: "run_command", effects: ["exec"], args: { command: "npm run build" } },
    ],
  };
  const { exec } = fakeExecutor(fakeMission({ plan: [{ skillName: "str_replace", order: 0, goalTitle: "Apply" }] }));
  const report = await new MissionSimulator(exec, { getDryRunReport: () => dryRunReport }).simulate({ title: "t", description: "d", availableSkills: [] });

  assert.deepEqual(report.filesWouldChange.sort(), ["src/auth.ts", "src/login.ts"]);
  assert.deepEqual(report.commandsWouldRun, ["npm run build"]);
  assert.equal(report.sideEffectsAvoided, 3);
});

test("infers involved agents from skill names", async () => {
  const { exec } = fakeExecutor(fakeMission({
    plan: [
      { skillName: "knowledge_search", order: 0, goalTitle: "Analyze" },
      { skillName: "str_replace", order: 1, goalTitle: "Apply" },
      { skillName: "run_tests", order: 2, goalTitle: "Verify" },
    ],
  }));
  const report = await new MissionSimulator(exec).simulate({ title: "t", description: "d", availableSkills: [] });
  assert.ok(report.agentsInvolved.includes("researcher"));
  assert.ok(report.agentsInvolved.includes("coder"));
  assert.ok(report.agentsInvolved.includes("tester"));
});

test("escalates risk level with commands and many file changes", async () => {
  const effects = Array.from({ length: 5 }, (_, i) => ({ toolName: "run_command", effects: ["exec"], args: { command: `cmd${i}` } }));
  const dryRunReport: DryRunReportView = { totalSimulated: 5, byTool: {}, byEffect: { exec: 5 }, effects };
  const { exec } = fakeExecutor(fakeMission({ plan: [{ skillName: "run_command", order: 0, goalTitle: "Build" }] }));
  const report = await new MissionSimulator(exec, { getDryRunReport: () => dryRunReport }).simulate({ title: "t", description: "d", availableSkills: [] });
  assert.equal(report.riskLevel, "critical");
});

test("a read-only plan with no effects is low risk", async () => {
  const dryRunReport: DryRunReportView = { totalSimulated: 0, byTool: {}, byEffect: {}, effects: [] };
  const { exec } = fakeExecutor(fakeMission({ plan: [{ skillName: "read_code", order: 0, goalTitle: "Analyze" }] }));
  const report = await new MissionSimulator(exec, { getDryRunReport: () => dryRunReport }).simulate({ title: "t", description: "d", availableSkills: [] });
  assert.equal(report.riskLevel, "low");
  assert.equal(report.filesWouldChange.length, 0);
});

test("folds a pre-flight estimate (cost/risk) when provided", async () => {
  const { exec } = fakeExecutor(fakeMission({ plan: [{ skillName: "str_replace", order: 0, goalTitle: "Apply" }] }));
  const report = await new MissionSimulator(exec, {
    getPlanEstimate: () => ({ estimatedCostUsd: 0.42, riskLevel: "high", risks: ["migration DB"] }),
  }).simulate({ title: "t", description: "d", availableSkills: [] });
  assert.equal(report.estimatedCostUsd, 0.42);
  assert.equal(report.riskLevel, "high");
  assert.ok(report.risks.includes("migration DB"));
});

test("summary renders the SIMULER preview with action buttons", async () => {
  const dryRunReport: DryRunReportView = {
    totalSimulated: 1, byTool: {}, byEffect: { write: 1 },
    effects: [{ toolName: "str_replace", effects: ["write"], args: { path: "a.ts" } }],
  };
  const { exec } = fakeExecutor(fakeMission({ plan: [{ skillName: "str_replace", order: 0, goalTitle: "Apply" }], totalDurationMs: 312000 }));
  const report = await new MissionSimulator(exec, { getDryRunReport: () => dryRunReport }).simulate({ title: "Refactor auth", description: "d", availableSkills: [] });
  assert.match(report.summary, /Simulation/);
  assert.match(report.summary, /\[Modifier le plan\] \[Exécuter\] \[Annuler\]/);
  assert.match(report.summary, /5m12/); // 312000ms formatted
});

test("flags an incomplete plan when the dry run did not complete", async () => {
  const { exec } = fakeExecutor(fakeMission({ status: "blocked", plan: [{ skillName: "read_code", order: 0, goalTitle: "Analyze" }] }));
  const report = await new MissionSimulator(exec).simulate({ title: "t", description: "d", availableSkills: [] });
  assert.equal(report.planComplete, false);
  assert.match(report.summary, /plan incomplet/);
});
