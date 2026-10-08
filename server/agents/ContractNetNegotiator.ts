/**
 * ContractNetNegotiator — Négociation de tâches par appel d'offres (contract-net)
 *
 * Ajoute un protocole de négociation asynchrone PAR-DESSUS `AgentMessageBus`,
 * sans remplacer le chemin de délégation « push » existant (DelegationDispatcher
 * / DelegationManager) ni modifier `AgentCommunication.ts`.
 *
 * Modèle (contract-net protocol) :
 *   1. ANNONCE   : l'initiateur diffuse un appel d'offres (call_for_proposals)
 *                  décrivant la sous-tâche + les capacités requises.
 *   2. BIDS      : chaque agent candidat répond avec une offre scorée
 *                  (skillMatch, confidence, loadPenalty).
 *   3. ATTRIBUTION : à la fermeture de la fenêtre d'enchères, le meilleur bid
 *                  éligible remporte le marché ; un `task_request` ciblé est
 *                  publié sur le bus (réutilise le pipeline d'exécution existant).
 *
 * Le gagnant est l'agent avec la MEILLEURE correspondance de compétences.
 * Un bid dont `skillMatch === 0` est disqualifié : un agent sans aucune des
 * capacités requises ne peut pas remporter le marché.
 */
import { randomUUID } from "crypto";
import type { AgentRole } from "./types.js";
import type { AgentMessage, TaskRequestPayload } from "./AgentCommunication.js";
import { AgentMessageBus, agentMessageBus } from "./AgentMessageBus.js";
import { getAgentDefinition } from "./roles.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("ContractNetNegotiator");

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

/** Description de la tâche mise aux enchères. */
export interface NegotiationTask {
  taskId: string;
  title: string;
  description: string;
  /** Capacités requises pour exécuter la tâche (matchées contre `capabilities`). */
  requiredCapabilities: string[];
  files?: string[];
  instructions?: string;
  priority?: "low" | "medium" | "high" | "critical";
}

/** Offre soumise par un agent candidat. */
export interface Bid {
  /** Rôle de l'agent qui propose ses services. */
  role: AgentRole;
  /** Part des capacités requises couvertes par l'agent (0..1). */
  skillMatch: number;
  /** Confiance de l'agent / fiabilité historique (0..1). */
  confidence: number;
  /** Pénalité de charge actuelle (0..1, plus haut = plus chargé). */
  loadPenalty: number;
  /** Métadonnées libres optionnelles. */
  metadata?: Record<string, unknown>;
}

/** Bid enrichi d'un score calculé par le négociateur. */
export interface ScoredBid extends Bid {
  score: number;
  eligible: boolean;
}

/** Résultat d'une négociation. */
export interface NegotiationOutcome {
  taskId: string;
  /** Rôle gagnant, ou null si aucune offre éligible. */
  winner: AgentRole | null;
  winningScore: number | null;
  /** Tous les bids reçus, scorés et triés (meilleur en premier). */
  bids: ScoredBid[];
  /** True si un task_request a été publié vers le gagnant. */
  awarded: boolean;
}

/** Pondérations du score. */
export interface ScoringWeights {
  skill: number;
  confidence: number;
  load: number;
}

export interface NegotiatorOptions {
  /** Durée de la fenêtre d'enchères en ms (défaut 500). */
  biddingWindowMs?: number;
  /** Pondérations du score. */
  weights?: Partial<ScoringWeights>;
  /** Initiateur par défaut des appels d'offres. */
  initiator?: AgentRole;
}

const DEFAULT_WEIGHTS: ScoringWeights = { skill: 0.6, confidence: 0.25, load: 0.15 };

/**
 * Initiateur neutre par défaut des appels d'offres.
 *
 * Ce n'est PAS un rôle d'agent enregistré : aucun agent n'y est abonné, donc
 * le bus ne l'exclut d'aucun broadcast. Conséquence : TOUS les agents (y compris
 * `architect`) reçoivent l'appel d'offres et peuvent concourir, sans biais lié
 * à l'identité de l'émetteur.
 */
export const NEGOTIATION_INITIATOR = "orchestrator" as AgentRole;

// ═══════════════════════════════════════════════════════════════════════════════
// ContractNetNegotiator
// ═══════════════════════════════════════════════════════════════════════════════

export class ContractNetNegotiator {
  private readonly bus: AgentMessageBus;
  private readonly biddingWindowMs: number;
  private readonly weights: ScoringWeights;
  private readonly initiator: AgentRole;

  /** Enchères ouvertes : taskId → bids reçus. */
  private openCalls: Map<string, Bid[]> = new Map();

  constructor(bus: AgentMessageBus = agentMessageBus, options: NegotiatorOptions = {}) {
    this.bus = bus;
    this.biddingWindowMs = options.biddingWindowMs ?? 500;
    this.weights = { ...DEFAULT_WEIGHTS, ...options.weights };
    this.initiator = options.initiator ?? NEGOTIATION_INITIATOR;
  }

  // ─── API publique ──────────────────────────────────────────────────────────

  /**
   * Lance une négociation complète : annonce → collecte des bids → attribution.
   * Retourne l'issue (gagnant, bids scorés). Publie un `task_request` ciblé si
   * un gagnant éligible est trouvé.
   */
  async negotiate(
    task: NegotiationTask,
    from: AgentRole = this.initiator
  ): Promise<NegotiationOutcome> {
    this.openCalls.set(task.taskId, []);

    await this.announce(task, from);
    await this.wait(this.biddingWindowMs);

    const rawBids = this.openCalls.get(task.taskId) ?? [];
    this.openCalls.delete(task.taskId);

    const scored = this.scoreBids(rawBids).sort((a, b) => b.score - a.score);
    const best = scored.find((b) => b.eligible) ?? null;

    if (!best) {
      log.warn(
        `🪧 Aucune offre éligible pour la tâche "${task.title}" (${task.taskId.slice(0, 8)}) — ` +
          `${rawBids.length} bid(s) reçu(s), tous disqualifiés`
      );
      return { taskId: task.taskId, winner: null, winningScore: null, bids: scored, awarded: false };
    }

    const awarded = await this.award(task, best.role, from);

    log.info(
      `🏆 Marché attribué à [${best.role}] pour "${task.title}" ` +
        `(score ${best.score.toFixed(3)}, ${scored.length} bid(s))`
    );

    return {
      taskId: task.taskId,
      winner: best.role,
      winningScore: best.score,
      bids: scored,
      awarded,
    };
  }

  /**
   * Enregistre un bid pour une enchère ouverte. Appelé par les agents candidats
   * (ou par `collectBid` via le bus). Ignoré si l'enchère est fermée.
   */
  submitBid(taskId: string, bid: Bid): boolean {
    const bids = this.openCalls.get(taskId);
    if (!bids) {
      log.debug(`Bid ignoré : enchère ${taskId.slice(0, 8)} fermée ou inconnue`);
      return false;
    }
    bids.push(bid);
    log.debug(
      `📨 Bid reçu de [${bid.role}] pour ${taskId.slice(0, 8)} ` +
        `(skill ${bid.skillMatch.toFixed(2)}, conf ${bid.confidence.toFixed(2)}, load ${bid.loadPenalty.toFixed(2)})`
    );
    return true;
  }

  /** Indique si une enchère est actuellement ouverte pour ce taskId. */
  hasOpenCall(taskId: string): boolean {
    return this.openCalls.has(taskId);
  }

  /**
   * Calcule la part de capacités requises couvertes par un ensemble de capacités.
   * Exposé pour que les agents construisent leur bid depuis leurs propres skills.
   */
  skillMatchFor(capabilities: string[], requiredCapabilities: string[]): number {
    return this.computeSkillMatch(capabilities, requiredCapabilities);
  }

  /**
   * Construit automatiquement le bid d'un agent pour une tâche, à partir de sa
   * définition (capacités) et des métriques runtime du bus (charge + fiabilité).
   * Retourne null si l'agent est introuvable.
   */
  buildAutoBid(role: AgentRole, task: NegotiationTask): Bid | null {
    const definition = getAgentDefinition(role);
    if (!definition) return null;

    const skillMatch = this.computeSkillMatch(definition.capabilities, task.requiredCapabilities);
    const confidence = this.estimateConfidence(role);
    const loadPenalty = this.estimateLoadPenalty(role);

    return { role, skillMatch, confidence, loadPenalty };
  }

  /**
   * Fait participer un ensemble de rôles à l'enchère en construisant et soumettant
   * leur bid automatique. Pratique pour câbler des agents sans handler dédié.
   */
  autoBidFor(roles: AgentRole[], task: NegotiationTask): void {
    for (const role of roles) {
      const bid = this.buildAutoBid(role, task);
      if (bid) this.submitBid(task.taskId, bid);
    }
  }

  // ─── Étapes internes ─────────────────────────────────────────────────────

  /** Diffuse l'appel d'offres sur le bus (broadcast non bloquant). */
  private async announce(task: NegotiationTask, from: AgentRole): Promise<void> {
    await this.bus.broadcast(from, "call_for_proposals", {
      negotiation: true,
      taskId: task.taskId,
      title: task.title,
      description: task.description,
      requiredCapabilities: task.requiredCapabilities,
      files: task.files ?? [],
      instructions: task.instructions,
      priority: task.priority ?? "medium",
    });
    log.info(
      `📣 Appel d'offres diffusé par [${from}] : "${task.title}" ` +
        `(capacités requises: ${task.requiredCapabilities.join(", ") || "—"})`
    );
  }

  /** Publie le task_request ciblé vers le gagnant. */
  private async award(
    task: NegotiationTask,
    winner: AgentRole,
    from: AgentRole
  ): Promise<boolean> {
    const message: AgentMessage = {
      id: randomUUID(),
      type: "task_request",
      from,
      to: winner,
      priority: task.priority ?? "medium",
      timestamp: new Date().toISOString(),
      payload: {
        type: "task_request",
        taskId: task.taskId,
        title: task.title,
        description: task.description,
        files: task.files ?? [],
        instructions: task.instructions,
      } satisfies TaskRequestPayload,
      metadata: { negotiated: true, awardedTo: winner },
    };

    try {
      await this.bus.publish(message);
      return true;
    } catch (err) {
      log.error(`Échec publication task_request vers [${winner}]: ${(err as Error).message}`);
      return false;
    }
  }

  // ─── Scoring ───────────────────────────────────────────────────────────────

  /** Score tous les bids. Un bid avec skillMatch === 0 est inéligible. */
  private scoreBids(bids: Bid[]): ScoredBid[] {
    return bids.map((bid) => {
      const clampedSkill = clamp01(bid.skillMatch);
      const clampedConf = clamp01(bid.confidence);
      const clampedLoad = clamp01(bid.loadPenalty);

      const score =
        this.weights.skill * clampedSkill +
        this.weights.confidence * clampedConf -
        this.weights.load * clampedLoad;

      return {
        ...bid,
        skillMatch: clampedSkill,
        confidence: clampedConf,
        loadPenalty: clampedLoad,
        score,
        eligible: clampedSkill > 0,
      };
    });
  }

  /** Part des capacités requises couvertes par l'agent (0..1). */
  private computeSkillMatch(capabilities: string[], required: string[]): number {
    if (required.length === 0) return 0;
    const owned = new Set(capabilities);
    const covered = required.filter((cap) => owned.has(cap)).length;
    return covered / required.length;
  }

  /**
   * Estime la fiabilité d'un rôle à partir du taux de succès observé sur le bus.
   * Valeur neutre (0.5) en l'absence de données — pas de dépendance fantôme.
   */
  private estimateConfidence(role: AgentRole): number {
    const metrics = this.bus.getMetrics();
    const sent = metrics.byAgentRole[role];
    if (!sent || metrics.totalMessages === 0) return 0.5;
    // successRate est global au bus ; on l'utilise comme proxy de fiabilité
    // tant qu'aucune métrique par-rôle n'est disponible.
    return clamp01(metrics.successRate);
  }

  /** Estime la charge normalisée d'un rôle à partir de getAgentLoad(). */
  private estimateLoadPenalty(role: AgentRole): number {
    const load = this.bus.getAgentLoad();
    const entry = load[role];
    if (!entry) return 0;
    // Normalisation douce : 1 tâche active ≈ 0.25 de pénalité, plafonné à 1.
    return clamp01(entry.activeMessages * 0.25);
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

// ─── Singleton ──────────────────────────────────────────────────────────────

export const contractNetNegotiator = new ContractNetNegotiator();
