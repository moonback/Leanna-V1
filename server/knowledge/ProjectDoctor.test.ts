import test from "node:test";
import assert from "node:assert/strict";
import { ProjectDoctor, type ProjectDoctorOptions } from "./ProjectDoctor.js";

/** Fakes for each signal source, defaulting to a perfectly healthy project. */
function makeDoctor(overrides: {
  cycles?: Array<{ files: string[]; length: number }>;
  critical?: Array<{ filePath: string; dependentsCount: number }>;
  files?: Array<{ path: string; lines: number }>;
  averageFileSize?: number;
  bugs?: Array<{ sourceFile?: string }>;
  todos?: unknown[];
  failing?: Array<{ skillName: string }>;
  detected?: Partial<{
    packageManager: string;
    frameworks: string[];
    languages: string[];
    commands: Record<string, string>;
    hasTests: boolean;
    hasTsConfig: boolean;
    isGit: boolean;
  }>;
} = {}) {
  const options: ProjectDoctorOptions = {
    dependencyGraph: {
      detectCycles: () => overrides.cycles ?? [],
      getCriticalModules: () => overrides.critical ?? [],
    } as never,
    knowledgeGraph: {
      getStats: () => ({ averageFileSize: overrides.averageFileSize ?? 150 }),
      getAllFiles: () => overrides.files ?? [],
    } as never,
    projectProfile: {
      getProfile: () => ({
        detected: {
          packageManager: "npm",
          frameworks: ["react"],
          languages: ["typescript"],
          commands: { build: "npm run build", test: "npm run test", lint: "npm run lint" },
          hasTests: true,
          hasTsConfig: true,
          isGit: true,
          ...(overrides.detected ?? {}),
        },
      }),
    } as never,
    projectMemory: {
      getAllFacts: (category?: string) =>
        category === "known-bug" ? (overrides.bugs ?? []) : category === "todo" ? (overrides.todos ?? []) : [],
    } as never,
    strategyMemory: {
      getFailingSkills: () => overrides.failing ?? [],
    } as never,
  };
  return new ProjectDoctor(options);
}

test("a healthy project scores near-perfect with no issues", () => {
  const report = makeDoctor().diagnose();
  assert.equal(report.issues.length, 0);
  assert.equal(report.improvementMissions.length, 0);
  assert.ok(report.global >= 95, `expected high global score, got ${report.global}`);
  for (const dim of Object.keys(report.scores)) {
    assert.ok(report.scores[dim as keyof typeof report.scores] >= 90);
  }
});

test("dependency cycles degrade architecture and raise an issue", () => {
  const report = makeDoctor({
    cycles: [{ files: ["a.ts", "b.ts"], length: 2 }, { files: ["c.ts", "d.ts"], length: 2 }],
  }).diagnose();

  assert.ok(report.scores.architecture < 100);
  const issue = report.issues.find((i) => i.dimension === "architecture" && i.message.includes("cycle"));
  assert.ok(issue);
  assert.ok(issue!.affectedResources.includes("a.ts"));
});

test("missing tests heavily penalizes the tests dimension", () => {
  const report = makeDoctor({ detected: { hasTests: false, commands: { build: "npm run build" } } }).diagnose();
  assert.ok(report.scores.tests <= 50);
  assert.ok(report.issues.some((i) => i.dimension === "tests" && i.severity === "high"));
});

test("known bugs and todos reduce the technical-debt score", () => {
  const report = makeDoctor({
    bugs: [{ sourceFile: "x.ts" }, { sourceFile: "y.ts" }, { sourceFile: "z.ts" }],
    todos: new Array(8).fill({}),
  }).diagnose();
  assert.ok(report.scores.technicalDebt < 80);
  assert.ok(report.issues.some((i) => i.dimension === "technicalDebt" && i.message.includes("bug")));
});

test("failing skills degrade the autonomy dimension", () => {
  const report = makeDoctor({ failing: [{ skillName: "flaky_a" }, { skillName: "flaky_b" }, { skillName: "flaky_c" }] }).diagnose();
  assert.ok(report.scores.autonomy < 80);
  const issue = report.issues.find((i) => i.dimension === "autonomy");
  assert.ok(issue?.affectedResources.includes("flaky_a"));
});

test("folds an external security audit signal into the security score", () => {
  const report = makeDoctor().diagnose({ security: { critical: 1, high: 2, medium: 0, low: 3 } });
  assert.ok(report.scores.security < 60);
  const issue = report.issues.find((i) => i.dimension === "security");
  assert.equal(issue?.severity, "critical");
});

test("generates prioritized improvement missions ordered by severity", () => {
  const report = makeDoctor({
    cycles: [{ files: ["a.ts", "b.ts"], length: 2 }],
    detected: { hasTests: false },
    failing: [{ skillName: "x" }],
  }).diagnose({ security: { critical: 2, high: 0, medium: 0, low: 0 } });

  assert.ok(report.improvementMissions.length > 0);
  // Critical security issue should surface before lower-severity ones.
  assert.equal(report.improvementMissions[0].priority, "critical");
  assert.equal(report.improvementMissions[0].dimension, "security");
});

test("summary renders a PROJECT HEALTH report with a global score", () => {
  const report = makeDoctor({ detected: { hasTests: false } }).diagnose();
  assert.match(report.summary, /PROJECT HEALTH/);
  assert.match(report.summary, /GLOBAL/);
  assert.match(report.summary, /Plan d'amélioration/);
});

test("large files penalize performance", () => {
  const report = makeDoctor({
    files: [{ path: "huge.ts", lines: 1200 }, { path: "big.ts", lines: 900 }],
  }).diagnose();
  assert.ok(report.scores.performance < 100);
  assert.ok(report.issues.some((i) => i.dimension === "performance" && i.affectedResources.includes("huge.ts")));
});
