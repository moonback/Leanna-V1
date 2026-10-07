import { Mission } from "./Mission.js";
import { randomUUID } from "node:crypto";
import { Planner } from "./Planner.js";
import { ReflectionEngine, type ReflectionInput } from "./Reflection.js";
import { SkillScorer } from "./SkillScorer.js";
import { MissionStore } from "./MissionStore.js";
import { AutonomyPolicy } from "./AutonomyPolicy.js";
import type {  PlannedAction,  ReflectionResult,
  MissionConfig,
  MissionPlan,
  MissionState,
  Goal,
} from "./types.js";
import { DEFAULT_MISSION_CONFIG } from "./types.js";
import { telemetryService } from "../observability/TelemetryService.js";
import { setTelemetryContext, clearTelemetryContext } from "../utils/textGeneration.js";
import { learningEngine } from "../knowledge/LearningEngine.js";
import type { LearningResult } from "../knowledge/types.js";
import { strategyMemory } from "../knowledge/StrategyMemory.js";
import { playbookStore, type PlaybookMissionInput } from "../knowledge/PlaybookStore.js";
import { projectProfile } from "../knowledge/ProjectProfile.js";
import { selfEvaluationEngine, type SelfEvalMissionView } from "./SelfEvaluation.js";
import { missionEvolutionStore } from "../knowledge/MissionEvolution.js";
import { PlanEstimator } from "./PlanEstimator.js";

// Plafond de caractères appliqué à chaque résultat d'action quand il est résumé
// pour la preuve passée au vérificateur LLM. 300 (ancienne valeur codée en dur)
// coupait souvent le contexte au mauvais endroit — par ex. le résumé d'un
// typecheck en échec — et poussait le LLM à mal juger. 1200 laisse de la marge
// tout en bornant la taille de la preuve.
const SUMMARY_RESULT_MAX_CHARS = 1200;

// ═══════════════════════════════════════════════════════════════════════════════
// Executor — Boucle plan → agir → vérifier → corriger
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * L'Executor coordonne l'exécution d'une mission complète.
 *
 * Boucle principale:
 *   1. Planner décompose l'objectif en sous-objectifs
 *   2. Pour chaque sous-objectif:
 *      a. Planner planifie les actions (skills scorés)
 *      b. Executor exécute chaque action via le SkillHandler
 *      c. Reflection évalue le résultat
 *      d. Si échec → retry / replan / escalate
 *   3. Quand tous les sous-objectifs sont complétés → mission terminée
 *
 * L'Executor est le composant central qui fait le lien entre
 * le Planner, le SkillScorer, le Reflection Engine et le SkillManager.
 */
export class Executor {
  private planner: Planner;
  private reflection: ReflectionEngine;
  private scorer: SkillScorer;
  private skillHandler: SkillHandlerFn | null = null;
  private config: MissionConfig;
  private eventEmitter: ExecutorEventEmitter | null = null;

  /** Fonction LLM pour générer les arguments d'un skill au moment de l'exécution. */
  private llmArgGen: LLMTextFn | null = null;

  /** Fonction LLM pour valider les critères de succès d'un objectif. */
  private llmVerify: LLMTextFn | null = null;

  /** Schémas des outils (name → { description, parameters }) pour la génération d'arguments. */
  private toolSchemas: Map<string, ToolSchema> = new Map();

  /** Store de persistance (optionnel). */
  private store: MissionStore | null = null;

  /** Curseur d'autonomie (optionnel). */
  private autonomy: AutonomyPolicy | null = null;

  /** Approbations en attente : actionId → resolver de décision. */
  private pendingApprovals: Map<string, {
    resolve: (approved: boolean) => void;
    timer: NodeJS.Timeout;
  }> = new Map();

  /** Délai d'attente d'une approbation avant refus par défaut (ms). */
  private approvalTimeoutMs = 5 * 60 * 1000;

  /** Missions actives */
  private activeMissions: Map<string, Mission> = new Map();

  /** Missions complétées (historique, max 50) */
  private completedMissions: Mission[] = [];
  private static readonly MAX_COMPLETED = 50;

  /** Promesses des missions lancées en arrière-plan, pour les appelants autonomes. */
  private readonly missionRuns = new Map<string, Promise<void>>();
  /** Candidate lessons/proposals; never auto-applied by mission finalization. */
  private readonly learningResults = new Map<string, LearningResult>();
  /** Self-critique evaluations per mission (plan vs execution vs result). */
  private readonly selfEvaluations = new Map<string, import("./SelfEvaluation.js").SelfEvaluation>();

  /**
   * Missions mises en pause par l'utilisateur.
   * L'exécution boucle sur un point de contrôle tant que l'ID est présent ici.
   */
  private pausedMissions: Set<string> = new Set();

  /** Intervalle de sondage de l'état de pause (ms). */
  private static readonly PAUSE_POLL_MS = 500;

  /**
   * Missions interrompues (crash/redémarrage) rechargées depuis le store mais
   * NON relancées : elles attendent une décision explicite de l'utilisateur
   * (réactiver ou effacer). Clé = missionId → état rechargé + titre.
   * Tant qu'une mission est ici, elle n'est ni active ni relancée.
   */
  private pendingResumes: Map<string, { state: MissionState; title: string }> = new Map();

  /** Skills disponibles mémorisés pour relancer une mission réactivée. */
  private resumeAvailableSkills: string[] = [];

  /**
   * Outils d'EXPLORATION (lecture seule) : utiles pour comprendre le contexte,
   * mais ne produisent aucun livrable. Une boucle qui les rejoue sans jamais
   * basculer vers une action de production est le symptôme du bug « mission
   * exploratoire sans artefact ».
   */
  private static readonly EXPLORATION_TOOLS = new Set<string>([
    "read_project_file", "list_project_files", "read_file_outline",
    "analyze_project_file", "search_in_files", "get_workspace_info",
    "knowledge_semantic_search", "knowledge_search_entities",
    "knowledge_build_context", "knowledge_impact_analyze",
  ]);

  /**
   * Outils de PRODUCTION (écriture) : produisent un artefact concret. Leur
   * présence (réussie) dans un objectif prouve qu'il a dépassé l'exploration.
   */
  private static readonly WRITE_TOOLS = [
    "write_project_file", "modify_project_file", "patch_project_file",
    "create_project_directory", "rename_project_file",
  ];

  /**
   * Nombre d'actions d'exploration consécutives (sans aucune écriture réussie)
   * au-delà duquel on force une replanification orientée « produire un artefact ».
   */
  private static readonly EXPLORATION_LOOP_THRESHOLD = 4;

  /**
   * Suivi anti-boucle par objectif. `explorationStreak` compte les actions
   * d'exploration enchaînées sans écriture ; `producedArtifact` passe à true dès
   * qu'un outil d'écriture réussit ; `forcedArtifact` évite de forcer deux fois.
   */
  private loopGuards: Map<string, {
    explorationStreak: number;
    producedArtifact: boolean;
    forcedArtifact: boolean;
  }> = new Map();

  /** Estimateur coût / durée / risque avant exécution. */
  private planEstimator!: PlanEstimator;

  constructor(config: Partial<MissionConfig> = {}) {
    this.config = { ...DEFAULT_MISSION_CONFIG, ...config };
    this.scorer = new SkillScorer();
    this.planner = new Planner(this.scorer);
    this.reflection = new ReflectionEngine();
    this.planEstimator = new PlanEstimator(this.scorer);
  }

  // ─── Configuration ────────────────────────────────────────────────────────

  /**
   * Injecte le handler de skills (connect au SkillManager).
   */
  setSkillHandler(handler: SkillHandlerFn): void {
    this.skillHandler = handler;
  }

  /**
   * Injecte la fonction LLM pour la décomposition.
   */
  setLLMDecompose(fn: (prompt: string) => Promise<string>): void {
    this.planner.setDecomposeFunction(fn);
  }

  /**
   * Injecte la fonction LLM pour la réflexion.
   */
  setLLMReflect(fn: (prompt: string) => Promise<string>): void {
    this.reflection.setReflectFunction(fn);
  }

  /**
   * Injecte la fonction LLM utilisée pour générer les arguments d'un skill
   * au moment de l'exécution (quand le Planner n'a pas rempli action.args).
   */
  setLLMArgGen(fn: LLMTextFn): void {
    this.llmArgGen = fn;
  }

  /**
   * Injecte la fonction LLM utilisée pour valider les critères de succès
   * d'un objectif à partir des actions exécutées et de leurs résultats.
   */
  setLLMVerify(fn: LLMTextFn): void {
    this.llmVerify = fn;
  }

  /**
   * Enregistre les schémas des outils disponibles (name/description/parameters).
   * Utilisé pour générer des arguments valides via le LLM.
   */
  setToolSchemas(schemas: ToolSchema[]): void {
    this.toolSchemas.clear();
    for (const schema of schemas) {
      if (schema && schema.name) this.toolSchemas.set(schema.name, schema);
    }
  }

  /**
   * Injecte le store de persistance des missions (Supabase).
   */
  setStore(store: MissionStore): void {
    this.store = store;
  }

  /**
   * Injecte le curseur d'autonomie (suggest/ask/auto + .leannaignore).
   */
  setAutonomyPolicy(policy: AutonomyPolicy): void {
    this.autonomy = policy;
  }

  /** Configure le délai d'attente d'une approbation (ms). */
  setApprovalTimeout(ms: number): void {
    if (Number.isFinite(ms) && ms > 0) this.approvalTimeoutMs = ms;
  }

  /**
   * Résout une demande d'approbation en attente (appelé depuis le frontend).
   * Retourne true si une demande correspondante existait.
   */
  resolveApproval(actionId: string, approved: boolean): boolean {
    const pending = this.pendingApprovals.get(actionId);
    if (!pending) return false;
    clearTimeout(pending.timer);
    this.pendingApprovals.delete(actionId);
    pending.resolve(approved);
    return true;
  }

  /** Liste les IDs d'actions en attente d'approbation. */
  listPendingApprovals(): string[] {
    return Array.from(this.pendingApprovals.keys());
  }

  /** Accès au curseur d'autonomie (pour lire/modifier le mode à chaud). */
  getAutonomyPolicy(): AutonomyPolicy | null {
    return this.autonomy;
  }

  /**
   * Configure l'émetteur d'événements pour le frontend.
   */
  setEventEmitter(emitter: ExecutorEventEmitter): void {
    this.eventEmitter = emitter;
  }

  /**
   * Accès au scorer (pour enregistrer les catégories de skills au démarrage).
   */
  getScorer(): SkillScorer {
    return this.scorer;
  }

  /**
   * Accès au reflection engine.
   */
  getReflection(): ReflectionEngine {
    return this.reflection;
  }

  // ─── Exécution de mission ─────────────────────────────────────────────────

  /**
   * Lance une mission complète.
   * Retourne la mission (l'exécution continue en arrière-plan).
   */
  async startMission(params: {
    title: string;
    description: string;
    priority?: "low" | "medium" | "high" | "critical";
    availableSkills: string[];
    budget?: { maxTokens?: number; maxCostUsd?: number };
    /** Exécuter la mission entière en simulation, sans effet de bord. */
    dryRun?: boolean;
  }): Promise<Mission> {
    if (!this.skillHandler) {
      throw new Error("SkillHandler not configured. Call setSkillHandler first.");
    }

    // Config spécifique à la mission : le dry-run peut être activé par mission.
    const missionConfig: MissionConfig = {
      ...this.config,
      dryRun: params.dryRun ?? this.config.dryRun,
    };

    const mission = new Mission(
      params.title,
      params.description,
      params.priority ?? "medium",
      missionConfig
    );

    if (missionConfig.dryRun) {
      console.log(`[Executor] 🧪 Mission "${params.title}" lancée en DRY-RUN (simulation, sans effet de bord).`);
      this.emit("mission_dryrun", { missionId: mission.id, title: params.title });
    }

    // Start OpenTelemetry trace for this mission
    telemetryService.startMissionTrace(mission.id, params.title);

    // Set up budget guardrails if provided
    if (params.budget) {
      telemetryService.setMissionBudget(mission.id, params.budget);
    }

    // Set telemetry context for all model calls in this mission
    setTelemetryContext({ missionId: mission.id });

    // Ferme la boucle d'apprentissage inter-missions (GAP-1) : amorcer le
    // SkillScorer avec la fiabilité durable des skills AVANT la planification,
    // pour qu'un outil historiquement défaillant soit d'emblée moins prioritaire.
    try {
      this.scorer.seedFromReliability(strategyMemory.getAllStats());
    } catch (err) {
      console.warn(`[Executor] Amorçage de fiabilité ignoré: ${(err as Error).message}`);
    }

    const plan = await this.preparePlan(mission, params.availableSkills);

    this.activeMissions.set(mission.id, mission);
    await this.persist(mission);
    this.emit("mission_plan", {
      missionId: mission.id,
      title: params.title,
      plan,
    });
    this.emit("mission_started", { missionId: mission.id, title: params.title });

    // Lancer l'exécution en arrière-plan, tout en conservant une promesse
    // observable. Le runtime autonome doit attendre le résultat vérifié plutôt
    // que déclarer une mission réussie juste après sa création.
    const run = this.executeMission(mission, params.availableSkills).catch((err) => {
      console.error(`[Executor] Mission ${mission.id} failed:`, err);
      telemetryService.endMissionTrace(mission.id, false);
      this.emit("mission_failed", { missionId: mission.id, error: String(err) });
    });
    this.missionRuns.set(mission.id, run);
    void run.finally(() => this.missionRuns.delete(mission.id));

    return mission;
  }

  /**
   * Attend la fin réelle d'une mission déjà lancée et retourne son état
   * terminal. C'est le contrat utilisé par l'autonomie pour fermer la boucle
   * exécution → vérification → réflexion avant de prendre la décision suivante.
   */
  async waitForMission(missionId: string): Promise<Mission | undefined> {
    await this.missionRuns.get(missionId);
    return this.activeMissions.get(missionId)
      ?? this.completedMissions.find((mission) => mission.id === missionId);
  }

  private async preparePlan(mission: Mission, availableSkills: string[]): Promise<MissionPlan> {
    const rootGoal = mission.rootGoal;
    const subGoals = await this.planner.decompose(mission, rootGoal.id, availableSkills);
    const objectives = subGoals.length > 0 ? subGoals.map((goal) => goal.title) : [rootGoal.title];
    const goals = subGoals.length > 0
      ? this.createSubGoals(mission, rootGoal.id, subGoals)
      : [rootGoal.id];
    const plannedActions: PlannedAction[] = [];

    for (const goalId of goals) {
      const actions = await this.planner.planActions(mission, goalId, availableSkills);
      mission.setPlanForGoal(goalId, actions);
      plannedActions.push(...actions);
    }

    const text = `${mission.getState().title} ${mission.getState().description}`;
    const targetedFiles = Array.from(new Set(
      text.match(/[\w./\\-]+\.(?:ts|tsx|js|jsx|json|css|md|html|sql|cjs|mjs)/gi) ?? []
    ));
    const tools = Array.from(new Set(plannedActions.map((action) => action.skillName)));

    // ── Estimation coût / durée / risque ─────────────────────────────────
    const state = mission.getState();
    const estimate = this.planEstimator.estimate({
      plannedActions,
      missionTitle: state.title,
      missionDescription: state.description,
      targetedFiles,
      maxRetries: this.config.maxRetries,
    });

    // ── Risques qualitatifs ───────────────────────────────────────────────
    const risks: string[] = [
      ...estimate.riskFactors,
      "Une action peut échouer et déclencher une replanification.",
      ...(targetedFiles.length === 0 ? ["Les fichiers ciblés seront confirmés pendant l'analyse."] : []),
      ...(plannedActions.length === 0 ? ["Aucun outil n'a encore atteint le score minimum."] : []),
    ];

    return {
      objectives,
      targetedFiles: targetedFiles.length > 0 ? targetedFiles : ["À déterminer pendant l'analyse"],
      tools: tools.length > 0 ? tools : ["Sélection automatique selon le contexte"],
      risks,
      estimatedTokens:      estimate.estimatedTokens,
      estimatedCostUsd:     estimate.estimatedCostUsd,
      estimatedDurationMs:  estimate.estimatedDurationMs,
      riskLevel:            estimate.riskLevel,
      estimationConfidence: estimate.estimationConfidence,
      stopConditions: [
        "Arrêt immédiat si un objectif critique échoue.",
        `Arrêt après ${this.config.maxRetries} échecs d'une même action.`,
        "Arrêt sur annulation explicite de l'utilisateur.",
      ],
    };
  }

  /**
   * Récupère une mission active.
   */
  getMission(missionId: string): Mission | undefined {
    return this.activeMissions.get(missionId);
  }

  /**
   * Liste les missions actives.
   */
  listActiveMissions(): Mission[] {
    return Array.from(this.activeMissions.values());
  }

  /**
   * Liste les missions complétées (historique).
   */
  listCompletedMissions(): Mission[] {
    return [...this.completedMissions];
  }

  /** Returns post-mission learning proposals for review by the policy/UI. */
  getLearningResult(missionId: string): LearningResult | undefined {
    return this.learningResults.get(missionId);
  }

  /** Returns the self-critique evaluation for a finalized mission, if any. */
  getSelfEvaluation(missionId: string): import("./SelfEvaluation.js").SelfEvaluation | undefined {
    return this.selfEvaluations.get(missionId);
  }

  /**
   * Annule une mission active.
   */
  cancelMission(missionId: string): boolean {
    const mission = this.activeMissions.get(missionId);
    if (!mission) return false;

    mission.completeActiveGoal({
      success: false,
      summary: "Mission annulée par l'utilisateur.",
    });

    this.finalizeMission(mission);
    
    // End trace and clear telemetry
    telemetryService.endMissionTrace(missionId, false);
    telemetryService.clearMissionBudget(missionId);
    clearTelemetryContext();
    
    this.pausedMissions.delete(missionId);
    this.emit("mission_cancelled", { missionId });
    return true;
  }

  /**
   * Met en pause une mission active. L'exécution s'arrête au prochain point de
   * contrôle (entre deux actions/vagues) et reste suspendue jusqu'à reprise ou
   * annulation. Retourne false si la mission n'est pas active ou déjà en pause.
   */
  pauseMission(missionId: string): boolean {
    if (!this.activeMissions.has(missionId)) return false;
    if (this.pausedMissions.has(missionId)) return false;
    this.pausedMissions.add(missionId);
    this.emit("mission_paused", { missionId });
    return true;
  }

  /**
   * Reprend une mission mise en pause. Retourne false si elle n'était pas en pause.
   */
  resumeMission(missionId: string): boolean {
    if (!this.pausedMissions.has(missionId)) return false;
    this.pausedMissions.delete(missionId);
    this.emit("mission_resumed", { missionId });
    return true;
  }

  /** Indique si une mission est actuellement en pause. */
  isPaused(missionId: string): boolean {
    return this.pausedMissions.has(missionId);
  }

  /**
   * Supprime définitivement une mission.
   * - Si elle est active, elle est d'abord annulée.
   * - Elle est retirée de l'historique en mémoire et du store persistant.
   * Retourne false si aucune mission (active ou complétée) ne correspond.
   */
  deleteMission(missionId: string): boolean {
    const wasActive = this.activeMissions.has(missionId);
    if (wasActive) {
      // Annule proprement (finalise + émet mission_cancelled).
      this.cancelMission(missionId);
    }

    const beforeLen = this.completedMissions.length;
    this.completedMissions = this.completedMissions.filter((m) => m.id !== missionId);
    const removedFromHistory = this.completedMissions.length < beforeLen;

    this.pausedMissions.delete(missionId);

    // Nettoyage du store persistant (no-op si aucun store branché).
    if (this.store) {
      void this.store.delete(missionId);
    }

    const existed = wasActive || removedFromHistory;
    if (existed) {
      this.emit("mission_deleted", { missionId });
    }
    return existed;
  }

  /**
   * Point de contrôle de pause : suspend l'exécution tant que la mission est en
   * pause. Se débloque à la reprise, à l'annulation, ou si la mission n'est plus
   * active. Ne fait rien si la mission n'est pas en pause.
   */
  private async waitIfPaused(missionId: string): Promise<void> {
    while (
      this.pausedMissions.has(missionId) &&
      this.activeMissions.has(missionId)
    ) {
      await new Promise((r) => setTimeout(r, Executor.PAUSE_POLL_MS));
    }
  }

  // ─── Boucle d'exécution ───────────────────────────────────────────────────

  private async executeMission(mission: Mission, availableSkills: string[]): Promise<void> {
    const rootGoal = mission.rootGoal;
    mission.pushGoal(rootGoal.id);

    console.log(`[Executor] ═══════════════════════════════════════════`);
    console.log(`[Executor] 🚀 Mission démarrée: "${mission.getState().title}"`);
    console.log(`[Executor] ═══════════════════════════════════════════`);

    // Les sous-objectifs ont déjà été créés lors de preparePlan.
    // On les récupère depuis l'état (sans les recréer).
    const subGoalIds = Object.values(mission.getState().goals)
      .filter((goal) => goal.parentId === rootGoal.id)
      .map((goal) => goal.id);

    if (subGoalIds.length === 0) {
      // Pas de décomposition → exécuter directement
      await this.executeGoalDirectly(mission, rootGoal.id, availableSkills);
    } else {
      // Ordonnancement par vagues : exécuter en parallèle les objectifs dont
      // toutes les dépendances (dependsOn) sont déjà complétées.
      await this.executeGoalsScheduled(mission, subGoalIds, availableSkills);
    }

    // Compléter la mission si pas déjà fait
    if (!mission.isCompleted()) {
      const allGoals = Object.values(mission.getState().goals);
      const allSuccess = allGoals
        .filter((g) => g.parentId !== null)
        .every((g) => g.status === "completed");

      mission.completeActiveGoal({
        success: allSuccess,
        summary: allSuccess
          ? `Mission "${mission.getState().title}" complétée avec succès.`
          : `Mission terminée avec des objectifs échoués.`,
        lessonsLearned: this.extractLessons(mission),
      });
    }

    this.finalizeMission(mission);
    
    // End trace with success status
    const success = mission.status === "completed";
    telemetryService.endMissionTrace(mission.id, success);
    telemetryService.clearMissionBudget(mission.id);
    clearTelemetryContext();
    
    console.log(`[Executor] ✓ Mission terminée: ${mission.status}`);
    this.emit("mission_completed", {
      missionId: mission.id,
      success,
    });
  }

  /**
   * Exécute un objectif directement (planifie et exécute les actions).
   */
  private async executeGoalDirectly(
    mission: Mission,
    goalId: string,
    availableSkills: string[]
  ): Promise<void> {
    const goal = mission.getGoal(goalId);
    if (!goal) return;

    console.log(`[Executor] ── Objectif: "${goal.title}" ──`);

    // Planifier les actions
    let actions = goal.plannedActions.length > 0
      ? goal.plannedActions
      : await this.planner.planActions(mission, goalId, availableSkills);
    mission.setPlanForGoal(goalId, actions);

    if (actions.length === 0) {
      console.log(`[Executor]    Aucune action planifiée. Objectif marqué complété.`);
      mission.completeGoal(goalId, { success: true, summary: "Aucune action nécessaire." });
      return;
    }

    // Exécuter les actions une par une.
    // On lit systématiquement le plan VIVANT (mission.getGoal(...).plannedActions)
    // plutôt qu'une copie locale : une replanification remplace ce plan par de
    // nouvelles actions (nouveaux ids), et itérer sur l'ancienne référence
    // ferait planter startAction ("Action not found"). On avance donc via un
    // curseur sur le plan courant, réinitialisé après chaque replanification.
    let cursor = 0;
    // Garde-fou anti-boucle : borne le nombre total d'itérations pour éviter
    // qu'une replanification en boucle ne bloque indéfiniment l'objectif.
    let iterations = 0;
    const maxIterations = 100;

    // Suivi anti-boucle d'exploration pour cet objectif (réinitialisé à chaque
    // entrée dans la méthode : une reprise repart d'un compteur propre).
    this.loopGuards.set(goalId, { explorationStreak: 0, producedArtifact: false, forcedArtifact: false });

    while (iterations++ < maxIterations) {
      if (mission.isCompleted()) break;

      const livePlan = mission.getGoal(goalId)?.plannedActions ?? [];
      // Trouver la prochaine action à exécuter à partir du curseur.
      let action: PlannedAction | undefined;
      while (cursor < livePlan.length) {
        const candidate = livePlan[cursor];
        if (candidate.status === "pending") { action = candidate; break; }
        cursor++;
      }
      if (!action) break; // plus rien à exécuter

      // Point de contrôle : suspend si la mission est en pause.
      await this.waitIfPaused(mission.id);
      if (mission.isCompleted() || !this.activeMissions.has(mission.id)) break;

      const result = await this.executeAction(mission, goalId, action, availableSkills);

      // Une action RÉUSSIE est terminale : la réflexion ne peut pas la "défaire".
      // On ignore donc retry/replan/escalate/abort quand l'action a réussi
      // (le statut completed a déjà été posé par recordActionResult, qui mute
      // l'objet action de façon invisible pour l'inférence de types).
      const actionSucceeded = (mission.getGoal(goalId)?.plannedActions
        .find((a) => a.id === action.id)?.status) === "completed";

      // ── Détection de boucle d'exploration (Bug: mission sans livrable) ──────
      // On met à jour le suivi : une écriture réussie prouve qu'un artefact a été
      // produit ; une action d'exploration incrémente le streak ; toute autre
      // action réussie le remet à zéro (progrès non-exploratoire).
      const guard = this.loopGuards.get(goalId)!;
      const isExploration = Executor.EXPLORATION_TOOLS.has(action.skillName);
      const isWrite = Executor.WRITE_TOOLS.includes(action.skillName);
      if (actionSucceeded && isWrite) {
        guard.producedArtifact = true;
        guard.explorationStreak = 0;
      } else if (isExploration) {
        guard.explorationStreak++;
      } else if (actionSucceeded) {
        guard.explorationStreak = 0;
      }

      // Si l'objectif enchaîne les lectures sans jamais produire d'artefact, on
      // force UNE fois une replanification contrainte « produire un livrable ».
      // Cela casse la boucle plan→lire→lire→… observée par le Vérificateur.
      const goalWantsArtifact = this.goalExpectsArtifact(goal);
      if (
        !guard.forcedArtifact &&
        !guard.producedArtifact &&
        goalWantsArtifact &&
        guard.explorationStreak >= Executor.EXPLORATION_LOOP_THRESHOLD
      ) {
        guard.forcedArtifact = true;
        console.log(
          `[Executor]    🧭 Boucle d'exploration détectée (${guard.explorationStreak} lectures sans livrable) ` +
          `→ replanification contrainte « produire un artefact » pour "${goal.title}".`
        );
        this.emit("goal_loop_detected", {
          missionId: mission.id,
          goalId,
          explorationStreak: guard.explorationStreak,
          skill: action.skillName,
        });
        const forced = await this.planForcedArtifact(mission, goalId, availableSkills);
        if (forced.length > 0) {
          mission.setPlanForGoal(goalId, forced);
          cursor = 0;
          continue;
        }
        // Si aucun outil d'écriture n'est disponible, on ne boucle pas davantage.
      }

      // Décider de la suite selon la réflexion (uniquement en cas d'échec).
      if (!actionSucceeded && result.decision === "abort") {
        mission.completeGoal(goalId, {
          success: false,
          summary: `Abandonné: ${result.reasoning}`,
        });
        return;
      }

      if (!actionSucceeded && result.decision === "escalate") {
        // Marquer l'objectif comme bloqué et laisser le niveau supérieur gérer
        mission.blockGoal(goalId, result.reasoning);
        this.emit("goal_escalated", {
          missionId: mission.id,
          goalId,
          reason: result.reasoning,
        });
        return;
      }

      if (!actionSucceeded && result.decision === "replan") {
        // Replanifier avec les infos accumulées.
        console.log(`[Executor]    🔄 Replanification...`);
        const replanned = await this.planner.replan(
          mission,
          goalId,
          action,
          result.failure ?? "Erreur inconnue",
          availableSkills
        );
        // Remplace le plan vivant par les nouvelles actions et repart du début :
        // le curseur doit pointer sur le nouveau plan, pas sur l'ancien index.
        mission.setPlanForGoal(goalId, replanned);
        cursor = 0;
        continue;
      }

      // Aucune replanification : avancer le curseur au-delà de l'action courante.
      // (Une action retentée reste "pending" et sera re-sélectionnée ; une action
      // terminée est de toute façon ignorée par le filtre de statut ci-dessus.)
      if (result.decision !== "retry") {
        cursor++;
      }
    }

    // Ne valider l'objectif qu'une fois toutes les actions traitées.
    const allDone = goal.plannedActions.every(
      (a) => a.status === "completed" || a.status === "cancelled" || a.status === "failed"
    );
    if (!allDone) return;

    // Valider l'objectif au regard de ses critères de succès (et non plus
    // dès qu'une seule action a réussi).
    const verdict = await this.verifyGoalCriteria(mission, goal);

    this.emit("goal_verified", {
      missionId: mission.id,
      goalId,
      passed: verdict.passed,
      reasoning: verdict.reasoning,
    });

    console.log(
      `[Executor]    ${verdict.passed ? "✓" : "✗"} Critères de "${goal.title}": ${verdict.reasoning}`
    );

    mission.completeGoal(goalId, {
      success: verdict.passed,
      summary: `Objectif "${goal.title}" ${verdict.passed ? "atteint" : "non atteint"} — ${verdict.reasoning}`,
    });

    this.loopGuards.delete(goalId);
  }

  /**
   * Heuristique : l'objectif attend-il un livrable concret (fichier/document) ?
   * On s'appuie sur le vocabulaire du titre, de la description et des critères
   * de succès (plan, rapport, document, fichier, .md, écrire, générer, produire…).
   * Objectif purement analytique (ex. « comprendre l'architecture ») → false :
   * on ne force alors aucune écriture.
   */
  private goalExpectsArtifact(goal: Goal): boolean {
    const haystack = [
      goal.title,
      goal.description,
      ...(goal.successCriteria ?? []),
    ].join(" ").toLowerCase();
    return /\b(plan|rapport|report|document|documenter|fichier|écrire|ecrire|rédiger|rediger|générer|generer|produire|créer|creer|livrable|\.md|markdown|synth[èe]se)\b/.test(
      haystack
    );
  }

  /**
   * Construit un plan FORCÉ orienté production d'artefact, utilisé pour sortir
   * d'une boucle d'exploration. On privilégie un outil d'écriture disponible et
   * on pose son `rationale` de sorte que la génération d'arguments (generateArgs)
   * sache qu'elle doit produire un fichier livrable concret.
   *
   * Retourne un plan vide si aucun outil d'écriture n'est disponible (dans ce
   * cas, l'appelant renonce à forcer et laisse le flux normal se poursuivre).
   */
  private async planForcedArtifact(
    mission: Mission,
    goalId: string,
    availableSkills: string[]
  ): Promise<PlannedAction[]> {
    const goal = mission.getGoal(goalId);
    if (!goal) return [];

    const writeTool = Executor.WRITE_TOOLS.find((t) => availableSkills.includes(t));
    if (!writeTool) return [];

    // Trace la décision pour l'observabilité et pour nourrir generateArgs.
    mission.addHypothesis(
      `Objectif "${goal.title}" bloqué en exploration : forcer la production d'un livrable ` +
      `concret via ${writeTool} (ex. un fichier Markdown récapitulant le résultat).`
    );

    return [
      {
        id: randomUUID(),
        skillName: writeTool,
        args: {},
        rationale:
          "ARTEFACT REQUIS : l'objectif est resté en exploration (lectures répétées) sans " +
          "produire de livrable. Écrire MAINTENANT un fichier concret qui matérialise le " +
          "résultat attendu (ex. un document Markdown : plan, rapport ou synthèse). Le " +
          "contenu doit refléter les critères de succès de l'objectif.",
        score: 100,
        order: 1,
        status: "pending" as const,
      },
    ];
  }

  /**
   * Ordonnance les sous-objectifs par vagues selon leurs dépendances.
   * Chaque vague exécute EN PARALLÈLE tous les objectifs dont les dépendances
   * (dependsOn) sont déjà complétées. S'arrête si un objectif critique échoue.
   */
  private async executeGoalsScheduled(
    mission: Mission,
    goalIds: string[],
    availableSkills: string[]
  ): Promise<void> {
    const maxConcurrency = Math.max(1, this.config.maxConcurrentGoals ?? 3);
    // Ne garder que les objectifs non terminaux (utile pour les missions reprises).
    const remaining = new Set(
      goalIds.filter((id) => {
        const g = mission.getGoal(id);
        return g && g.status !== "completed" && g.status !== "cancelled";
      })
    );
    let criticalFailure = false;

    const isDone = (id: string): boolean => {
      const g = mission.getGoal(id);
      return !!g && (g.status === "completed" || g.status === "failed" || g.status === "cancelled");
    };
    const isCompleted = (id: string): boolean =>
      mission.getGoal(id)?.status === "completed";

    while (remaining.size > 0 && !mission.isCompleted() && !criticalFailure) {
      // Point de contrôle : suspend au début de chaque vague si en pause.
      await this.waitIfPaused(mission.id);
      if (mission.isCompleted() || !this.activeMissions.has(mission.id)) break;

      // Sélectionner les objectifs exécutables : dépendances toutes complétées.
      const runnable: string[] = [];
      for (const id of remaining) {
        const goal = mission.getGoal(id);
        if (!goal) { remaining.delete(id); continue; }
        if (goal.status === "cancelled") { remaining.delete(id); continue; }

        const deps = (goal.dependsOn ?? []).filter((d) => goalIds.includes(d));
        const depsSatisfied = deps.every((d) => isCompleted(d));
        // Si une dépendance a échoué, l'objectif ne pourra jamais démarrer.
        const depFailed = deps.some((d) => {
          const dg = mission.getGoal(d);
          return dg && (dg.status === "failed" || dg.status === "cancelled");
        });

        if (depFailed) {
          mission.blockGoal(id, "Dépendance échouée ou annulée.");
          remaining.delete(id);
          this.emit("goal_blocked", { missionId: mission.id, goalId: id, reason: "Dépendance échouée." });
          continue;
        }
        if (depsSatisfied) runnable.push(id);
      }

      if (runnable.length === 0) {
        // Aucun objectif exécutable alors qu'il en reste : cycle ou blocage.
        console.warn(`[Executor] ⚠️ Aucun objectif exécutable (dépendances circulaires ?). Objectifs restants marqués bloqués.`);
        for (const id of remaining) {
          mission.blockGoal(id, "Dépendances non satisfaites (cycle ou blocage).");
        }
        break;
      }

      // Limiter la concurrence de la vague.
      const wave = runnable.slice(0, maxConcurrency);
      console.log(`[Executor] ▶ Vague de ${wave.length} objectif(s) en parallèle.`);

      await Promise.all(
        wave.map(async (goalId) => {
          const goal = mission.getGoal(goalId);
          if (!goal) return;
          mission.pushGoal(goalId);
          this.emit("goal_started", { missionId: mission.id, goalId, title: goal.title });
          await this.executeGoalDirectly(mission, goalId, availableSkills);
          remaining.delete(goalId);

          if (goal.status === "failed" && goal.priority === "critical") {
            console.log(`[Executor] ❌ Objectif critique échoué: "${goal.title}". Arrêt de la mission.`);
            criticalFailure = true;
          }
        })
      );

      // Sécurité : retirer de `remaining` tout ce qui est terminé.
      for (const id of [...remaining]) {
        if (isDone(id)) remaining.delete(id);
      }

      // Persister l'avancement après chaque vague (si un store est branché).
      await this.persist(mission);
    }

    if (criticalFailure && !mission.isCompleted()) {
      mission.completeGoal(mission.rootGoal.id, {
        success: false,
        summary: "Arrêt : un objectif critique a échoué.",
      });
    }
  }

  /**
   * Exécute une action unique et effectue la réflexion.
   */
  private async executeAction(
    mission: Mission,
    goalId: string,
    action: PlannedAction,
    _availableSkills: string[]
  ): Promise<ReflectionResult> {
    const goal = mission.getGoal(goalId)!;
    const startTime = Date.now();

    mission.startAction(action.id);
    this.emit("action_started", {
      missionId: mission.id,
      goalId,
      actionId: action.id,
      skill: action.skillName,
    });

    console.log(`[Executor]    ▶ ${action.skillName} (score: ${action.score})`);

    // Check budget before executing action
    const budgetStatus = telemetryService.checkBudget(mission.id);
    if (budgetStatus.exceeded) {
      console.warn(`[Executor] ⚠️ Budget exceeded for mission ${mission.id}: ${budgetStatus.reason}`);
      mission.recordActionResult(action.id, { error: budgetStatus.reason }, false);
      
      return {
        actionId: action.id,
        timestamp: new Date().toISOString(),
        observation: `Budget exceeded: ${budgetStatus.reason}`,
        success: null,
        failure: budgetStatus.reason || "Budget limit reached",
        hypothesis: null,
        confidence: 0,
        decision: "abort",
        reasoning: "Mission budget exceeded, stopping execution to prevent cost overrun.",
      };
    }

    let success = false;
    let result: unknown = undefined;
    let error: string | undefined = undefined;

    // Générer les arguments du skill au moment de l'exécution si le Planner
    // ne les a pas remplis (ils sont vides par défaut). On utilise le LLM avec
    // le schéma de l'outil, le contexte de l'objectif et les résultats déjà obtenus.
    if (this.needsArgs(action)) {
      let argGenError: string | null = null;
      try {
        action.args = await this.generateArgs(mission, goal, action);
      } catch (err) {
        argGenError = (err as Error).message;
        console.warn(
          `[Executor]    ⚠️ Génération d'arguments échouée pour ${action.skillName}: ${argGenError}`
        );
      }

      // Fail-fast : si l'outil exige des arguments mais que la génération a
      // échoué (JSON LLM invalide) ou n'a rien produit, NE PAS exécuter l'outil
      // avec des args vides/undefined. On l'a déjà payé en coûts (ex. embedding
      // Gemini sur une query vide → 400). On enregistre un échec explicite et on
      // laisse la boucle de réflexion décider (retry/replan).
      const stillMissingArgs = !action.args || Object.keys(action.args).length === 0;
      if (this.schemaRequiresArgs(action.skillName) && (argGenError || stillMissingArgs)) {
        const reason =
          `Arguments requis non disponibles pour ${action.skillName} ` +
          `(génération LLM ${argGenError ? `échouée: ${argGenError}` : "sans objet JSON exploitable"}).`;
        console.log(`[Executor]    ✗ ${action.skillName} ignoré: ${reason}`);
        mission.recordActionResult(action.id, { error: reason }, false);
        this.scorer.recordUsage(action.skillName, false, Date.now() - startTime);
        try { strategyMemory.recordSkillOutcome(action.skillName, false, Date.now() - startTime); } catch { /* best-effort */ }
        this.emit("action_completed", {
          missionId: mission.id,
          goalId,
          actionId: action.id,
          skill: action.skillName,
          success: false,
          error: reason,
          durationMs: Date.now() - startTime,
        });
        return this.createDefaultReflection(action.id, false);
      }
    }

    // Curseur d'autonomie : décider si l'action peut s'exécuter, doit être
    // approuvée, ou est refusée (mode suggest/ask/auto + .leannaignore).
    if (this.autonomy) {
      const verdict = this.autonomy.decide(action.skillName, action.args);
      let allowed = verdict.decision === "allow";

      if (verdict.decision === "deny") {
        console.log(`[Executor]    ⛔ ${action.skillName} refusé: ${verdict.reason}`);
        mission.recordActionResult(action.id, { error: verdict.reason }, false);
        this.emit("action_denied", {
          missionId: mission.id,
          goalId,
          actionId: action.id,
          skill: action.skillName,
          reason: verdict.reason,
        });
        return this.createDefaultReflection(action.id, false);
      }

      if (verdict.decision === "ask") {
        console.log(`[Executor]    ⏸️ ${action.skillName} en attente d'approbation: ${verdict.reason}`);
        allowed = await this.requestApproval(mission, goalId, action, verdict.reason);
        if (!allowed) {
          const reason = "Action refusée ou non approuvée dans le délai imparti.";
          mission.recordActionResult(action.id, { error: reason }, false);
          this.emit("action_denied", {
            missionId: mission.id,
            goalId,
            actionId: action.id,
            skill: action.skillName,
            reason,
          });
          return this.createDefaultReflection(action.id, false);
        }
      }
    }

    try {
      const dryRun = mission.getConfig().dryRun;
      result = await this.skillHandler!(action.skillName, action.args, { dryRun });
      const failure = Executor.detectSkillFailure(result);
      success = failure === null;
      if (!success) {
        error = failure ?? "Erreur retournée par le skill";
        console.log(`[Executor]    ✗ ${action.skillName} échoué (result): ${error}`);
      } else {
        console.log(`[Executor]    ✓ ${action.skillName} réussi`);
      }
    } catch (err: any) {
      error = err.message ?? String(err);
      console.log(`[Executor]    ✗ ${action.skillName} échoué: ${error}`);
    }

    const durationMs = Date.now() - startTime;

    // Enregistrer le résultat
    mission.recordActionResult(action.id, result, success);
    this.scorer.recordUsage(action.skillName, success, durationMs);
    // Persistance durable de la fiabilité du skill (GAP-1) : alimente la mémoire
    // de stratégie lue par les missions futures. Best-effort, jamais bloquant.
    try {
      strategyMemory.recordSkillOutcome(action.skillName, success, durationMs);
    } catch { /* la fiabilité durable est best-effort */ }

    // Réflexion
    const reflectionInput: ReflectionInput = {
      actionId: action.id,
      actionName: action.skillName,
      skillName: action.skillName,
      goalTitle: goal.title,
      success,
      result,
      error,
      attemptCount: goal.attempts + 1,
      maxAttempts: goal.maxAttempts,
      previousConfidence: mission.getMetrics().averageConfidence,
      previousErrors: mission.getContext().errors.map((e) => e.error),
    };

    const reflection = this.config.enableReflection
      ? await this.reflection.reflect(reflectionInput)
      : this.createDefaultReflection(action.id, success);

    mission.recordReflection(reflection);

    this.emit("action_completed", {
      missionId: mission.id,
      goalId,
      actionId: action.id,
      skill: action.skillName,
      success,
      confidence: reflection.confidence,
      decision: reflection.decision,
      durationMs,
    });

    return reflection;
  }

  // ─── Génération d'arguments ────────────────────────────────────────────────

  /** Une action a besoin d'arguments si le Planner ne les a pas remplis. */
  private needsArgs(action: PlannedAction): boolean {
    if (!this.llmArgGen) return false;
    const schema = this.toolSchemas.get(action.skillName);
    // Outil sans paramètres : rien à générer.
    if (schema && !this.schemaHasProperties(schema)) return false;
    return !action.args || Object.keys(action.args).length === 0;
  }

  private schemaHasProperties(schema: ToolSchema): boolean {
    const params = schema.parameters as any;
    if (!params || typeof params !== "object") return false;
    const props = params.properties;
    return !!props && typeof props === "object" && Object.keys(props).length > 0;
  }

  /**
   * Vrai si l'outil déclare au moins un paramètre `required` dans son schéma.
   * Sert au fail-fast : un outil sans paramètre obligatoire peut légitimement
   * s'exécuter avec des args vides, mais un outil à paramètre requis ne doit
   * jamais être appelé quand la génération d'arguments a échoué.
   */
  private schemaRequiresArgs(skillName: string): boolean {
    const schema = this.toolSchemas.get(skillName);
    const params = schema?.parameters as any;
    if (!params || typeof params !== "object") return false;
    return Array.isArray(params.required) && params.required.length > 0;
  }

  /**
   * Génère les arguments d'un skill via le LLM, en s'appuyant sur:
   *   - le schéma de paramètres de l'outil
   *   - le but courant (titre, description, critères)
   *   - les fichiers pertinents et les résultats des actions déjà exécutées
   */
  private async generateArgs(
    mission: Mission,
    goal: Goal,
    action: PlannedAction
  ): Promise<Record<string, unknown>> {
    if (!this.llmArgGen) return action.args ?? {};

    const schema = this.toolSchemas.get(action.skillName);
    const context = mission.getContext();

    const previousResults = goal.plannedActions
      .filter((a) => a.status === "completed" && a.id !== action.id)
      .slice(-3)
      .map((a) => ({
        skill: a.skillName,
        result: this.summarizeResult(a.result),
      }));

    // En mode « artefact forcé », on injecte une consigne supplémentaire pour
    // que l'écriture produise un livrable complet et autoportant (pas un
    // squelette vide), avec un nom de fichier par défaut si besoin.
    const forcedArtifact = this.loopGuards.get(goal.id)?.forcedArtifact === true;
    const artifactInstruction = forcedArtifact && Executor.WRITE_TOOLS.includes(action.skillName)
      ? `\nCONSIGNE PRIORITAIRE (ARTEFACT) :\n` +
        `- Cet appel DOIT produire un livrable concret et complet qui satisfait les critères de succès.\n` +
        `- Rédige un contenu réel et détaillé (pas de placeholder), au format Markdown si pertinent.\n` +
        `- Si aucun chemin n'est évident, utilise un nom de fichier explicite à la racine du projet ` +
        `(ex. "OPTIMIZATION_PLAN.md" pour un plan d'optimisation, sinon un nom dérivé de l'objectif).\n`
      : "";

    const prompt = `Tu génères les ARGUMENTS d'un outil pour accomplir une étape précise.

OUTIL: ${action.skillName}
DESCRIPTION: ${schema?.description ?? "(non documentée)"}
SCHÉMA DES PARAMÈTRES (JSON Schema):
${JSON.stringify(schema?.parameters ?? {}, null, 2)}

OBJECTIF COURANT: ${goal.title}
DÉTAIL: ${goal.description}
CRITÈRES DE SUCCÈS:
${goal.successCriteria.map((c) => `  - ${c}`).join("\n")}
JUSTIFICATION DE CET OUTIL: ${action.rationale}

CONTEXTE:
- Fichiers pertinents: ${context.relevantFiles.slice(0, 10).join(", ") || "aucun"}
- Mission: ${mission.getState().title} — ${mission.getState().description}
- Résultats précédents: ${previousResults.length > 0 ? JSON.stringify(previousResults) : "aucun"}
${artifactInstruction}
INSTRUCTIONS:
- Retourne UNIQUEMENT un objet JSON correspondant au schéma des paramètres.
- N'invente pas de champs absents du schéma.
- Si un paramètre est optionnel et inutile, ne l'inclus pas.
- Réponds STRICTEMENT en JSON, sans texte autour.

JSON:`;

    const raw = await this.withTimeout(this.llmArgGen(prompt), 20_000, "arg-gen");
    const args = this.parseJsonObject(raw);
    console.log(
      `[Executor]    🧩 Arguments générés pour ${action.skillName}: ${JSON.stringify(args).slice(0, 200)}`
    );
    return args;
  }

  // ─── Validation par critères de succès ──────────────────────────────────────

  /**
   * Valide qu'un objectif est réellement atteint au regard de ses
   * successCriteria, à partir des actions exécutées et de leurs résultats.
   * Utilise le LLM si disponible, sinon une heuristique conservatrice.
   */
  private async verifyGoalCriteria(_mission: Mission, goal: Goal): Promise<{
    passed: boolean;
    reasoning: string;
  }> {
    const executed = goal.plannedActions.filter(
      (a) => a.status === "completed" || a.status === "failed"
    );
    const anySuccess = executed.some((a) => a.status === "completed");
    const allSuccess =
      executed.length > 0 && executed.every((a) => a.status === "completed");

    // Sans critères explicites, on retombe sur le succès des actions.
    if (!goal.successCriteria || goal.successCriteria.length === 0) {
      return {
        passed: anySuccess,
        reasoning: anySuccess
          ? "Aucun critère explicite ; au moins une action a réussi."
          : "Aucun critère explicite et aucune action réussie.",
      };
    }

    // Sans LLM : validation conservatrice — toutes les actions doivent réussir.
    if (!this.llmVerify) {
      return {
        passed: allSuccess,
        reasoning: allSuccess
          ? "Toutes les actions planifiées ont réussi (validation heuristique)."
          : "Certaines actions ont échoué ; critères non confirmés (validation heuristique).",
      };
    }

    const actionsSummary = executed.map((a) => ({
      skill: a.skillName,
      status: a.status,
      result: this.summarizeResult(a.result),
    }));

    const prompt = `Tu es un vérificateur qualité. Évalue si l'objectif est atteint au vu des preuves.

OBJECTIF: ${goal.title}
DÉTAIL: ${goal.description}
CRITÈRES DE SUCCÈS:
${goal.successCriteria.map((c) => `  - ${c}`).join("\n")}

ACTIONS EXÉCUTÉES ET RÉSULTATS:
${JSON.stringify(actionsSummary, null, 2)}

INSTRUCTIONS:
- Juge uniquement à partir des preuves ci-dessus.
- "passed": true si les critères semblent satisfaits.
- "blocking": true UNIQUEMENT si tu as une preuve claire d'un échec réel
  (une action a renvoyé une erreur, un résultat contredit un critère). En cas
  de simple doute ou d'information manquante, "blocking" doit être false.
- Réponds STRICTEMENT en JSON: {"passed": true|false, "blocking": true|false, "reasoning": "..."}

JSON:`;

    try {
      const raw = await this.withTimeout(this.llmVerify(prompt), 20_000, "verify");
      const parsed = this.parseJsonObject(raw);
      const passed = parsed.passed === true;
      const blocking = parsed.blocking === true;
      const reasoning =
        typeof parsed.reasoning === "string" ? parsed.reasoning : "Vérification LLM effectuée.";

      // Tolérance : si toutes les actions ont réussi, un verdict négatif du LLM
      // ne fait échouer l'objectif QUE s'il signale un problème réellement
      // bloquant. Sinon, on considère l'objectif atteint (évite de bloquer les
      // dépendances sur un LLM trop strict ou une réponse ambiguë).
      if (!passed && allSuccess && !blocking) {
        return {
          passed: true,
          reasoning: `Toutes les actions ont réussi ; verdict LLM non bloquant retenu comme succès. (${reasoning})`,
        };
      }

      return { passed, reasoning };
    } catch (err) {
      console.warn(
        `[Executor]    ⚠️ Vérification des critères échouée, repli heuristique: ${(err as Error).message}`
      );
      return {
        passed: allSuccess,
        reasoning: "Vérification LLM indisponible ; repli sur le succès de toutes les actions.",
      };
    }
  }

  private summarizeResult(result: unknown): string {
    if (result === null || result === undefined) return "ok (vide)";
    if (typeof result === "string") return result.slice(0, SUMMARY_RESULT_MAX_CHARS);
    try {
      return JSON.stringify(result).slice(0, SUMMARY_RESULT_MAX_CHARS);
    } catch {
      return String(result).slice(0, SUMMARY_RESULT_MAX_CHARS);
    }
  }

  /**
   * Détecte un échec de skill à partir de son résultat.
   *
   * Historiquement, un skill n'était considéré en échec que s'il renvoyait une
   * clé `error` à la racine. Or de nombreux skills de vérification
   * (`verify_typecheck`, `verify_file`, `verify_lint`…) signalent leur échec
   * via `ok: false` ou `status: "failed"` SANS clé `error`. Résultat : une
   * compilation TypeScript en échec était loggée « ✓ réussi » puis contredite
   * par le vérificateur LLM (qui lisait `status: failed` dans la preuve),
   * faisant échouer toute la mission de façon incohérente.
   *
   * On reconnaît désormais explicitement ces conventions d'échec. Un résultat
   * qui ne déclare aucun de ces champs reste considéré comme un succès
   * (comportement permissif inchangé pour les skills « best-effort »).
   *
   * @returns `null` si succès, sinon un message d'échec lisible.
   */
  static detectSkillFailure(result: unknown): string | null {
    if (result === null || result === undefined) return null;
    if (typeof result !== "object") return null;
    const r = result as Record<string, unknown>;

    // 1. Clé d'erreur explicite (convention historique).
    if ("error" in r && r.error) {
      return typeof r.error === "string" ? r.error : "Erreur retournée par le skill";
    }

    // 2. Drapeau booléen de succès explicitement faux.
    if (r.ok === false || r.success === false) {
      return (
        (typeof r.message === "string" && r.message) ||
        (typeof r.stderr === "string" && r.stderr) ||
        "Le skill a signalé un échec (ok/success = false)."
      );
    }

    // 3. Champ `status` explicitement en échec.
    if (typeof r.status === "string") {
      const s = r.status.toLowerCase();
      if (s === "failed" || s === "error" || s === "failure") {
        return (
          (typeof r.message === "string" && r.message) ||
          `Le skill a renvoyé status="${r.status}".`
        );
      }
    }

    return null;
  }

  private parseJsonObject(raw: string): Record<string, unknown> {
    const trimmed = raw.trim();
    // 1. Essayer le parse direct
    try {
      const direct = JSON.parse(trimmed);
      if (typeof direct === "object" && direct !== null && !Array.isArray(direct)) {
        return direct as Record<string, unknown>;
      }
    } catch {
      // Continuer avec l'extraction
    }

    // 2. Extraire depuis un bloc de code markdown ```json ... ```
    const mdMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (mdMatch && mdMatch[1]) {
      try {
        const mdParsed = JSON.parse(mdMatch[1].trim());
        if (typeof mdParsed === "object" && mdParsed !== null && !Array.isArray(mdParsed)) {
          return mdParsed as Record<string, unknown>;
        }
      } catch {
        // Fallback sur le parcours de balanced braces
      }
    }

    // 3. Trouver le premier '{' et équilibrer les accolades
    const start = trimmed.indexOf("{");
    if (start === -1) throw new Error("Aucun objet JSON trouvé dans la réponse LLM");

    let depth = 0;
    let inString = false;
    let escape = false;
    let jsonEnd = -1;

    for (let i = start; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\" && inString) {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (ch === "{") depth++;
        else if (ch === "}") {
          depth--;
          if (depth === 0) {
            jsonEnd = i + 1;
            break;
          }
        }
      }
    }

    if (jsonEnd === -1) {
      throw new Error("Objet JSON malformé ou non fermé dans la réponse LLM");
    }

    const candidate = trimmed.slice(start, jsonEnd);
    const parsed = JSON.parse(candidate);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("La réponse LLM n'est pas un objet JSON");
    }
    return parsed as Record<string, unknown>;
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timeoutId: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(`LLM ${label} timeout (${ms}ms)`)), ms);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private createSubGoals(
    mission: Mission,
    parentId: string,
    plans: Array<{ title: string; description: string; successCriteria: string[]; priority: string; dependsOn?: string[] }>
  ): string[] {
    const ids: string[] = [];
    // 1re passe : créer tous les objectifs et mémoriser le mapping titre → id.
    const titleToId = new Map<string, string>();

    for (const plan of plans) {
      const id = mission.addSubGoal({
        parentId,
        title: plan.title,
        description: plan.description,
        successCriteria: plan.successCriteria,
        priority: plan.priority as import("./types.js").GoalPriority,
      });
      ids.push(id);
      titleToId.set(plan.title.trim().toLowerCase(), id);
    }

    // 2e passe : résoudre les dépendances (exprimées par titre) en IDs de goals.
    plans.forEach((plan, index) => {
      const deps = plan.dependsOn ?? [];
      if (deps.length === 0) return;
      const goal = mission.getGoal(ids[index]);
      if (!goal) return;
      goal.dependsOn = deps
        .map((d) => titleToId.get(String(d).trim().toLowerCase()))
        .filter((id): id is string => !!id && id !== ids[index]);
    });

    return ids;
  }

  private createDefaultReflection(actionId: string, success: boolean): ReflectionResult {
    return {
      actionId,
      timestamp: new Date().toISOString(),
      observation: success ? "Action réussie" : "Action échouée",
      success: success ? "OK" : null,
      failure: success ? null : "Échec",
      hypothesis: null,
      confidence: success ? 0.7 : 0.3,
      decision: success ? "continue" : "retry",
      reasoning: success ? "Succès, on continue." : "Échec, on retente.",
    };
  }

  private extractLessons(mission: Mission): string[] {
    const lessons: string[] = [];
    const context = mission.getContext();

    // Leçons des erreurs répétées
    const errorCounts = new Map<string, number>();
    for (const err of context.errors) {
      errorCounts.set(err.action, (errorCounts.get(err.action) || 0) + 1);
    }
    for (const [action, count] of errorCounts) {
      if (count >= 2) {
        lessons.push(`Le skill "${action}" a tendance à échouer (${count}x). Envisager une alternative.`);
      }
    }

    // Leçons des hypothèses validées
    if (context.hypotheses.length > 0) {
      lessons.push(`Hypothèses explorées: ${context.hypotheses.slice(-3).join("; ")}`);
    }

    return lessons;
  }

  private finalizeMission(mission: Mission): void {
    this.activeMissions.delete(mission.id);
    this.completedMissions.push(mission);
    if (this.completedMissions.length > Executor.MAX_COMPLETED) {
      this.completedMissions.shift();
    }
    // Persistance finale (statut terminal).
    void this.persist(mission);
    this.proposeLearning(mission);
    this.proposePlaybook(mission);
    this.updateProjectProfile(mission);
    this.selfCritique(mission);
    this.recordEvolution(mission);
  }

  /**
   * Self-Critique (task.md §10): compare plan vs execution vs result, score the
   * run, and surface "next time start with X". Best-effort; emits an event for
   * the UI. Does not mutate the mission.
   */
  private selfCritique(mission: Mission): void {
    try {
      const evaluation = selfEvaluationEngine.evaluate(mission.getState() as unknown as SelfEvalMissionView);
      this.selfEvaluations.set(mission.id, evaluation);
      this.emit("mission_self_critique", {
        missionId: mission.id,
        overall: evaluation.overall,
        scores: evaluation.scores,
        nextTimeStartWith: evaluation.nextTimeStartWith,
      });
    } catch (error) {
      this.emit("mission_self_critique_failed", { missionId: mission.id, error: String(error) });
    }
  }

  /**
   * Mission Evolution (task.md §6): record which APPROACH (ordered successful
   * skills) worked or failed for this problem CLASS, so a future similar mission
   * auto-selects the winning approach instead of repeating a failing one. Learns
   * from both success and failure. Best-effort.
   */
  private recordEvolution(mission: Mission): void {
    try {
      const state = mission.getState();
      const signature = problemSignature(state.title, state.context.errors.map((e) => e.error));
      const steps = Object.values(state.goals)
        .filter((g) => g.parentId !== null || Object.values(state.goals).length === 1)
        .flatMap((g) => [...g.plannedActions].sort((a, b) => a.order - b.order))
        .filter((a) => a.status === "completed" || a.status === "failed")
        .map((a) => a.skillName)
        .filter(Boolean);
      if (steps.length === 0) return;
      missionEvolutionStore.recordOutcome({ signature, steps, success: mission.status === "completed" });
    } catch {
      /* evolution learning is best-effort */
    }
  }

  /**
   * Keep the per-project intelligence profile current (task.md §4, P0): record
   * the terminal outcome and refresh detected stack / effective-vs-failing
   * strategies / learned playbooks so the next mission on this project starts
   * informed. Best-effort — never affects an already terminal mission.
   */
  private updateProjectProfile(mission: Mission): void {
    try {
      projectProfile.recordMissionOutcome(mission.status === "completed");
      // Re-aggregate reliability/playbook/knowledge signals (cheap, in-memory reads).
      projectProfile.refresh();
    } catch {
      /* profile maintenance is best-effort */
    }
  }

  /**
   * Learn a reusable Playbook from a *successful* mission (task.md §3, P0).
   * Complements proposeLearning: LearningEngine stores prose lessons, this stores
   * a replayable ordered skill sequence keyed by a stable trigger signature so
   * Leanna can later say « j'ai déjà résolu N problèmes similaires » and reuse
   * the strategy. Guarded and best-effort — never flips a terminal mission.
   */
  private proposePlaybook(mission: Mission): void {
    try {
      if (mission.status !== "completed") return;
      const state = mission.getState();
      const input: PlaybookMissionInput = {
        id: mission.id,
        title: state.title,
        status: state.status,
        goals: Object.fromEntries(
          Object.entries(state.goals).map(([id, goal]) => [id, {
            status: goal.status,
            dependsOn: goal.dependsOn,
            completedAt: goal.completedAt,
            parentId: goal.parentId,
            plannedActions: goal.plannedActions.map((action) => ({
              skillName: action.skillName,
              order: action.order,
              status: action.status,
            })),
          }]),
        ),
        errors: state.context.errors.map((error) => ({ action: error.action, error: error.error })),
        relevantFiles: state.context.relevantFiles,
      };
      const playbook = playbookStore.learnFromMission(input);
      if (playbook) {
        this.emit("mission_playbook_learned", {
          missionId: mission.id,
          playbookId: playbook.id,
          triggerSignature: playbook.triggerSignature,
          steps: playbook.steps.length,
          timesLearned: playbook.timesLearned,
        });
      }
    } catch (error) {
      // Playbook learning must never turn an already terminal mission into a failure.
      this.emit("mission_playbook_failed", { missionId: mission.id, error: String(error) });
    }
  }

  /**
   * Close reflection → learning without allowing the learning engine to mutate
   * the workspace or policy. Applying a proposal remains an explicit human or
   * policy decision in a later step.
   */
  private proposeLearning(mission: Mission): void {
    try {
      const state = mission.getState();
      const actions = Object.values(state.goals).flatMap((goal) => goal.plannedActions.map((action) => ({
        actionId: action.id,
        actionName: action.skillName,
        skillName: action.skillName,
        success: action.status === "completed",
        errorMessage: action.status === "failed" ? String(action.result ?? "Action failed") : undefined,
        goalId: goal.id,
      })));
      const learning = learningEngine.learnFromMission({
        missionId: mission.id,
        missionTitle: state.title,
        overallSuccess: mission.status === "completed",
        touchedFiles: state.context.relevantFiles,
        actions,
        errors: state.context.errors.map((error) => ({ message: error.error, action: error.action })),
        decisions: state.context.decisions.map((decision) => ({ what: decision.what, why: decision.why })),
      }, { applyAutoImprovements: false });
      this.learningResults.set(mission.id, learning);
      this.emit("mission_learning_completed", {
        missionId: mission.id,
        lessons: learning.lessons.length,
        candidateProposals: learning.candidateImprovements?.length ?? 0,
      });
    } catch (error) {
      // Learning must never turn an already terminal mission into a failure.
      this.emit("mission_learning_failed", { missionId: mission.id, error: String(error) });
    }
  }

  /**
   * Émet une demande d'approbation et attend sa résolution.
   * Résout `false` (refus) si le délai expire sans réponse.
   */
  private requestApproval(
    mission: Mission,
    goalId: string,
    action: PlannedAction,
    reason: string
  ): Promise<boolean> {
    this.emit("approval_required", {
      missionId: mission.id,
      goalId,
      actionId: action.id,
      skill: action.skillName,
      args: action.args,
      reason,
      timeoutMs: this.approvalTimeoutMs,
    });

    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingApprovals.delete(action.id);
        console.log(`[Executor]    ⌛ Approbation expirée pour ${action.skillName} — refus par défaut.`);
        this.emit("approval_timeout", {
          missionId: mission.id,
          goalId,
          actionId: action.id,
          skill: action.skillName,
        });
        resolve(false);
      }, this.approvalTimeoutMs);

      this.pendingApprovals.set(action.id, { resolve, timer });
    });
  }

  /** Sauvegarde l'état courant de la mission (no-op si aucun store branché). */
  private async persist(mission: Mission): Promise<void> {
    if (!this.store) return;
    try {
      await this.store.save(mission.toJSON());
    } catch (err) {
      console.warn(`[Executor] ⚠️ Persistance mission ${mission.id} échouée: ${(err as Error).message}`);
    }
  }

  /**
   * Détecte les missions interrompues (statut pending/in_progress) persistées
   * dans le store, SANS les relancer automatiquement.
   *
   * Au lieu de reprendre l'exécution d'office, chaque mission interrompue est
   * mise « en attente de décision » : l'utilisateur devra explicitement choisir
   * de la **réactiver** ou de l'**effacer** (via `confirmResume`). On émet un
   * événement `mission_resume_pending` par mission pour que l'UI présente le
   * choix.
   *
   * Cette méthode ne doit être appelée que lorsqu'un workspace est connecté
   * (l'appelant garde cette responsabilité). Elle est idempotente : une mission
   * déjà active ou déjà en attente n'est pas re-proposée.
   *
   * Ne fait rien si aucun store n'est branché ou si le SkillHandler manque.
   * Retourne le nombre de missions mises en attente de décision.
   */
  async resumePending(availableSkills: string[]): Promise<number> {
    if (!this.store || !this.store.isEnabled()) return 0;
    if (!this.skillHandler) {
      console.warn(`[Executor] resumePending appelé sans SkillHandler configuré.`);
      return 0;
    }

    // Mémoriser les skills pour pouvoir relancer une mission réactivée plus tard.
    this.resumeAvailableSkills = availableSkills;

    const states = await this.store.listByStatus(["pending", "in_progress"]);
    if (states.length === 0) return 0;

    let proposed = 0;
    for (const state of states) {
      // Ne pas re-proposer une mission déjà active ou déjà en attente de décision.
      if (this.activeMissions.has(state.id)) continue;
      if (this.pendingResumes.has(state.id)) continue;

      this.pendingResumes.set(state.id, { state, title: state.title });

      console.log(
        `[Executor] ⏸️ Mission interrompue détectée "${state.title}" (${state.id}) — ` +
          `en attente de décision utilisateur (réactiver / effacer).`
      );
      this.emit("mission_resume_pending", {
        missionId: state.id,
        title: state.title,
        priority: state.priority,
        status: state.status,
        updatedAt: state.updatedAt,
      });
      proposed++;
    }

    if (proposed > 0) {
      console.log(`[Executor] ⏸️ ${proposed} mission(s) interrompue(s) en attente de décision.`);
    }
    return proposed;
  }

  /**
   * Liste les missions interrompues en attente de décision utilisateur.
   * Utilisé par l'UI (fetch initial) pour reconstituer les cartes de décision.
   */
  listPendingResumes(): Array<{ missionId: string; title: string; priority: string; status: string; updatedAt: string }> {
    return Array.from(this.pendingResumes.values()).map(({ state }) => ({
      missionId: state.id,
      title: state.title,
      priority: state.priority,
      status: state.status,
      updatedAt: state.updatedAt,
    }));
  }

  /**
   * Applique la décision de l'utilisateur sur une mission interrompue :
   *   - `reactivate` : recharge la mission et relance son exécution en arrière-plan ;
   *   - `delete`     : efface la mission du store et l'abandonne définitivement.
   *
   * Retourne false si aucune mission en attente ne correspond à `missionId`.
   */
  confirmResume(missionId: string, decision: "reactivate" | "delete"): boolean {
    const pending = this.pendingResumes.get(missionId);
    if (!pending) return false;

    this.pendingResumes.delete(missionId);

    if (decision === "delete") {
      console.log(`[Executor] 🗑️ Mission interrompue "${pending.title}" (${missionId}) effacée sur demande.`);
      if (this.store) void this.store.delete(missionId);
      this.emit("mission_deleted", { missionId });
      return true;
    }

    // reactivate
    if (!this.skillHandler) {
      console.warn(`[Executor] Réactivation impossible: SkillHandler non configuré.`);
      return false;
    }
    // Garde-fou : si déjà active (double-clic), ne pas relancer deux fois.
    if (this.activeMissions.has(missionId)) return true;

    const mission = Mission.fromJSON(pending.state);
    this.activeMissions.set(mission.id, mission);

    console.log(`[Executor] ♻️ Reprise de la mission "${pending.title}" (${missionId}).`);
    this.emit("mission_resumed", { missionId: mission.id, title: pending.title });

    this.executeMission(mission, this.resumeAvailableSkills).catch((err) => {
      console.error(`[Executor] Reprise mission ${mission.id} échouée:`, err);
      this.emit("mission_failed", { missionId: mission.id, error: String(err) });
    });
    return true;
  }

  private emit(event: string, data: Record<string, unknown>): void {
    if (this.eventEmitter) {
      this.eventEmitter(event, data);
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Stable problem-class signature from a mission title + known errors. Resource-
 * independent (no paths/ids) so repeated instances of the same problem class
 * share one signature — the key philosophy used by PlaybookStore triggers and
 * exploited by MissionEvolutionStore to compare approaches across missions.
 */
function problemSignature(title: string, errors: string[]): string {
  const normErr = errors.map((e) =>
    e.toLowerCase()
      .replace(/[a-z]:\\[^:\s"']+/g, "<path>")
      .replace(/\/[^:\s"']{10,}/g, "<path>")
      .replace(/\d+/g, "<n>")
      .trim(),
  );
  const fam =
    normErr.find((e) => /ts<n>|typescript|type/.test(e)) ? "ts-error"
      : normErr.find((e) => /test|assert|expect/.test(e)) ? "test-failure"
        : normErr.find((e) => /lint|eslint/.test(e)) ? "lint-error"
          : normErr.length > 0 ? "error"
            : "objective";
  const t = title.toLowerCase();
  const kw =
    /perf|optimi/.test(t) ? "perf"
      : /refactor|clean/.test(t) ? "refactor"
        : /test/.test(t) ? "test"
          : /secur|sécur/.test(t) ? "security"
            : /doc/.test(t) ? "docs"
              : /fix|bug|corrige|erreur|error/.test(t) ? "fix"
                : "generic";
  return `${fam}:${kw}`;
}

// ─── Types ──────────────────────────────────────────────────────────────────

/** Options d'exécution transmises au handler de skill. */
export interface SkillHandlerOptions {
  /** Exécuter en simulation (dry-run), sans effet de bord. */
  dryRun?: boolean;
}

/** Handler pour exécuter un skill */
export type SkillHandlerFn = (
  name: string,
  args: any,
  options?: SkillHandlerOptions
) => Promise<any>;

/** Émetteur d'événements pour le frontend */
export type ExecutorEventEmitter = (event: string, data: Record<string, unknown>) => void;

/** Fonction LLM générique: prompt → texte. */
export type LLMTextFn = (prompt: string) => Promise<string>;

/** Schéma d'un outil, utilisé pour générer les arguments. */
export interface ToolSchema {
  name: string;
  description?: string;
  parameters?: unknown;
}
