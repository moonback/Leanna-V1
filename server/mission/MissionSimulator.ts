/**
 * MissionSimulator — "Mission Simulator" (task.md §7, P0).
 *
 * Avant d'exécuter réellement une mission : SIMULER. Leanna planifie la mission
 * et affiche ce qui *se passerait* — fichiers modifiés, commandes exécutées,
 * agents impliqués, appels d'outils estimés, temps, coût et risques — sans aucun
 * effet de bord, avec les actions [Modifier le plan] / [Exécuter] / [Annuler].
 *
 * Design (reuse, don't rebuild — the roadmap note that "le DryRunController existe
 * mais la simulation globale bout-en-bout reste à câbler"): the simulator drives
 * the existing Executor end-to-end in DRY-RUN mode. The Executor already threads
 * `dryRun` into every skill call, so side-effecting tools are intercepted by the
 * DryRunController (read-only tools still run, so planning stays intelligent).
 * The simulator then reads back:
 *   - the plan the mission actually produced (goals → planned actions),
 *   - the simulated side effects (files that *would* change, commands that *would*
 *     run) from the DryRunController report,
 *   - the real metrics gathered during the dry run (tool calls, duration),
 *   - the pre-flight estimate carried on the plan (cost, risk level).
 *
 * It never performs a real side effect and never, by itself, launches the mission.
 */

/** Minimal view of the Executor the simulator needs (keeps it testable). */
export interface SimulatorExecutor {
  startMission(params: {
    title: string;
    description: string;
    priority?: "low" | "medium" | "high" | "critical";
    availableSkills: string[];
    budget?: { maxTokens?: number; maxCostUsd?: number };
    dryRun?: boolean;
  }): Promise<SimulatedMission>;
  waitForMission(missionId: string): Promise<SimulatedMission | undefined>;
}

/** Minimal view of a Mission the simulator reads after the dry run. */
export interface SimulatedMission {
  id: string;
  status: string;
  getState(): {
    title: string;
    description: string;
    status: string;
    goals: Record<string, {
      title: string;
      status: string;
      plannedActions: Array<{ skillName: string; args?: Record<string, unknown>; order: number; status: string }>;
    }>;
    context: { relevantFiles: string[] };
    metrics: { totalActions: number; totalDurationMs: number; estimatedTokens: number };
  };
}

/** One simulated side effect read back from the DryRunController report. */
export interface SimulatedEffectView {
  toolName: string;
  effects: string[];
  args: Record<string, unknown>;
}

/** Shape of the DryRunController report the simulator consumes. */
export interface DryRunReportView {
  totalSimulated: number;
  byTool: Record<string, number>;
  byEffect: Record<string, number>;
  effects: SimulatedEffectView[];
}

/** A single planned step surfaced in the preview. */
export interface SimulatedStep {
  order: number;
  skillName: string;
  goalTitle: string;
}

export interface SimulationReport {
  missionId: string;
  title: string;
  /** The plan Leanna would follow (ordered skills, with their goal). */
  steps: SimulatedStep[];
  /** Files that would be created/modified/deleted (from simulated write effects). */
  filesWouldChange: string[];
  /** Shell commands that would run (from simulated exec effects). */
  commandsWouldRun: string[];
  /** Distinct agents/roles involved (best-effort; from step metadata when present). */
  agentsInvolved: string[];
  /** Number of tool calls observed during the dry run. */
  toolCalls: number;
  /** Count of side-effecting operations that were intercepted. */
  sideEffectsAvoided: number;
  estimatedDurationMs: number;
  estimatedTokens: number;
  estimatedCostUsd: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  risks: string[];
  /** The dry run completed without the planner getting stuck. */
  planComplete: boolean;
  generatedAt: string;
  summary: string;
}

/** Pre-flight estimate carried on a MissionPlan (optional external source). */
export interface PlanEstimateView {
  estimatedCostUsd?: number;
  riskLevel?: "low" | "medium" | "high" | "critical";
  risks?: string[];
}

export interface MissionSimulatorOptions {
  /**
   * Returns the DryRunController report for the simulation just run. In
   * production this is `() => runtime.tools.getDryRun().getReport()`.
   */
  getDryRunReport?: () => DryRunReportView | undefined;
  /**
   * Optional provider of the pre-flight plan estimate (cost/risk) captured from
   * the `mission_plan` event. When absent, cost defaults to 0 and risk is derived
   * from the simulated effects.
   */
  getPlanEstimate?: (missionId: string) => PlanEstimateView | undefined;
}

/** Average per-write/exec effect is a reasonable risk proxy. */
function deriveRiskLevel(filesChanged: number, commands: number, sideEffects: number): SimulationReport["riskLevel"] {
  if (commands > 3 || filesChanged > 20) return "critical";
  if (commands > 0 || filesChanged > 8) return "high";
  if (sideEffects > 0 || filesChanged > 0) return "medium";
  return "low";
}

/**
 * End-to-end mission preview. Drives the Executor in dry-run and aggregates the
 * resulting plan, simulated effects, metrics and estimates into a report.
 */
export class MissionSimulator {
  constructor(
    private readonly executor: SimulatorExecutor,
    private readonly options: MissionSimulatorOptions = {},
  ) {}

  /**
   * Simulate a mission without side effects and return the preview. The mission
   * runs to a terminal state in dry-run; side-effecting tools are intercepted.
   */
  async simulate(params: {
    title: string;
    description: string;
    priority?: "low" | "medium" | "high" | "critical";
    availableSkills: string[];
    budget?: { maxTokens?: number; maxCostUsd?: number };
  }): Promise<SimulationReport> {
    const mission = await this.executor.startMission({ ...params, dryRun: true });
    const completed = (await this.executor.waitForMission(mission.id)) ?? mission;
    const state = completed.getState();

    // 1) Plan preview: ordered skills across goals.
    const steps: SimulatedStep[] = [];
    for (const goal of Object.values(state.goals)) {
      const ordered = [...goal.plannedActions].sort((a, b) => a.order - b.order);
      for (const action of ordered) {
        if (action.skillName) steps.push({ order: steps.length, skillName: action.skillName, goalTitle: goal.title });
      }
    }

    // 2) Simulated effects → files that would change / commands that would run.
    const report = this.options.getDryRunReport?.();
    const filesWouldChange = new Set<string>();
    const commandsWouldRun = new Set<string>();
    const agentsInvolved = new Set<string>();
    for (const effect of report?.effects ?? []) {
      if (effect.effects.includes("write") || effect.effects.includes("dangerous")) {
        const file = extractPathArg(effect.args);
        if (file) filesWouldChange.add(file);
      }
      if (effect.effects.includes("exec")) {
        const cmd = extractCommandArg(effect.args);
        if (cmd) commandsWouldRun.add(cmd);
      }
    }
    for (const step of steps) {
      const role = inferAgentRole(step.skillName);
      if (role) agentsInvolved.add(role);
    }

    // 3) Metrics + estimates.
    const estimate = this.options.getPlanEstimate?.(mission.id) ?? {};
    const sideEffectsAvoided = report?.totalSimulated ?? 0;
    const riskLevel = estimate.riskLevel ?? deriveRiskLevel(filesWouldChange.size, commandsWouldRun.size, sideEffectsAvoided);
    const risks = [...(estimate.risks ?? [])];
    if (commandsWouldRun.size > 0) risks.push(`${commandsWouldRun.size} commande(s) seraient exécutées.`);
    if (filesWouldChange.size > 0) risks.push(`${filesWouldChange.size} fichier(s) seraient modifiés.`);

    const result: SimulationReport = {
      missionId: mission.id,
      title: state.title,
      steps,
      filesWouldChange: [...filesWouldChange],
      commandsWouldRun: [...commandsWouldRun],
      agentsInvolved: [...agentsInvolved],
      toolCalls: state.metrics.totalActions,
      sideEffectsAvoided,
      estimatedDurationMs: state.metrics.totalDurationMs,
      estimatedTokens: state.metrics.estimatedTokens,
      estimatedCostUsd: estimate.estimatedCostUsd ?? 0,
      riskLevel,
      risks,
      planComplete: state.status === "completed",
      generatedAt: new Date().toISOString(),
      summary: "",
    };
    result.summary = buildSummary(result);
    return result;
  }
}

function extractPathArg(args: Record<string, unknown>): string | undefined {
  for (const key of ["path", "file_path", "filePath", "file", "target", "targetFile"]) {
    const v = args?.[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function extractCommandArg(args: Record<string, unknown>): string | undefined {
  for (const key of ["command", "cmd", "script", "run"]) {
    const v = args?.[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

/** Best-effort mapping of a skill to the specialized agent that would own it. */
function inferAgentRole(skillName: string): string | undefined {
  const s = skillName.toLowerCase();
  if (/test|vitest|jest/.test(s)) return "tester";
  if (/review|audit/.test(s)) return "reviewer";
  if (/security|vuln/.test(s)) return "security";
  if (/write|edit|replace|create|refactor/.test(s)) return "coder";
  if (/search|read|grep|knowledge|context/.test(s)) return "researcher";
  return undefined;
}

function buildSummary(r: SimulationReport): string {
  const lines: string[] = [];
  lines.push(`## Simulation — « ${r.title} »`);
  lines.push("");
  lines.push(`- ${r.filesWouldChange.length} fichier(s) seraient modifiés`);
  lines.push(`- ${r.commandsWouldRun.length} commande(s) seraient exécutées`);
  if (r.agentsInvolved.length) lines.push(`- ${r.agentsInvolved.length} agent(s) impliqué(s) : ${r.agentsInvolved.join(", ")}`);
  lines.push(`- ${r.toolCalls} appel(s) d'outil (estimés)`);
  lines.push(`- Temps : ${formatDuration(r.estimatedDurationMs)}`);
  lines.push(`- Coût : $${r.estimatedCostUsd.toFixed(2)}`);
  lines.push("");
  const icon = r.riskLevel === "critical" ? "🔴" : r.riskLevel === "high" ? "🟠" : r.riskLevel === "medium" ? "🟡" : "🟢";
  lines.push(`${icon} Risque : ${r.riskLevel}`);
  for (const risk of r.risks.slice(0, 6)) lines.push(`  - ${risk}`);
  if (!r.planComplete) lines.push(`- ⚠️ La simulation ne s'est pas terminée proprement (plan incomplet).`);
  lines.push("");
  lines.push(`[Modifier le plan] [Exécuter] [Annuler]`);
  return lines.join("\n");
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}m${String(sec).padStart(2, "0")}` : `${sec}s`;
}
