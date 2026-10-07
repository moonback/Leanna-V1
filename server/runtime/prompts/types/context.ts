/**
 * types/context.ts — Contexte résolu transmis à toute la pipeline
 *
 * Le ContextResolver produit un PromptContext à partir de SystemPromptConfig.
 * Chaque composant du pipeline (RuleRegistry, SectionRegistry, ConflictResolver)
 * consomme ce contexte en lecture seule.
 */

import type { AssistantMode, AgentRole, Language, ResponseStyle } from "../types.js";
import type { PromptSection } from "./builder.js";

// ═══════════════════════════════════════════════════════════════════════════════
// Provider
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fournisseur de modèle de texte actif pour la session.
 * Sert à conditionner les directives spécifiques à un fournisseur.
 */
export type ModelProvider = "gemini" | "openrouter";

// ═══════════════════════════════════════════════════════════════════════════════
// TaskType
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Nature de la tâche en cours.
 * Fourni idéalement par le runtime/classifieur, ou déduit du mode.
 */
export type TaskType =
  | "general"
  | "coding"
  | "debugging"
  | "testing"
  | "refactoring"
  | "architecture"
  | "document"
  | "browser"
  | "research";

// ═══════════════════════════════════════════════════════════════════════════════
// PromptContext
// ═══════════════════════════════════════════════════════════════════════════════

export interface PromptContext {
  /** Mode de session : "full" (agent) ou "ask" (Q&A documentaire). */
  mode: AssistantMode;

  /** Type de tâche, utilisé pour la sélection des règles et sections. */
  taskType: TaskType;

  /**
   * Fournisseur de modèle actif pour la session.
   * Les sections/directives spécifiques à un fournisseur (ex : raisonnement
   * interne natif de Gemini) sont gardées via `when(ctx => ctx.provider === ...)`.
   */
  provider: ModelProvider;

  /** Nom de l'assistant. */
  aiName: string;

  /** Nom de l'utilisateur (optionnel). */
  userName?: string;

  /** Rôle de l'utilisateur (optionnel). */
  userRole?: string;

  /** Chemin racine du workspace actif (optionnel). */
  workspace?: string;

  /** Configuration du système multi-agents. */
  agents: {
    enabled: boolean;
    allowedRoles?: AgentRole[];
  };

  /** Outils disponibles et activés pour cette session. */
  tools: {
    available: string[];
    enabled: string[];
  };

  /** Langue de réponse (optionnel). */
  language?: Language;

  /** Style de réponse (optionnel). */
  responseStyle?: ResponseStyle;

  /** Sections additionnelles injectées par le runtime. */
  extraSections?: PromptSection[];
}
