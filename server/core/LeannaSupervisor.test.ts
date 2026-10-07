import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { LeannaSupervisor, type MissionRunner } from "./LeannaSupervisor.js";
import { DurableMissionStore } from "./DurableMissionStore.js";
import { CheckpointManager, type FileGateway } from "./CheckpointManager.js";
import { EvidenceEngine } from "./EvidenceEngine.js";

function memGateway(initial: Record<string, string> = {}): FileGateway & { store: Map<string, string> } {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    store,
    exists: (p) => store.has(p),
    read: (p) => {
      const v = store.get(p);
      if (v === undefined) throw new Error(`missing ${p}`);
      return v;
    },
    write: (p, c) => void store.set(p, c),
    remove: (p) => void store.delete(p),
  };
}

function makeSupervisor(gateway?: FileGateway) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-sup-"));
  const sup = new LeannaSupervisor({
    maxAttempts: 3,
    missionStore: new DurableMissionStore(path.join(dir, "missions")),
    checkpoints: new CheckpointManager({ gateway: gateway ?? memGateway(), dirOverride: path.join(dir, "cp") }),
    evidence: new EvidenceEngine(path.join(dir, "ev")),
  });
  return { sup, dir };
}

test("nominal cycle reaches COMPLETED when evidence proves success", async () => {
  const { sup, dir } = makeSupervisor();
  const runner: MissionRunner = async () => ({
    success: true,
    touchedFiles: ["a.ts"],
    evidence: { filesModified: ["a.ts"], testsExecuted: [{ name: "unit", passed: true }] },
  });

  const result = await sup.runMission({ missionId: "m-ok", goal: "ship it", runner });
  assert.equal(result.finalState, "COMPLETED");
  assert.equal(result.attempts, 1);
  assert.equal(result.evidence?.passed, true);

  fs.rmSync(dir, { recursive: true, force: true });
});

test("failing evidence rolls back and escalates after max attempts", async () => {
  const gw = memGateway({ "a.ts": "original" });
  const { sup, dir } = makeSupervisor(gw);
  let attempts = 0;
  const runner: MissionRunner = async () => {
    attempts++;
    gw.write("a.ts", `broken-${attempts}`); // side effect that will be rolled back
    return {
      success: true, // runner claims success…
      touchedFiles: ["a.ts"],
      evidence: { filesModified: ["a.ts"], testsExecuted: [{ name: "unit", passed: false }] }, // …but proof says no
    };
  };

  const result = await sup.runMission({ missionId: "m-fail", goal: "fix", runner, plannedFiles: ["a.ts"] });
  assert.equal(result.finalState, "ESCALATED");
  assert.equal(result.attempts, 3, "it tried up to maxAttempts");
  // Proof beats narration: each failed attempt was rolled back to the original.
  assert.equal(gw.store.get("a.ts"), "original");

  fs.rmSync(dir, { recursive: true, force: true });
});

test("recovers on a later attempt: retry then succeed", async () => {
  const gw = memGateway({ "a.ts": "v0" });
  const { sup, dir } = makeSupervisor(gw);
  let attempts = 0;
  const runner: MissionRunner = async () => {
    attempts++;
    const passed = attempts >= 2; // fails once, then passes
    gw.write("a.ts", passed ? "fixed" : "still-broken");
    return {
      success: passed,
      touchedFiles: ["a.ts"],
      evidence: { filesModified: ["a.ts"], testsExecuted: [{ name: "unit", passed }] },
    };
  };

  const result = await sup.runMission({ missionId: "m-recover", goal: "fix flaky", runner, plannedFiles: ["a.ts"] });
  assert.equal(result.finalState, "COMPLETED");
  assert.equal(result.attempts, 2);
  // The committed attempt's change is preserved (not rolled back).
  assert.equal(gw.store.get("a.ts"), "fixed");

  fs.rmSync(dir, { recursive: true, force: true });
});

test("runner exception is treated as a failed attempt, not a crash", async () => {
  const { sup, dir } = makeSupervisor();
  const runner: MissionRunner = async () => {
    throw new Error("tool blew up");
  };
  const result = await sup.runMission({ missionId: "m-throw", goal: "risky", runner });
  assert.equal(result.finalState, "ESCALATED");

  fs.rmSync(dir, { recursive: true, force: true });
});

test("explicit escalate suggestion short-circuits retries", async () => {
  const { sup, dir } = makeSupervisor();
  let attempts = 0;
  const runner: MissionRunner = async () => {
    attempts++;
    return {
      success: false,
      suggestedRecovery: "escalate",
      evidence: { testsExecuted: [{ name: "unit", passed: false }] },
    };
  };
  const result = await sup.runMission({ missionId: "m-esc", goal: "hopeless", runner });
  assert.equal(result.finalState, "ESCALATED");
  assert.equal(attempts, 1, "escalated immediately, no further attempts");

  fs.rmSync(dir, { recursive: true, force: true });
});

test("mission state is persisted durably and ends terminal", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-sup-"));
  const store = new DurableMissionStore(path.join(dir, "missions"));
  const sup = new LeannaSupervisor({
    maxAttempts: 2,
    missionStore: store,
    checkpoints: new CheckpointManager({ gateway: memGateway(), dirOverride: path.join(dir, "cp") }),
    evidence: new EvidenceEngine(path.join(dir, "ev")),
  });

  const runner: MissionRunner = async () => ({
    success: true,
    evidence: { testsExecuted: [{ name: "unit", passed: true }] },
  });
  await sup.runMission({ missionId: "m-persist", goal: "persist", runner });

  const reloaded = store.load("m-persist");
  assert.ok(reloaded);
  assert.equal(reloaded!.current, "COMPLETED");
  assert.equal(reloaded!.isTerminal(), true);
  // The lifecycle history captured the full governed cycle.
  const states = reloaded!.snapshot().history.map((h) => h.to);
  assert.ok(states.includes("PLANNING"));
  assert.ok(states.includes("VERIFYING"));
  assert.ok(states.includes("COMMITTING"));

  fs.rmSync(dir, { recursive: true, force: true });
});
