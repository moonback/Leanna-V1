import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  EvidenceEngine,
  deriveConfidence,
  evidenceEstablishesSuccess,
  type EvidenceBundle,
} from "./EvidenceEngine.js";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "leanna-evidence-"));
}

function base(): Omit<EvidenceBundle, "confidence" | "passed"> {
  return {
    missionId: "m1",
    goal: "do the thing",
    createdAt: new Date().toISOString(),
    changes: [],
    filesModified: [],
    filesRead: [],
    toolsExecuted: [],
    testsExecuted: [],
    runtimeChecks: [],
    approvals: [],
    policyDecisions: [],
    unresolvedRisks: [],
  };
}

test("a failing check makes passed=false regardless of narration", () => {
  const engine = new EvidenceEngine(tmpDir());
  const bundle = engine.build({
    missionId: "m1",
    goal: "add feature",
    filesModified: ["a.ts"],
    testsExecuted: [{ name: "unit", passed: false, details: "1 failing" }],
  });
  assert.equal(bundle.passed, false);
  assert.ok(bundle.confidence < 0.3, "confidence collapses when a check fails");
});

test("all checks passing yields high confidence and passed=true", () => {
  const engine = new EvidenceEngine(tmpDir());
  const bundle = engine.build({
    missionId: "m2",
    goal: "fix bug",
    filesModified: ["a.ts"],
    testsExecuted: [{ name: "unit", passed: true }],
    typecheck: { name: "tsc", passed: true },
  });
  assert.equal(bundle.passed, true);
  assert.ok(bundle.confidence >= 0.8);
});

test("confidence is bounded within [0,1]", () => {
  const withRisks = { ...base(), filesModified: ["a.ts"], testsExecuted: [{ name: "t", passed: true }], unresolvedRisks: ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9", "r10", "r11"] };
  const c = deriveConfidence(withRisks);
  assert.ok(c >= 0 && c <= 1);
});

test("no observable evidence floors confidence", () => {
  const c = deriveConfidence(base());
  assert.equal(c, 0.1);
});

test("evidenceEstablishesSuccess is true only when no executed check failed", () => {
  assert.equal(evidenceEstablishesSuccess({ ...base(), testsExecuted: [{ name: "t", passed: true }] }), true);
  assert.equal(evidenceEstablishesSuccess({ ...base(), lint: { name: "lint", passed: false } }), false);
});

test("bundle persists and reloads from disk (proof survives a restart)", () => {
  const dir = tmpDir();
  const engine = new EvidenceEngine(dir);
  const saved = engine.record({
    missionId: "m-persist",
    goal: "persist me",
    filesModified: ["x.ts"],
    changes: [{ path: "x.ts", hashBefore: "aaa", hashAfter: "bbb" }],
    typecheck: { name: "tsc", passed: true },
  });

  const engine2 = new EvidenceEngine(dir);
  const loaded = engine2.load("m-persist");
  assert.ok(loaded);
  assert.equal(loaded!.goal, "persist me");
  assert.deepEqual(loaded!.changes, saved.changes);
  assert.equal(loaded!.passed, true);

  fs.rmSync(dir, { recursive: true, force: true });
});
