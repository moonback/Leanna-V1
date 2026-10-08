/**
 * types/builder.ts — Structures de sortie du pipeline de compilation
 */

import type { AssistantMode } from "../types.js";
import type { TaskType } from "./context.js";
import type { PromptRule, RuleScope } from "./rules.js";
import type { PromptContext } from "./context.js";

// ═══════════════════════════════════════════════════════════════════════════════
// PromptAuthority
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Niveau d'autorité d'une section, du plus fort au plus faible :
 *
 *   policy → system → task → runtime → data → untrusted
 *
 * Règle d'or : une section d'autorité `data` ou `untrusted` ne doit JAMAIS être
 * rendue dans le même espace que la politique (`<policy>` / `<instructions>`).
 * Elle est confinée dans un conteneur de données explicitement non-instruction.
 *
 * - `policy`    : règles de politique canoniques (équivalent sections P0/P1).
 * - `system`    : sections système de confiance (base, safety, procédures).
 * - `task`      : sections liées au type de tâche.
 * - `runtime`   : contexte fourni par le runtime de confiance (workspace…).
 * - `data`      : données runtime (userName, chemin workspace) — jamais instruction.
 * - `untrusted` : contenu arbitraire fourni par le runtime (`extraSections`) —
 *                 traité comme donnée hostile potentielle (anti-injection).
 */
export type PromptAuthority =
  | "policy"
  | "system"
  | "task"
  | "runtime"
  | "data"
  | "untrusted";

/**
 * Rang numérique d'autorité (plus petit = plus fort). Sert au compilateur pour
 * garantir qu'une autorité faible ne peut jamais précéder une autorité forte.
 */
export const AUTHORITY_RANK: Record<PromptAuthority, number> = {
  policy:    0,
  system:    1,
  task:      2,
  runtime:   3,
  data:      4,
  untrusted: 5,
};

/** Autorités rendues comme DONNÉES (conteneur non-instruction), jamais comme consignes. */
export const DATA_AUTHORITIES: ReadonlySet<PromptAuthority> = new Set<PromptAuthority>([
  "data",
  "untrusted",
]);

// ═══════════════════════════════════════════════════════════════════════════════
// PromptSection
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Bloc de texte contextuel inséré dans le prompt compilé.
 * Contrairement aux PromptRule, les sections ne participent pas à la
 * résolution de conflits — elles sont sélectionnées ou ignorées.
 */
export interface PromptSection {
  /** Identifiant unique de la section. */
  id: string;

  /**
   * Niveau d'autorité de la section. Défaut (si absent) : `system` pour les
   * sections programmatiques/.md de confiance. Les contenus runtime arbitraires
   * doivent explicitement déclarer `data` ou `untrusted`.
   */
  authority?: PromptAuthority;

  /**
   * IDs de règles qui doivent être actives pour que cette section soit incluse.
   * Appliqué par SectionRegistry.select() à partir des règles résolues.
   * Si une dépendance est absente, la section est exclue.
   */
  requires?: string[];

  /**
   * Ordre d'insertion. Plus petit = inséré plus tôt.
   * Défaut implicite : 100.
   */
  priority?: number;

  /**
   * Scopes dans lesquels cette section doit apparaître.
   *
   * - `undefined`  → la section est toujours incluse (sections programmatiques
   *   comme workspace/footer qui n'ont pas de fichier .md).
   * - `[]` (vide)  → la section n'est incluse dans AUCUN contexte (opt-in) :
   *   c'est le cas d'un .md dont le front-matter ne déclare pas de `scope`.
   * - liste non vide → incluse si le contexte correspond à l'un des scopes.
   */
  scope?: RuleScope[];

  /** Contenu de la section. */
  content: string;

  /**
   * Condition runtime évaluée au moment de la sélection.
   * Si retourne false, la section est exclue.
   */
  when?: (context: PromptContext) => boolean;

  /**
   * Source (fichier .md ou module) pour le debug/audit.
   */
  source?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PromptConflict
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Enregistrement d'un conflit détecté et résolu entre deux règles.
 */
export interface PromptConflict {
  /** ID de la première règle. */
  ruleA: string;
  /** ID de la deuxième règle. */
  ruleB: string;
  /** ID de la règle qui a remporté le conflit. Absent si non résolu. */
  winner?: string;
  /** Explication lisible de la résolution. */
  reason: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BuiltPrompt
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Résultat complet de la compilation.
 * Expose le contenu final et toutes les informations d'audit.
 */
export interface BuiltPrompt {
  /** Texte du prompt système, prêt à être envoyé au modèle. */
  content: string;

  /** Règles actives après résolution des conflits, triées par priorité. */
  rules: PromptRule[];

  /** Sections sélectionnées, triées par priorité d'insertion. */
  sections: PromptSection[];

  /** Conflits détectés et résolus pendant la compilation. */
  conflicts: PromptConflict[];

  /** Métadonnées pour le monitoring et le debugging. */
  metadata: {
    mode: AssistantMode;
    taskType: TaskType;
    ruleCount: number;
    sectionCount: number;
    conflictCount: number;
    buildTimeMs: number;
  };
}
