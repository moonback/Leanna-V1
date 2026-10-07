/**
 * DynamicAgentRegistry — Registre dynamique des définitions d'agents
 *
 * Ce registre permet d'enregistrer, récupérer et gérer des définitions d'agents
 * créés dynamiquement (par exemple via l'Agent Builder).
 *
 * Il coexiste avec le AGENT_REGISTRY statique et est prioritaire pour les
 * rôles qui y sont enregistrés.
 */
import type { AgentDefinition, AgentRole } from "./types.js";
import { createLogger } from "../utils/logger.js";
import {
  validateAgentDefinition,
  AgentSecurityError,
} from "../security/agentDefinitionSchema.js";

const log = createLogger("DynamicAgentRegistry");

/**
 * Définition étendue d'un agent dynamique (inclut des métadonnées supplémentaires)
 */
export interface DynamicAgentDefinition extends AgentDefinition {
  /** ID unique de l'agent (peut être différent du rôle) */
  id?: string;
  /** Version de la définition */
  version?: string;
  /** Date de création */
  createdAt?: string;
  /** Date de dernière mise à jour */
  updatedAt?: string;
  /** Auteur/Chaîne de création */
  author?: string;
  /** Indique si l'agent est actif/disponible */
  isActive?: boolean;
  /** Tags pour catégorisation */
  tags?: string[];
  /**
   * Signature HMAC-SHA256 de la définition.
   * Requise quand la variable d'environnement LEANNA_AGENT_SECRET est définie.
   * Calculée via `computeAgentSignature()` depuis agentDefinitionSchema.ts.
   */
  signature?: string;
}

/**
 * Registre dynamique des agents.
 * Singleton qui maintient une map des rôles → définitions d'agents.
 */
export class DynamicAgentRegistry {
  private agents: Map<AgentRole, DynamicAgentDefinition> = new Map();
  private static instance: DynamicAgentRegistry;

  private constructor() {}

  /**
   * Retourne l'instance singleton du registre dynamique.
   */
  public static getInstance(): DynamicAgentRegistry {
    if (!DynamicAgentRegistry.instance) {
      DynamicAgentRegistry.instance = new DynamicAgentRegistry();
    }
    return DynamicAgentRegistry.instance;
  }

  /**
   * Enregistre un nouvel agent dynamique.
   *
   * SECURITY : la définition est validée avant tout enregistrement via
   * `validateAgentDefinition()` (schéma Zod + vérification HMAC optionnelle).
   * Toute définition non conforme lève une `AgentSecurityError`.
   *
   * @param definition - Définition complète de l'agent
   * @param override - Si true, écrase une définition existante (défaut: false)
   * @returns Le rôle de l'agent enregistré
   * @throws {AgentSecurityError} si la définition échoue la validation de sécurité
   * @throws {Error} si le rôle est déjà enregistré et override=false
   */
  registerAgent(
    definition: DynamicAgentDefinition,
    override: boolean = false
  ): AgentRole {
    // ── Étape 1 : Validation sécurité (Zod + HMAC) ──────────────────────────
    // validateAgentDefinition lève AgentSecurityError si la définition est
    // invalide structurellement ou si la signature HMAC est absente/incorrecte
    // quand LEANNA_AGENT_SECRET est configuré.
    try {
      validateAgentDefinition(definition);
    } catch (err) {
      if (err instanceof AgentSecurityError) {
        log.error(
          `🚫 Enregistrement refusé pour l'agent "${definition.role ?? "(sans rôle)"}": ${err.message}` +
          (err.details?.length ? `\n  → ${err.details.join("\n  → ")}` : "")
        );
        throw err;
      }
      throw err;
    }

    // ── Étape 2 : Garde de doublon ───────────────────────────────────────────
    const role = definition.role as AgentRole;

    if (this.agents.has(role) && !override) {
      throw new Error(
        `Agent "${role}" déjà enregistré dans le registre dynamique. ` +
        `Utilise override=true pour remplacer.`
      );
    }

    const now = new Date().toISOString();
    const agentDef: DynamicAgentDefinition = {
      ...definition,
      role: role as AgentRole,
      createdAt: definition.createdAt ?? now,
      updatedAt: now,
      isActive: definition.isActive ?? true,
      version: definition.version ?? "1.0.0",
    };

    this.agents.set(role, agentDef);

    log.info(
      `✅ Agent dynamique "${role}" enregistré${override ? " (remplacé)" : ""} ` +
      `(capabilities: ${agentDef.capabilities.length}, concurrency: ${agentDef.maxConcurrency})`
    );

    return role;
  }

  /**
   * Enregistre plusieurs agents en une seule opération.
   */
  registerAgents(
    definitions: DynamicAgentDefinition[],
    override: boolean = false
  ): AgentRole[] {
    return definitions.map((def) => this.registerAgent(def, override));
  }

  /**
   * Récupère la définition d'un agent dynamique.
   * @param role - Rôle de l'agent
   * @returns La définition de l'agent ou undefined si non trouvé
   */
  getAgent(role: string): DynamicAgentDefinition | undefined {
    return this.agents.get(role as AgentRole);
  }

  /**
   * Vérifie si un agent est enregistré dans le registre dynamique.
   */
  hasAgent(role: string): boolean {
    return this.agents.has(role as AgentRole);
  }

  /**
   * Récupère tous les agents dynamiques enregistrés.
   */
  getAllAgents(): DynamicAgentDefinition[] {
    return Array.from(this.agents.values());
  }

  /**
   * Récupère tous les rôles des agents dynamiques.
   */
  getAllRoles(): AgentRole[] {
    return Array.from(this.agents.keys());
  }

  /**
   * Supprime un agent du registre dynamique.
   * @param role - Rôle de l'agent à supprimer
   * @returns true si l'agent a été supprimé, false sinon
   */
  unregisterAgent(role: string): boolean {
    const deleted = this.agents.delete(role as AgentRole);
    if (deleted) {
      log.info(`🗑️ Agent dynamique "${role}" supprimé du registre`);
    }
    return deleted;
  }

  /**
   * Met à jour une définition d'agent existante.
   *
   * SECURITY : si les `updates` touchent des champs sensibles (capabilities,
   * systemPrompt, role, permissions), la définition fusionnée est re-validée
   * intégralement avant d'être persistée.
   *
   * @param role - Rôle de l'agent à mettre à jour
   * @param updates - Champs partiels à mettre à jour
   * @returns true si l'agent a été mis à jour, false sinon
   * @throws {AgentSecurityError} si la définition fusionnée échoue la validation
   */
  updateAgent(
    role: string,
    updates: Partial<DynamicAgentDefinition>
  ): boolean {
    const existing = this.agents.get(role as AgentRole);
    if (!existing) {
      return false;
    }

    const SECURITY_SENSITIVE_FIELDS: Array<keyof DynamicAgentDefinition> = [
      "capabilities",
      "systemPrompt",
      "role",
      "permissions",
      "signature",
    ];

    const touchesSensitiveField = SECURITY_SENSITIVE_FIELDS.some(
      (f) => f in updates
    );

    const merged: DynamicAgentDefinition = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    if (touchesSensitiveField) {
      try {
        validateAgentDefinition(merged);
      } catch (err) {
        if (err instanceof AgentSecurityError) {
          log.error(
            `🚫 Mise à jour refusée pour l'agent "${role}": ${err.message}` +
            (err.details?.length ? `\n  → ${err.details.join("\n  → ")}` : "")
          );
          throw err;
        }
        throw err;
      }
    }

    this.agents.set(role as AgentRole, merged);
    log.info(`🔄 Agent dynamique "${role}" mis à jour`);
    return true;
  }

  /**
   * Désactive un agent (le marque comme non disponible).
   */
  deactivateAgent(role: string): boolean {
    return this.updateAgent(role, { isActive: false });
  }

  /**
   * Active un agent.
   */
  activateAgent(role: string): boolean {
    return this.updateAgent(role, { isActive: true });
  }

  /**
   * Récupère les agents actifs uniquement.
   */
  getActiveAgents(): DynamicAgentDefinition[] {
    return Array.from(this.agents.values()).filter((a) => a.isActive !== false);
  }

  /**
   * Récupère les agents par tags.
   */
  getAgentsByTag(tag: string): DynamicAgentDefinition[] {
    return Array.from(this.agents.values()).filter(
      (a) => a.tags && a.tags.includes(tag)
    );
  }

  /**
   * Recherche des agents par nom ou description (recherche partielle).
   */
  searchAgents(query: string): DynamicAgentDefinition[] {
    const q = query.toLowerCase();
    return Array.from(this.agents.values()).filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.role.toLowerCase().includes(q)
    );
  }

  /**
   * Nettoie le registre (supprime tous les agents dynamiques).
   * Utile pour les tests ou un reset complet.
   */
  clear(): void {
    const count = this.agents.size;
    this.agents.clear();
    log.warn(`🧹 Registre dynamique nettoyé (${count} agent(s) supprimé(s))`);
  }

  /**
   * Statistiques du registre.
   */
  getStats(): {
    total: number;
    active: number;
    inactive: number;
    roles: string[];
  } {
    const all = Array.from(this.agents.values());
    return {
      total: all.length,
      active: all.filter((a) => a.isActive !== false).length,
      inactive: all.filter((a) => a.isActive === false).length,
      roles: Array.from(this.agents.keys()),
    };
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const dynamicAgentRegistry = DynamicAgentRegistry.getInstance();
