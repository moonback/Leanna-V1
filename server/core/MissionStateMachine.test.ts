import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  MissionStateMachine,
  IllegalTransitionError,
  toGoalStatus,
  TERMINAL_STATES,
} from "./MissionStateMachine.js";
import { DurableMissionStore } from "./DurableMissionStore.js";

test("legal transitions follow the P0 lifecycle", () => {
  const m = new MissionStateMachine("m1");
  assert.equal(m.current, "CREATED");
  m.transition("PLANNING");
  m.transition("READY");
  m.transition("RUNNING");
  m.transition("VERIFYING");
  m.transition("COMMITTING");
  m.transition("COMPLETED");
  assert.equal(m.current, "COMPLETED");
  assert.equal(m.isTerminal(), true);
  // L'historique retrace exactement les 6 transitions.
  assert.equal(m.snapshot().history.length, 6);
});

test("illegal transitions throw and leave state unchanged", () => {
  const m = new MissionStateMachine("m2");
  assert.throws(() => m.transition("COMPLETED"), IllegalTransitionError);
  assert.equal(m.current, "CREATED");
  assert.equal(m.canTransition("RUNNING"), false);
  assert.equal(m.canTransition("PLANNING"), true);
});

test("terminal states have no outgoing transitions", () => {
  for (const terminal of TERMINAL_STATES) {
    const m = new MissionStateMachine("mt", terminal);
    assert.equal(m.isTerminal(), true);
    assert.throws(() => m.transition("RUNNING"), IllegalTransitionError);
  }
});

test("recovery loop: RUNNING -> RECOVERING -> RUNNING is allowed", () => {
  const m = new MissionStateMachine("m3", "RUNNING");
  m.transition("RECOVERING", "verify failed");
  m.transition("RUNNING", "retry after repair");
  assert.equal(m.current, "RUNNING");
});

test("cancel is reachable from any non-terminal state", () => {
  const m = new MissionStateMachine("m4", "WAITING_APPROVAL");
  m.transition("CANCELLED", "user aborted");
  assert.equal(m.current, "CANCELLED");
});

test("toGoalStatus maps lifecycle states to legacy GoalStatus", () => {
  assert.equal(toGoalStatus("CREATED"), "pending");
  assert.equal(toGoalStatus("RUNNING"), "in_progress");
  assert.equal(toGoalStatus("WAITING_APPROVAL"), "blocked");
  assert.equal(toGoalStatus("COMPLETED"), "completed");
  assert.equal(toGoalStatus("FAILED"), "failed");
  assert.equal(toGoalStatus("CANCELLED"), "cancelled");
});

test("DurableMissionStore persists and resumes across a simulated crash", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-msm-"));
  const store = new DurableMissionStore(dir);

  const m = new MissionStateMachine("mission-abc");
  m.transition("PLANNING");
  store.save(m);
  m.transition("READY");
  store.save(m);
  m.transition("RUNNING");
  store.save(m);

  // "Crash" : nouvelle instance de store, on relit uniquement le disque.
  const store2 = new DurableMissionStore(dir);
  const resumed = store2.load("mission-abc");
  assert.ok(resumed);
  assert.equal(resumed!.current, "RUNNING");
  // La reprise peut poursuivre le cycle de vie.
  resumed!.transition("VERIFYING");
  assert.equal(resumed!.current, "VERIFYING");

  // listResumable ne retourne que les missions non terminales.
  const resumable = store2.listResumable();
  assert.equal(resumable.length, 1);
  assert.equal(resumable[0].missionId, "mission-abc");

  fs.rmSync(dir, { recursive: true, force: true });
});

test("DurableMissionStore excludes terminal missions from resumable list", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-msm-"));
  const store = new DurableMissionStore(dir);

  const done = new MissionStateMachine("done", "COMMITTING");
  done.transition("COMPLETED");
  store.save(done);

  assert.equal(store.listSnapshots().length, 1);
  assert.equal(store.listResumable().length, 0);

  fs.rmSync(dir, { recursive: true, force: true });
});
