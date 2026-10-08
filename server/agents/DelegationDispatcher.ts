/**
 * DelegationDispatcher — Délégations autonomes entre agents
 *
 * Responsabilité unique : parser les blocs `## DÉLÉGATION` de la sortie d'un
 * agent et publier les `task_request` correspondants sur le bus de messages.
 *
 * Détient l'état des chaînes de délégation actives pour :
 *   - détecter les cycles (A -> B -> A),
 *   - borner la profondeur (max `MAX_DELEGATION_DEPTH` niveaux).
 *
 * Les sous-tâches sont lancées en parallèle (fire-and-forget) : elles
 * s'exécutent indépendamment et leurs résultats sont loggés.
 */
import { randomUUID } from "crypto";
import type { AgentTask } from "./types.js";
import { getAgentDefinition } from "./roles.js";
import { DelegationParser, type ParsedDelegation, type OpenDelegation } from "./DelegationParser.js";
import { agentMessageBus } from "./AgentMessageBus.js";
import type { TaskRequestPayload } from "./AgentCommunication.js";
import { contractNetNegotiator, type ContractNetNegotiator } from "./ContractNetNegotiator.js";
import { inferRequiredCapabilities } from "./capabilityInference.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("DelegationDispatcher");

export class DelegationDispatcher {
  private delegationParser = new DelegationParser();
  private negotiator: ContractNetNegotiator;

  constructor(negotiator: ContractNetNegotiator = contractNetNegotiator) {
    this.negotiator = negotiator;
  }

  /**
   * Limite de profondeur maximale pour les délégations (évite les cascades infinies)
   */
  private static readonly MAX_DELEGATION_DEPTH = 4;

  /**
   * Map pour suivre les chaînes de délégation actives et détecter les cycles
   * Clé: parentTaskId, Valeur: Set des rôles déjà rencontrés dans cette chaîne
   */
  private delegationChains: Map<string, Set<string>> = new Map();

  /**
   * Parse la sortie de l'agent, extrait les blocs ## DÉLÉGATION
   * et envoie des task_request sur le bus pour chaque délégation valide.
   *
   * Les sous-tâches sont lancées en parallèle (fire-and-forget) :
   * elles s'exécutent indépendamment et leurs résultats sont loggés.
   * On retourne les IDs des tâches déléguées pour la traçabilité.
   */
  async dispatchDelegations(
    parentTask: AgentTask,
    resultText: string,
    depth: number = 0
  ): Promise<string[]> {
    const { delegations, openDelegations, warnings } = this.delegationParser.parse(
      resultText,
      parentTask.role
    );

    // Logger les avertissements de parsing
    for (const w of warnings) {
      log.warn(`[DelegationParser] ${w}`);
    }

    if (delegations.length === 0 && openDelegations.length === 0) return [];

    const agent = getAgentDefinition(parentTask.role);
    if (!agent) {
      log.error(`[dispatchDelegations] Agent "${parentTask.role}" introuvable`);
      return [];
    }
    log.info(
      `🔀 [${agent.name}] ${delegations.length} délégation(s) ciblée(s) + ` +
        `${openDelegations.length} à négocier, profondeur ${depth} — dispatch en cours...`
    );

    const subTaskIds: string[] = [];
    const nextDepth = depth + 1;

    try {
      // Délégations ciblées : publication directe (fire-and-forget).
      const dispatches = delegations.map((delegation: ParsedDelegation) =>
        this.sendDelegation(parentTask, delegation, nextDepth).then((taskId) => {
          if (taskId) subTaskIds.push(taskId);
        })
      );

      // Délégations ouvertes (cible non évidente) : mise aux enchères contract-net.
      const negotiations = openDelegations.map((open: OpenDelegation) =>
        this.negotiateDelegation(parentTask, open).then((taskId) => {
          if (taskId) subTaskIds.push(taskId);
        })
      );

      await Promise.allSettled([...dispatches, ...negotiations]);

      log.info(
        `[${agent.name}] ${subTaskIds.length}/${delegations.length + openDelegations.length} ` +
          `sous-tâche(s) dispatchée(s) (profondeur: ${nextDepth})`
      );

      return subTaskIds;
    } finally {
      // Nettoyer la chaîne seulement une fois tous les dispatches de ce parent terminés
      this.delegationChains.delete(parentTask.id);
    }
  }

  /**
   * Met une délégation « ouverte » (sans cible explicite) aux enchères via le
   * négociateur contract-net. Les capacités requises sont déduites par
   * heuristique depuis la RAISON et les INSTRUCTIONS. Le négociateur diffuse
   * l'appel d'offres, collecte les bids, et attribue (publie le task_request)
   * au meilleur-match. Retourne le taskId mis aux enchères, ou null si personne
   * n'a remporté le marché.
   */
  private async negotiateDelegation(
    parentTask: AgentTask,
    open: OpenDelegation
  ): Promise<string | null> {
    const taskId = randomUUID();
    const requiredCapabilities = inferRequiredCapabilities(open.reason, open.instructions);

    const description = [
      `Sous-tâche déléguée (par appel d'offres) depuis [${parentTask.role}]`,
      ``,
      `Raison : ${open.reason}`,
      ``,
      `Contexte de la tâche parent :`,
      `- Titre : ${parentTask.title}`,
      `- Description : ${parentTask.description.slice(0, 300)}`,
    ].join("\n");

    log.info(
      `📣 [${parentTask.role}] Mise aux enchères : "${open.reason.slice(0, 60)}" ` +
        `(capacités déduites: ${requiredCapabilities.join(", ")})`
    );

    try {
      const outcome = await this.negotiator.negotiate({
        taskId,
        title: `[Enchère] ${open.reason.slice(0, 80)}`,
        description,
        requiredCapabilities,
        files: [
          ...open.files,
          ...(parentTask.result?.filesModified ?? []),
        ].filter((v, i, arr) => arr.indexOf(v) === i),
        instructions: open.instructions,
        priority: open.priority,
      });

      if (!outcome.winner) {
        log.warn(
          `[${parentTask.role}] Enchère "${open.reason.slice(0, 40)}" sans gagnant — aucune offre éligible`
        );
        return null;
      }

      log.info(
        `🏆 [${parentTask.role}] Enchère remportée par [${outcome.winner}] ` +
          `(task: ${taskId.slice(0, 8)})`
      );
      return outcome.awarded ? taskId : null;
    } catch (err) {
      log.error(
        `[${parentTask.role}] Échec négociation "${open.reason.slice(0, 40)}": ${(err as Error).message}`
      );
      return null;
    }
  }

  /**
   * Envoie une délégation unique sur le bus de messages.
   * Retourne l'ID de la sous-tâche créée, ou null en cas d'erreur.
   *
   * Implémente :
   * - Détection de cycle : empêche A -> B -> A
   * - Limite de profondeur : max 4 niveaux de délégation
   */
  private async sendDelegation(
    parentTask: AgentTask,
    delegation: ParsedDelegation,
    depth: number = 0
  ): Promise<string | null> {
    const taskId = randomUUID();
    const agent = getAgentDefinition(parentTask.role);
    if (!agent) {
      log.error(`[sendDelegation] Agent "${parentTask.role}" introuvable`);
      return null;
    }

    // Vérifier la limite de profondeur
    if (depth >= DelegationDispatcher.MAX_DELEGATION_DEPTH) {
      log.warn(
        `[${agent.name}] Délégation rejetée : profondeur maximale atteinte (${DelegationDispatcher.MAX_DELEGATION_DEPTH}) - ` +
        `chaîne: ${this.formatDelegationChain(parentTask.id)}`
      );
      return null;
    }

    // Vérifier les cycles dans la chaîne de délégation
    const chain = this.getDelegationChain(parentTask.id);
    if (chain.has(delegation.targetRole)) {
      log.warn(
        `[${agent.name}] Délégation rejetée : cycle détecté - ${delegation.targetRole} est déjà dans la chaîne: ` +
        `${Array.from(chain).join(' -> ')} -> ${delegation.targetRole}`
      );
      return null;
    }

    // Enregistrer cette délégation dans la chaîne
    this.addToDelegationChain(parentTask.id, delegation.targetRole);

    // Construire une description enrichie avec le contexte du parent
    const description = [
      `Sous-tâche déléguée par [${agent.name}]`,
      ``,
      `Raison : ${delegation.reason}`,
      ``,
      `Contexte de la tâche parent :`,
      `- Titre : ${parentTask.title}`,
      `- Description : ${parentTask.description.slice(0, 300)}`,
      ...(parentTask.result?.summary
        ? [`- Résultat parent : ${parentTask.result.summary}`]
        : []),
    ].join("\n");

    const message = {
      id: randomUUID(),
      type: "task_request" as const,
      from: parentTask.role,
      to: delegation.targetRole,
      priority: delegation.priority as "low" | "medium" | "high" | "critical",
      timestamp: new Date().toISOString(),
      payload: {
        type: "task_request",
        taskId,
        title: `[Sous-tâche] ${delegation.reason.slice(0, 80)}`,
        description,
        files: [
          ...delegation.files,
          // Inclure aussi les fichiers du parent qui sont pertinents
          ...(parentTask.result?.filesModified ?? []),
        ].filter((v, i, arr) => arr.indexOf(v) === i), // dédupliquer
        instructions: delegation.instructions,
      } as TaskRequestPayload,
      metadata: {
        parentTaskId: parentTask.id,
        parentRole: parentTask.role,
        delegationBlockIndex: delegation.blockIndex,
        autonomous: true,
      },
    };

    try {
      // Publish fire-and-forget (pas d'await de réponse — la sous-tâche s'exécute de manière autonome)
      await agentMessageBus.publish(message);

      log.info(
        `📤 [${agent.name}] Délégation envoyée → [${delegation.targetRole}]: "${delegation.reason.slice(0, 60)}" (task: ${taskId.slice(0, 8)})`
      );
      return taskId;
    } catch (err) {
      log.error(
        `[${agent.name}] Échec envoi délégation → [${delegation.targetRole}]: ${(err as Error).message}`
      );
      return null;
    }
  }

  /**
   * Récupère la chaîne de délégation pour une tâche
   */
  private getDelegationChain(taskId: string): Set<string> {
    let chain = this.delegationChains.get(taskId);
    if (!chain) {
      chain = new Set<string>();
      this.delegationChains.set(taskId, chain);
    }
    return chain;
  }

  /**
   * Ajoute un rôle à la chaîne de délégation
   */
  private addToDelegationChain(taskId: string, role: string): void {
    let chain = this.delegationChains.get(taskId);
    if (!chain) {
      chain = new Set<string>();
      this.delegationChains.set(taskId, chain);
    }
    chain.add(role);
  }

  /**
   * Formate la chaîne de délégation pour le log
   */
  private formatDelegationChain(taskId: string): string {
    const chain = this.delegationChains.get(taskId);
    return chain ? Array.from(chain).join(' -> ') : taskId;
  }
}
