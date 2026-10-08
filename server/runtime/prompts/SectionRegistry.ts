/**
 * SectionRegistry — Catalogue des sections contextuelles du prompt
 *
 * Les sections sont des blocs de texte Markdown sélectionnés dynamiquement
 * selon le contexte (mode, taskType, agents.enabled…).
 *
 * Contrairement aux PromptRule, les sections :
 * - Ne participent pas à la résolution de conflits
 * - Sont triées par priority d'insertion (ordre d'affichage)
 * - Peuvent être activées/désactivées via un prédicat when()
 *
 * Les sections sont alimentées par le loader Markdown étendu OU
 * enregistrées programmatiquement depuis SystemPromptBuilder.
 */

import type { PromptSection } from "./types/builder.js";
import type { PromptContext } from "./types/context.js";
import type { RuleScope } from "./types/rules.js";

// ═══════════════════════════════════════════════════════════════════════════════
// SectionRegistry
// ═══════════════════════════════════════════════════════════════════════════════

export class SectionRegistry {
  private readonly sections = new Map<string, PromptSection>();

  // ─── Enregistrement ───────────────────────────────────────────────────────

  /**
   * Enregistre une section.
   * Lance une erreur si l'ID est déjà pris.
   */
  register(section: PromptSection): void {
    if (this.sections.has(section.id)) {
      throw new Error(
        `[SectionRegistry] Section dupliquée : "${section.id}".`,
      );
    }
    this.sections.set(section.id, section);
  }

  /**
   * Enregistre ou remplace une section (utile pour le rechargement à chaud).
   */
  set(section: PromptSection): void {
    this.sections.set(section.id, section);
  }

  /**
   * Enregistre plusieurs sections.
   */
  registerAll(sections: PromptSection[]): void {
    for (const section of sections) {
      this.register(section);
    }
  }

  /**
   * Supprime une section.
   */
  unregister(id: string): boolean {
    return this.sections.delete(id);
  }

  // ─── Sélection contextuelle ───────────────────────────────────────────────

  /**
   * Retourne toutes les sections actives pour le contexte donné,
   * triées par priority croissante.
   *
   * @param context       Contexte résolu (scope + when).
   * @param activeRuleIds IDs des règles actives après résolution des conflits.
   *                      Utilisé pour appliquer `section.requires` (C7). Si
   *                      omis, les dépendances `requires` ne sont pas vérifiées
   *                      (rétrocompat pour les appelants sans pipeline de règles).
   */
  select(context: PromptContext, activeRuleIds?: ReadonlySet<string>): PromptSection[] {
    return [...this.sections.values()]
      .filter(section => this.isActive(section, context, activeRuleIds))
      .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  }

  // ─── Lecture brute ────────────────────────────────────────────────────────

  get(id: string): PromptSection | undefined {
    return this.sections.get(id);
  }

  has(id: string): boolean {
    return this.sections.has(id);
  }

  all(): PromptSection[] {
    return [...this.sections.values()];
  }

  get size(): number {
    return this.sections.size;
  }

  // ─── Privé ────────────────────────────────────────────────────────────────

  private isActive(
    section: PromptSection,
    context: PromptContext,
    activeRuleIds?: ReadonlySet<string>,
  ): boolean {
    // Condition runtime explicite
    if (section.when && !section.when(context)) {
      return false;
    }

    // Dépendances `requires` (C7) : la section n'est active que si TOUTES les
    // règles dont elle dépend sont actives. Vérifié uniquement quand l'ensemble
    // des règles actives est fourni par le pipeline.
    if (activeRuleIds && section.requires && section.requires.length > 0) {
      const allPresent = section.requires.every(id => activeRuleIds.has(id));
      if (!allPresent) return false;
    }

    // Scope absent (undefined) → toujours active. Réservé aux sections
    // programmatiques (workspace, footer, extras) qui doivent apparaître
    // dans tous les contextes.
    if (!section.scope) {
      return true;
    }

    // Scope explicitement vide ([]) → jamais active. C'est le cas d'un .md
    // qui n'a déclaré aucun scope dans son front-matter : il est opt-in et
    // ne fuite donc dans aucun contexte tant qu'un scope n'est pas déclaré.
    if (section.scope.length === 0) {
      return false;
    }

    return section.scope.some(scope => this.matchesScope(scope, context));
  }

  private matchesScope(scope: RuleScope, context: PromptContext): boolean {
    if (scope === "global") return true;
    if (scope === context.mode) return true;
    if (scope === context.taskType) return true;
    if (scope === "agent" && context.agents.enabled) return true;
    return false;
  }
}
