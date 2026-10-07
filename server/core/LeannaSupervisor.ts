/**
 * core/LeannaSupervisor.ts — P0.6 : autorité unique de mission.
 *
 * L'audit (§19) considère cela comme P0 : il manque une AUTORITÉ SUPÉRIEURE qui
 * possède la décision « quelle est la prochaine action ? ». Aujourd'hui la
 * réponse dépend du chemin emprunté (mission Executor vs runtime agentique).
 *
 * `LeannaSupervisor` est cette autorité. Il ne remplace pas les moteurs : il les
 * PILOTE via une fonction d'exécution injectée (`MissionRunner`) — ce qui pose la
 * couture vers un runtime canonique (P0.1) sans fusion risquée immédiate. Le
 * Supervisor orchestre le cycle transactionnel complet en combinant les briques
 * P0 :
 *
 *   MissionStateMachine (état durable)
 *   CheckpointManager   (snapshot/rollback)
 *   ExecutionLedger     (idempotence — via le runner)
 *   EvidenceEngine      (preuve, prime sur la narration)
 *
 * Cycle gouverné :
 *   CREATED → PLANNING → READY → RUNNING → (SNAPSHOT) → VERIFYING
 *     → preuve OK   → COMMITTING → COMPLETED
 *     → preuve FAIL → RECOVERING → (ROLLBACK) → retry / replan / ESCALATE
 *
 * Décisions possibles (audit §19, §17) : continue | retry | repair | replan |
 * pause | escalate | complete.
 */

import {
  MissionStateMachine,
  type MissionLifecycleState,
} from "./MissionStateMachine.js";
import { DurableMissionStore } from "./DurableMissionStore.js";
import { CheckpointManager } from "./CheckpointManager.js";
import { EvidenceEngine, type EvidenceInput, type EvidenceBundle } from "./EvidenceEngine.js";

/** Décision de récupération à quatre niveaux (audit §17). */
export type RecoveryDecision = "retry" | "repair" | "replan" | "escalate";

/** Ce que le runner remonte au Supervisor après une tentative d'exécution. */
export interface RunnerOutcome {
  /** L'exécution a-t-elle abouti du point de vue du runner ? */
  success: boolean;
  /**
   * Fichiers effectivement touchés par le runner (informationnel : le snapshot
   * de rollback est pris AVANT l'exécution à partir de `plannedFiles`).
   */
  touchedFiles?: string[];
  /** Preuves observées (tests, typecheck, lint, changes…) à sceller. */
  evidence?: Omit<EvidenceInput, "missionId" | "goal">;
  /** Décision de récupération suggérée en cas d'échec (sinon le Supervisor décide). */
  suggestedRecovery?: RecoveryDecision;
  /** Message d'erreur éventuel. */
  error?: string;
}

/** Fonction d'exécution d'une mission (le moteur réel — agentique/mission). */
export type MissionRunner = (ctx: {
  missionId: string;
  goal: string;
  attempt: number;
}) => Promise<RunnerOutcome>;

export interface SupervisorConfig {
  /** Nombre max de tentatives avant escalade obligatoire (défaut: 3). */
  maxAttempts: number;
  /** Store d'état (défaut: local .Leanna). */
  missionStore: DurableMissionStore;
  /** Gestionnaire de checkpoints (défaut: local .Leanna). */
  checkpoints: CheckpointManager;
  /** Moteur de preuve (défaut: local .Leanna). */
  evidence: EvidenceEngine;
}

/** Résultat final d'une mission gouvernée. */
export interface SupervisedResult {
  missionId: string;
  finalState: MissionLifecycleState;
  attempts: number;
  evidence?: EvidenceBundle;
}

export class LeannaSupervisor {
  private readonly maxAttempts: number;
  private readonly store: DurableMissionStore;
  private readonly checkpoints: CheckpointManager;
  private readonly evidence: EvidenceEngine;

  constructor(config: Partial<SupervisorConfig> = {}) {
    this.maxAttempts = config.maxAttempts ?? 3;
    this.store = config.missionStore ?? new DurableMissionStore();
    this.checkpoints = config.checkpoints ?? new CheckpointManager();
    this.evidence = config.evidence ?? new EvidenceEngine();
  }

  /** Persiste une transition et renvoie l'état atteint. */
  private advance(
    machine: MissionStateMachine,
    to: MissionLifecycleState,
    reason?: string
  ): MissionLifecycleState {
    const state = machine.transition(to, reason);
    this.store.save(machine);
    return state;
  }

  /**
   * Exécute une mission de bout en bout sous gouvernance. Le `runner` est le
   * moteur réel ; le Supervisor décide de l'état, des snapshots/rollbacks, de la
   * preuve et de la récupération.
   */
  async runMission(params: {
    missionId: string;
    goal: string;
    runner: MissionRunner;
    /**
     * Fichiers susceptibles d'être modifiés, connus AVANT l'exécution. Ils sont
     * snapshottés avant que le runner n'agisse, ce qui permet un rollback fidèle
     * à l'état antérieur. Fortement recommandé pour toute mission à effet de bord.
     */
    plannedFiles?: string[];
  }): Promise<SupervisedResult> {
    const { missionId, goal, runner } = params;
    const machine = new MissionStateMachine(missionId);
    this.store.save(machine);

    this.advance(machine, "PLANNING", "understand goal");
    this.advance(machine, "READY", "plan ready");

    let attempt = 0;
    let lastEvidence: EvidenceBundle | undefined;

    while (attempt < this.maxAttempts) {
      attempt++;
      this.advance(machine, "RUNNING", `attempt ${attempt}`);

      // PREPARE + SNAPSHOT : on capture l'état AVANT que le runner n'agisse, afin
      // qu'un rollback restaure réellement l'état antérieur (et non un état déjà
      // modifié par cette tentative). Les moteurs qui découvrent les fichiers en
      // cours de route peuvent en déclarer d'autres au tour suivant ; le
      // checkpoint couvre au moins les fichiers annoncés via `plannedFiles`.
      const checkpoint = this.checkpoints.snapshot(params.plannedFiles ?? [], {
        missionId,
        label: `attempt-${attempt}`,
      });

      let outcome: RunnerOutcome;
      try {
        outcome = await runner({ missionId, goal, attempt });
      } catch (err) {
        outcome = { success: false, error: (err as Error).message };
      }

      // Étend le checkpoint si le runner a touché des fichiers non anticipés :
      // on ne peut plus capturer leur contenu ORIGINAL (déjà modifié), mais on
      // enregistre au moins qu'ils doivent être supprimés au rollback s'ils
      // n'étaient pas connus. Pour les fichiers pré-existants non snapshottés,
      // l'appelant doit les déclarer via `plannedFiles` — documenté ci-dessous.

      // VERIFY : la PREUVE prime sur ce que le runner "dit".
      this.advance(machine, "VERIFYING", "evaluate evidence");
      const bundle = this.evidence.record({
        missionId,
        goal,
        ...(outcome.evidence ?? {}),
      });
      lastEvidence = bundle;

      const proven = bundle.passed && outcome.success;

      if (proven) {
        // COMMIT : on fige le checkpoint (rollback désormais interdit).
        this.advance(machine, "COMMITTING", "evidence establishes success");
        this.checkpoints.commit(checkpoint.id);
        this.advance(machine, "COMPLETED", "committed");
        return { missionId, finalState: machine.current, attempts: attempt, evidence: bundle };
      }

      // ÉCHEC → RECOVER. On annule les effets de cette tentative (rollback des
      // fichiers déclarés) avant de décider de la suite.
      this.advance(machine, "RECOVERING", outcome.error ?? "evidence failed");
      this.checkpoints.rollback(checkpoint.id);

      const decision = this.decideRecovery(outcome, attempt);

      if (decision === "escalate" || attempt >= this.maxAttempts) {
        this.advance(machine, "ESCALATED", `recovery=${decision}, attempts=${attempt}`);
        return { missionId, finalState: machine.current, attempts: attempt, evidence: bundle };
      }

      // retry / repair / replan → on ramène la machine à READY, d'où le prochain
      // tour de boucle transitera légalement vers RUNNING. Un replan matérialise
      // le changement de stratégie en repassant explicitement par PLANNING.
      if (decision === "replan") {
        this.advance(machine, "PLANNING", "replan after failure");
        this.advance(machine, "READY", "new plan ready");
      } else {
        this.advance(machine, "READY", `recovery=${decision}, ready to retry`);
      }
    }

    // Sécurité : sortie de boucle sans succès → escalade.
    if (!machine.isTerminal()) {
      this.advance(machine, "ESCALATED", "max attempts exhausted");
    }
    return { missionId, finalState: machine.current, attempts: attempt, evidence: lastEvidence };
  }

  /**
   * Décision de récupération à quatre niveaux (audit §17). Respecte la
   * suggestion du runner si fournie, sinon applique une escalade progressive :
   * les premières tentatives réessaient/réparent, la dernière escalade.
   */
  private decideRecovery(outcome: RunnerOutcome, attempt: number): RecoveryDecision {
    if (outcome.suggestedRecovery) return outcome.suggestedRecovery;
    if (attempt >= this.maxAttempts) return "escalate";
    if (attempt === 1) return "retry";
    return "replan";
  }
}
