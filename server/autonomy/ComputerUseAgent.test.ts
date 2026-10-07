import test from "node:test";
import assert from "node:assert/strict";
import { ComputerUseAgent, type ComputerAction, type ComputerUseHandlers, type ActionOutcome } from "./ComputerUseAgent.js";

/** Build handlers from a scripted plan + spies. */
function harness(plan: ComputerAction[], opts: { confirm?: boolean; actFails?: boolean } = {}) {
  let step = 0;
  const acted: ComputerAction[] = [];
  const observed: ComputerAction[] = [];
  const confirmedFor: ComputerAction[] = [];
  const handlers: ComputerUseHandlers = {
    planNext: () => plan[step++] ?? { type: "done" },
    observe: (a): ActionOutcome => { observed.push(a); return { ok: true, observation: `obs-${observed.length}` }; },
    act: (a): ActionOutcome => { acted.push(a); return { ok: !opts.actFails, error: opts.actFails ? "boom" : undefined }; },
    confirm: opts.confirm === undefined ? undefined : (a) => { confirmedFor.push(a); return opts.confirm!; },
  };
  return { handlers, acted, observed, confirmedFor };
}

test("observe actions run freely without confirmation", async () => {
  const h = harness([{ type: "observe" }, { type: "done" }]);
  const agent = new ComputerUseAgent(h.handlers, { confirmAtOrAbove: "low" });
  const result = await agent.run("look at the screen");
  assert.equal(result.status, "completed");
  assert.ok(h.observed.length >= 1);
  assert.equal(h.acted.length, 0);
});

test("a side-effecting action requires confirmation and proceeds when granted", async () => {
  const h = harness([{ type: "click", target: "#ok" }, { type: "done" }], { confirm: true });
  const agent = new ComputerUseAgent(h.handlers, { confirmAtOrAbove: "low" });
  const result = await agent.run("click OK");
  assert.equal(result.status, "completed");
  assert.equal(h.confirmedFor.length, 1);
  assert.equal(h.acted.length, 1);
  assert.equal(h.acted[0].tool, "browser_click");
});

test("a risky action is blocked (fail-closed) when confirmation is denied", async () => {
  const h = harness([{ type: "click", target: "#submit" }], { confirm: false });
  const agent = new ComputerUseAgent(h.handlers, { confirmAtOrAbove: "low" });
  const result = await agent.run("submit the form");
  assert.equal(result.status, "blocked");
  assert.equal(h.acted.length, 0, "no action should run without confirmation");
  assert.match(result.steps[0].blocked ?? "", /non confirmée/);
});

test("with no confirm handler, side effects fail closed", async () => {
  const h = harness([{ type: "navigate", value: "https://x" }]);
  const agent = new ComputerUseAgent(h.handlers, { confirmAtOrAbove: "low" });
  const result = await agent.run("go somewhere");
  assert.equal(result.status, "blocked");
  assert.equal(h.acted.length, 0);
});

test("destructive clicks are classified high risk", async () => {
  const h = harness([{ type: "click", target: "#delete-account" }], { confirm: false });
  const agent = new ComputerUseAgent(h.handlers);
  const result = await agent.run("delete account");
  assert.equal(result.steps[0].risk, "high");
});

test("confirmAtOrAbove='high' lets low/medium side effects run without confirmation", async () => {
  const h = harness([{ type: "navigate", value: "https://x" }, { type: "done" }]);
  const agent = new ComputerUseAgent(h.handlers, { confirmAtOrAbove: "high" });
  const result = await agent.run("navigate");
  assert.equal(result.status, "completed");
  assert.equal(h.acted.length, 1, "medium-risk navigate runs when threshold is high");
  assert.equal(h.confirmedFor.length, 0);
});

test("the loop is bounded by maxSteps (anti-infinite-loop)", async () => {
  // Planner always observes, never says done.
  const handlers: ComputerUseHandlers = {
    planNext: () => ({ type: "observe" }),
    observe: () => ({ ok: true, observation: "x" }),
    act: () => ({ ok: true }),
  };
  const result = await new ComputerUseAgent(handlers, { maxSteps: 5 }).run("loop forever");
  assert.equal(result.status, "budget_exhausted");
  assert.equal(result.steps.length, 5);
});

test("a failed action stops the loop", async () => {
  const h = harness([{ type: "click", target: "#x" }], { confirm: true, actFails: true });
  const result = await new ComputerUseAgent(h.handlers, { confirmAtOrAbove: "low" }).run("click");
  assert.equal(result.status, "stopped");
});

test("after a side effect, the agent re-observes to verify", async () => {
  const h = harness([{ type: "click", target: "#x" }, { type: "done" }], { confirm: true });
  await new ComputerUseAgent(h.handlers, { confirmAtOrAbove: "low" }).run("click then verify");
  // One re-observation triggered by the click's verify step.
  assert.ok(h.observed.some((o) => o.tool === "browser_snapshot"));
});

test("summary reports status, steps and risk gating", async () => {
  const h = harness([{ type: "observe" }, { type: "click", target: "#ok" }, { type: "done" }], { confirm: true });
  const result = await new ComputerUseAgent(h.handlers, { confirmAtOrAbove: "low" }).run("do it");
  assert.match(result.summary, /Computer Use/);
  assert.match(result.summary, /Objectif atteint/);
  assert.match(result.summary, /confirmé/);
});
