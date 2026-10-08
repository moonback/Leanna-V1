/**
 * RuleRegistry — Source canonique des politiques de prompt
 *
 * Distinct du PromptRegistry existant (qui gère les templates Markdown) :
 * ce registry gère les PromptRule typées avec priorité, scope et conflits.
 *
 * Les règles sont enregistrées au démarrage (depuis rules/core.ts ou via
 * le loader étendu) et sont ensuite lues en lecture seule par le pipeline.
 */

import type { PromptRule } from "./types/rules.js";

// ═══════════════════════════════════════════════════════════════════════════════
// RuleRegistry
// ═══════════════════════════════════════════════════════════════════════════════

export class RuleRegistry {
  private readonly rules = new Map<string, PromptRule>();

  /**
   * Une fois scellé (seal()), les garde-fous système (règles `immutable`) ne
   * peuvent plus être remplacés ni supprimés. Les règles d'extension restent
   * modifiables. (C2)
   */
  private sealed = false;

  // ─── Enregistrement ───────────────────────────────────────────────────────

  /**
   * Enregistre une règle.
   * Lance une erreur si l'ID est déjà pris (doublon = bug de configuration).
   */
  register(rule: PromptRule): void {
    if (this.rules.has(rule.id)) {
      throw new Error(
        `[RuleRegistry] Règle dupliquée : "${rule.id}". ` +
        `Chaque règle doit avoir un ID unique.`,
      );
    }
    this.rules.set(rule.id, rule);
  }

  /**
   * Enregistre plusieurs règles d'un coup.
   */
  registerAll(rules: PromptRule[]): void {
    for (const rule of rules) {
      this.register(rule);
    }
  }

  /**
   * Scelle le registre : les règles système (`immutable`) deviennent
   * inviolables. À appeler une seule fois, après le chargement des règles core.
   */
  seal(): void {
    this.sealed = true;
  }

  /** Indique si le registre est scellé. */
  get isSealed(): boolean {
    return this.sealed;
  }

  /**
   * Remplace une règle existante (utile pour les overrides de test et les
   * règles d'extension).
   *
   * Refus (C2) :
   *   - après seal(), remplacer une règle existante marquée `immutable` ;
   *   - après seal(), tenter de « rétrograder » une règle immuable en non
   *     immuable, ou d'écraser une règle immuable par une nouvelle définition.
   */
  override(rule: PromptRule): void {
    const existing = this.rules.get(rule.id);
    if (this.sealed && existing?.immutable) {
      throw new Error(
        `[RuleRegistry] Règle "${rule.id}" immuable : override interdit ` +
        `après scellement du registre (garde-fou système P0/P1).`,
      );
    }
    this.rules.set(rule.id, rule);
  }

  /**
   * Supprime une règle.
   * Refus (C2) : supprimer une règle `immutable` après seal().
   */
  unregister(id: string): boolean {
    const existing = this.rules.get(id);
    if (this.sealed && existing?.immutable) {
      throw new Error(
        `[RuleRegistry] Règle "${id}" immuable : unregister interdit ` +
        `après scellement du registre (garde-fou système P0/P1).`,
      );
    }
    return this.rules.delete(id);
  }

  // ─── Lecture ──────────────────────────────────────────────────────────────

  /**
   * Retourne une règle par son ID.
   */
  get(id: string): PromptRule | undefined {
    return this.rules.get(id);
  }

  /**
   * Vérifie l'existence d'une règle.
   */
  has(id: string): boolean {
    return this.rules.has(id);
  }

  /**
   * Retourne toutes les règles enregistrées.
   */
  all(): PromptRule[] {
    return [...this.rules.values()];
  }

  /**
   * Retourne les règles filtrées par priorité.
   */
  byPriority(priority: number): PromptRule[] {
    return this.all().filter(r => r.priority === priority);
  }

  /**
   * Retourne les règles filtrées par scope.
   */
  byScope(scope: string): PromptRule[] {
    return this.all().filter(r => r.scope.includes(scope as any));
  }

  /**
   * Nombre de règles enregistrées.
   */
  get size(): number {
    return this.rules.size;
  }
}
