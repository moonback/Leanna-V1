import test from "node:test";
import assert from "node:assert/strict";
import { EventBus } from "../runtime/EventBus.js";
import type { RuntimeEvent } from "../runtime/types.js";
import { AnticipationEngine } from "./AnticipationEngine.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Minimal AgentRuntime double exposing only what the engine reads. */
function fakeRuntime(stats = { failed: 0 }) {
  const events = new EventBus();
  return {
    events,
    getStats: () => ({ tasks: { failed: stats.failed } }),
  };
}

/** Capture every autonomy:anticipation event emitted on the bus. */
function captureProposals(events: EventBus) {
  const seen: Array<Extract<RuntimeEvent, { type: "autonomy:anticipation" }>> = [];
  events.on("autonomy:anticipation", (event) => seen.push(event));
  return seen;
}

const emptyStrategy = { getFailingSkills: () => [] } as never;
const emptyLearning = {
  getPatternsHistory: () => ({ errorPatterns: [], successPatterns: [], optimizations: [], decisions: [] }),
} as never;

test("reactive: a failed runtime task becomes a problem proposal", async () => {
  const runtime = fakeRuntime();
  const seen = captureProposals(runtime.events);
  const engine = new AnticipationEngine(runtime as never, {
    strategyMemory: emptyStrategy,
    learningEngine: emptyLearning,
  });
  engine.start();

  runtime.events.emit({ type: "task:failed", taskId: "t-1", error: "boom" });
  await sleep(5);

  assert.equal(seen.length, 1);
  assert.equal(seen[0].kind, "problem");
  assert.ok(seen[0].importance >= 0.4);
  assert.ok(seen[0].affectedResources.includes("t-1"));
  engine.stop();
});

test("reactive: identical signals are deduplicated within the window", async () => {
  const runtime = fakeRuntime();
  const seen = captureProposals(runtime.events);
  const engine = new AnticipationEngine(runtime as never, {
    strategyMemory: emptyStrategy,
    learningEngine: emptyLearning,
  });
  engine.start();

  runtime.events.emit({ type: "task:failed", taskId: "dup", error: "boom" });
  runtime.events.emit({ type: "task:failed", taskId: "dup", error: "boom" });
  await sleep(5);

  assert.equal(seen.length, 1, "duplicate signal class should emit a single proposal");
  engine.stop();
});

test("reactive: a permission denial is classified as a risk", async () => {
  const runtime = fakeRuntime();
  const seen = captureProposals(runtime.events);
  const engine = new AnticipationEngine(runtime as never, {
    strategyMemory: emptyStrategy,
    learningEngine: emptyLearning,
  });
  engine.start();

  runtime.events.emit({
    type: "tool:permissionDenied",
    toolName: "fs_delete",
    required: [],
    missing: ["undeclared"],
    mode: "enforce",
    enforced: true,
  });
  await sleep(5);

  assert.equal(seen.length, 1);
  assert.equal(seen[0].kind, "risk");
  engine.stop();
});

test("proactive sweep: failing skills surface a problem proposal", () => {
  const runtime = fakeRuntime();
  const seen = captureProposals(runtime.events);
  const strategy = {
    getFailingSkills: () => [
      { skillName: "flaky_tool", totalCalls: 10, successRate: 0.2, recentSuccessRate: 0.1, avgDurationMs: 100, failing: true },
    ],
  } as never;
  const engine = new AnticipationEngine(runtime as never, {
    strategyMemory: strategy,
    learningEngine: emptyLearning,
  });

  const emitted = engine.sweepNow();

  assert.ok(emitted.some((p) => p.kind === "problem" && p.affectedResources.includes("flaky_tool")));
  assert.ok(seen.some((e) => e.affectedResources.includes("flaky_tool")));
});

test("proactive sweep: recurring error pattern is reported with its count", () => {
  const runtime = fakeRuntime();
  const learning = {
    getPatternsHistory: () => ({
      errorPatterns: [
        {
          type: "error_pattern",
          signature: "err-sig-1",
          description: "TypeScript error TS2345 in src/foo.ts",
          occurrenceCount: 4,
          sourceIds: ["a", "b", "c", "d"],
          relatedFiles: ["src/foo.ts"],
          aggregatedImportance: 0.6,
          isRecurring: true,
        },
      ],
      successPatterns: [],
      optimizations: [],
      decisions: [],
    }),
  } as never;
  const engine = new AnticipationEngine(runtime as never, {
    strategyMemory: emptyStrategy,
    learningEngine: learning,
  });

  const emitted = engine.sweepNow();
  const proposal = emitted.find((p) => p.fingerprint === "sweep:error-pattern:err-sig-1");

  assert.ok(proposal, "recurring error pattern should produce a proposal");
  assert.ok(proposal!.message.includes("4 fois"));
});

test("proactive sweep: failed runtime tasks raise a risk proposal", () => {
  const runtime = fakeRuntime({ failed: 3 });
  const engine = new AnticipationEngine(runtime as never, {
    strategyMemory: emptyStrategy,
    learningEngine: emptyLearning,
  });

  const emitted = engine.sweepNow();

  assert.ok(emitted.some((p) => p.kind === "risk" && p.message.includes("3")));
});

test("auto-launch: high-importance actionable proposals are queued through submitTask", () => {
  const runtime = fakeRuntime({ failed: 20 }); // drives importance to the ceiling
  const submitted: string[] = [];
  const engine = new AnticipationEngine(runtime as never, {
    strategyMemory: emptyStrategy,
    learningEngine: emptyLearning,
    config: {
      sweepEveryTicks: 1,
      minImportance: 0.4,
      autoLaunchThreshold: 0.85,
      dedupeTtlMs: 600_000,
      historyLimit: 50,
      reflectEveryTicks: 0,
    },
    submitTask: (input) => {
      submitted.push(input.title);
      return {
        ...input,
        id: "task-1",
        createdAt: Date.now(),
        status: "pending",
        attempts: 0,
        maxRetries: 3,
        timeoutMs: 60_000,
      };
    },
  });

  const emitted = engine.sweepNow();
  const risk = emitted.find((p) => p.kind === "risk");

  assert.ok(risk, "a high failure count should produce a risk proposal");
  assert.equal(risk!.queuedAsTask, true, "high-importance proposal should be queued as a mission task");
  assert.equal(submitted.length, 1);
  assert.ok(submitted[0].startsWith("Anticipation:"));
});

test("without a submitTask seam, proposals are surfaced but never auto-launched", () => {
  const runtime = fakeRuntime({ failed: 20 });
  const engine = new AnticipationEngine(runtime as never, {
    strategyMemory: emptyStrategy,
    learningEngine: emptyLearning,
  });

  const emitted = engine.sweepNow();

  assert.ok(emitted.length > 0);
  assert.ok(emitted.every((p) => p.queuedAsTask === false));
});

test("proposals below minImportance are not emitted", async () => {
  const runtime = fakeRuntime();
  const seen = captureProposals(runtime.events);
  const engine = new AnticipationEngine(runtime as never, {
    strategyMemory: emptyStrategy,
    learningEngine: emptyLearning,
  });
  engine.start();

  // A routine, low-importance event (default perception importance 0.15).
  runtime.events.emit({ type: "agent:idle", agentId: "a-1" });
  await sleep(5);

  assert.equal(seen.length, 0);
  engine.stop();
});
