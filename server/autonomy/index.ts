/**
 * AUTONOMY MODULE — Point d'entrée
 *
 * Exporte les trois composants du moteur d'autonomie :
 * 1. Supervisor — Boucle de contrôle serveur-side
 * 2. SmartSkills — Skills composites avec boucle intégrée
 * 3. Intégration avec le handleToolCall existant
 */

export { Supervisor, supervisor } from "./Supervisor.js";
export type { SupervisorConfig, MissionObjective, SessionInjector } from "./Supervisor.js";

export { createSmartSkills } from "./SmartSkills.js";
export type { SkillHandler } from "./SmartSkills.js";

export { LeannaCore } from "./LeannaCore.js";
export type {
  LeannaRuntimeState,
  LeannaRuntimeStatus,
  LeannaCoreOptions,
  AutonomyTaskStore,
  AutonomyBroadcaster,
  AutonomyBroadcastMessage,
  AutonomyEventType,
} from "./LeannaCore.js";
export { HeartbeatService, heartbeatConfigFromEnv } from "./HeartbeatService.js";
export { PerceptionEngine } from "./PerceptionEngine.js";
export { AnticipationEngine, anticipationConfigFromEnv } from "./AnticipationEngine.js";
export { ComputerUseAgent } from "./ComputerUseAgent.js";
export type {
  ComputerAction,
  ComputerActionType,
  ComputerRisk,
  ActionOutcome,
  ComputerStepRecord,
  ComputerUseResult,
  ComputerUseHandlers,
  ComputerUseConfig,
} from "./ComputerUseAgent.js";
export type {
  AnticipationProposal,
  AnticipationKind,
  AnticipationPriority,
  AnticipationEngineConfig,
  AnticipationEngineOptions,
  AnticipationTaskSubmitter,
} from "./AnticipationEngine.js";
export { AutonomousExecutive, GoalManager, PriorityEngine, autonomousExecutiveConfigFromEnv } from "./AutonomousExecutive.js";
export type { AutonomousGoal, AutonomousGoalSource, AutonomousGoalStatus, ObservationDisposition, AutonomousDecision, AutonomousMissionRequest, AutonomousExecutiveOptions, AutonomousExecutiveEvent, PriorityFactors } from "./AutonomousExecutive.js";
export { TaskManager, taskManagerConfigFromEnv } from "./TaskManager.js";
export type { AutonomousTask, AutonomousTaskStatus, TaskManagerConfig, TaskPersistence } from "./TaskManager.js";
export { AutonomyPersistence } from "./AutonomyPersistence.js";
