/**
 * types/rules.ts — Hiérarchie de règles et structure d'une PromptRule
 *
 * Plus la valeur numérique est petite, plus la règle est prioritaire.
 * P0 SAFETY écrase toujours P7 STYLE.
 */

import type { PromptContext } from "./context.js";

// ═══════════════════════════════════════════════════════════════════════════════
// Priorités
// ═══════════════════════════════════════════════════════════════════════════════

export enum RulePriority {
  SAFETY    = 0,   // P0 — Garde-fous inviolables
  AUTHORITY = 10,  // P1 — Autorité et périmètre d'action
  RUNTIME   = 20,  // P2 — Comportement général du runtime
  TASK      = 30,  // P3 — Directives liées au type de tâche
  ROUTING   = 40,  // P4 — Délégation et orchestration
  TOOLS     = 50,  // P5 — Utilisation des outils
  PROCEDURE = 60,  // P6 — Procédures et workflows
  STYLE     = 70,  // P7 — Style, langue, format de réponse
}

// ═══════════════════════════════════════════════════════════════════════════════
// Scope
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scope fonctionnel d'une règle.
 * "global" : active dans tous les contextes.
 * Toute autre valeur : active seulement lorsque le contexte correspond.
 */
export type RuleScope =
  | "global"
  | "ask"
  | "full"
  | "coding"
  | "debugging"
  | "testing"
  | "refactoring"
  | "architecture"
  | "browser"
  | "document"
  | "research"
  | "agent";

// ═══════════════════════════════════════════════════════════════════════════════
// PromptRule
// ═══════════════════════════════════════════════════════════════════════════════

export interface PromptRule {
  /** Identifiant unique. Convention : "<domaine>.<sujet>" */
  id: string;

  /** Priorité P0–P7. Plus c'est petit, plus c'est fort. */
  priority: RulePriority;

  /** Scopes dans lesquels cette règle s'applique. */
  scope: RuleScope[];

  /** Texte destiné au modèle. */
  content: string;

  /**
   * IDs de règles avec lesquelles cette règle est incompatible.
   * En cas de conflit, la règle de priorité la plus basse (numériquement) l'emporte.
   */
  conflictsWith?: string[];

  /**
   * IDs de règles qui doivent être actives avant que celle-ci puisse l'être.
   * Si une dépendance est absente ou inactive, cette règle est ignorée.
   */
  requires?: string[];

  /**
   * Condition runtime évaluée au moment du build.
   * Si la fonction retourne false, la règle est ignorée.
   */
  when?: (context: PromptContext) => boolean;

  /**
   * Fichier ou module source (pour le debug / explain).
   * Ex : "safety.md", "rules/core.ts"
   */
  source?: string;

  /**
   * Si true, la règle est un garde-fou système : une fois le registre scellé
   * (seal()), elle ne peut plus être remplacée (override) ni supprimée
   * (unregister). Appliqué par défaut à toutes les règles P0 SAFETY et
   * P1 AUTHORITY au chargement (voir rules/core.ts). (C2)
   */
  immutable?: boolean;

  /**
   * Niveau de restriction, utilisé comme départage DÉTERMINISTE quand deux
   * règles en conflit ont la même priorité (C5). Plus la valeur est haute,
   * plus la règle est restrictive. En cas d'égalité de priorité ET de
   * restrictiveness, le ConflictResolver échoue fermé plutôt que de laisser
   * l'ordre d'insertion décider.
   *
   * Convention : une règle qui INTERDIT ou exige une confirmation est plus
   * restrictive (valeur haute) qu'une règle qui AUTORISE.
   */
  restrictiveness?: number;
}
