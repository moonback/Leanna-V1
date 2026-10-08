/**
 * PolicyValidator — Validation de cohérence de la politique au démarrage (C9)
 *
 * Au boot, Leanna charge des règles (CORE_RULES + extensions) et des sections
 * (.md). Une configuration incohérente — ID dupliqué, dépendance cassée, cycle,
 * garde-fou P0 manquant, conflit non départageable — ne doit JAMAIS être
 * découverte en production. Ce validateur l'attrape au démarrage.
 *
 * Deux modes :
 *   - "warn"  : journalise les problèmes et laisse démarrer (phase de migration).
 *   - "strict": lève sur le premier problème CRITIQUE → fail-closed.
 *
 * La sévérité est portée par chaque Issue : les problèmes `critical` font
 * échouer le démarrage en mode strict ; les `warning` sont toujours tolérés.
 */

import type { PromptRule, RuleScope } from "./types/rules.js";
import type { PromptSection } from "./types/builder.js";
import { RulePriority } from "./types/rules.js";
import { ALL_AGENT_ROLES, type AgentRole } from "./types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export type IssueSeverity = "critical" | "warning";

export interface PolicyIssue {
  severity: IssueSeverity;
  code:     string;
  message:  string;
}

export interface PolicyValidationResult {
  ok:       boolean;         // true si aucun problème critique
  issues:   PolicyIssue[];
  critical: PolicyIssue[];
  warnings: PolicyIssue[];
}

export interface PolicyValidatorInput {
  rules:    PromptRule[];
  sections: PromptSection[];
  /** IDs de sections dont la présence est obligatoire (fail-closed). */
  criticalSectionIds?: string[];
}

export type ValidatorMode = "warn" | "strict";

// ─── Scopes valides (miroir du type RuleScope) ────────────────────────────────

const VALID_SCOPES: ReadonlySet<string> = new Set<RuleScope>([
  "global", "ask", "full", "coding", "debugging", "testing",
  "refactoring", "architecture", "browser", "document", "research", "agent",
]);

/** Rôles d'agent valides — exporté pour la validation runtime de allowedRoles (C10). */
export const VALID_AGENT_ROLES: ReadonlySet<string> = new Set<AgentRole>(ALL_AGENT_ROLES);

// ═══════════════════════════════════════════════════════════════════════════════
// PolicyValidator
// ═══════════════════════════════════════════════════════════════════════════════

export class PolicyValidator {
  /**
   * Valide la politique. Retourne la liste des problèmes classés par sévérité.
   */
  validate(input: PolicyValidatorInput): PolicyValidationResult {
    const issues: PolicyIssue[] = [];
    const { rules, sections, criticalSectionIds = [] } = input;

    const ruleIds = new Set(rules.map(r => r.id));

    this.checkDuplicateRuleIds(rules, issues);
    this.checkGuardrailsPresent(rules, issues);
    this.checkReferences(rules, ruleIds, issues);
    this.checkCycles(rules, issues);
    this.checkScopesAndWhen(rules, issues);
    this.checkTieBreakers(rules, issues);
    this.checkImmutableGuardrails(rules, issues);
    this.checkSectionRequires(sections, ruleIds, issues);
    this.checkCriticalSections(sections, criticalSectionIds, issues);

    const critical = issues.filter(i => i.severity === "critical");
    const warnings = issues.filter(i => i.severity === "warning");

    return { ok: critical.length === 0, issues, critical, warnings };
  }

  /**
   * Valide puis applique le mode. En "strict", lève si un problème critique
   * existe. Dans tous les cas, journalise les problèmes.
   */
  assert(input: PolicyValidatorInput, mode: ValidatorMode): PolicyValidationResult {
    const result = this.validate(input);

    for (const issue of result.warnings) {
      console.warn(`[PolicyValidator] ${issue.code}: ${issue.message}`);
    }
    for (const issue of result.critical) {
      console.error(`[PolicyValidator] ${issue.code}: ${issue.message}`);
    }

    if (mode === "strict" && !result.ok) {
      const summary = result.critical.map(i => `  - [${i.code}] ${i.message}`).join("\n");
      throw new Error(
        `[PolicyValidator] Validation de politique échouée (fail-closed). ` +
        `${result.critical.length} problème(s) critique(s) :\n${summary}`,
      );
    }

    return result;
  }

  // ─── Vérifications ──────────────────────────────────────────────────────────

  /** IDs de règles uniques. */
  private checkDuplicateRuleIds(rules: PromptRule[], issues: PolicyIssue[]): void {
    const seen = new Set<string>();
    for (const rule of rules) {
      if (seen.has(rule.id)) {
        issues.push({
          severity: "critical",
          code:     "DUPLICATE_RULE_ID",
          message:  `Règle dupliquée : "${rule.id}".`,
        });
      }
      seen.add(rule.id);
    }
  }

  /** Au moins un garde-fou P0 (SAFETY) et un P1 (AUTHORITY) doivent exister. */
  private checkGuardrailsPresent(rules: PromptRule[], issues: PolicyIssue[]): void {
    const hasP0 = rules.some(r => r.priority === RulePriority.SAFETY);
    const hasP1 = rules.some(r => r.priority === RulePriority.AUTHORITY);
    if (!hasP0) {
      issues.push({
        severity: "critical",
        code:     "MISSING_P0",
        message:  "Aucune règle P0 (SAFETY) : la politique n'a aucun garde-fou inviolable.",
      });
    }
    if (!hasP1) {
      issues.push({
        severity: "critical",
        code:     "MISSING_P1",
        message:  "Aucune règle P1 (AUTHORITY) : aucun périmètre d'autorité défini.",
      });
    }
  }

  /** requires[] et conflictsWith[] doivent pointer vers des IDs existants. */
  private checkReferences(
    rules:   PromptRule[],
    ruleIds: Set<string>,
    issues:  PolicyIssue[],
  ): void {
    for (const rule of rules) {
      for (const dep of rule.requires ?? []) {
        if (!ruleIds.has(dep)) {
          issues.push({
            severity: "critical",
            code:     "UNKNOWN_REQUIRES",
            message:  `"${rule.id}" requiert "${dep}" qui n'existe pas.`,
          });
        }
      }
      for (const opp of rule.conflictsWith ?? []) {
        if (!ruleIds.has(opp)) {
          issues.push({
            severity: "warning",
            code:     "UNKNOWN_CONFLICTS_WITH",
            message:  `"${rule.id}" déclare un conflit avec "${opp}" qui n'existe pas.`,
          });
        }
      }
    }
  }

  /** Détection de cycles dans le graphe `requires`. */
  private checkCycles(rules: PromptRule[], issues: PolicyIssue[]): void {
    const byId = new Map(rules.map(r => [r.id, r]));
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();

    const visit = (id: string, stack: string[]): boolean => {
      color.set(id, GRAY);
      stack.push(id);
      const rule = byId.get(id);
      for (const dep of rule?.requires ?? []) {
        if (!byId.has(dep)) continue; // référence inconnue déjà signalée
        const c = color.get(dep) ?? WHITE;
        if (c === GRAY) {
          issues.push({
            severity: "critical",
            code:     "DEPENDENCY_CYCLE",
            message:  `Cycle de dépendance : ${[...stack, dep].join(" → ")}.`,
          });
          return true;
        }
        if (c === WHITE && visit(dep, stack)) return true;
      }
      stack.pop();
      color.set(id, BLACK);
      return false;
    };

    for (const rule of rules) {
      if ((color.get(rule.id) ?? WHITE) === WHITE) {
        visit(rule.id, []);
      }
    }
  }

  /** Scopes valides et non vides. */
  private checkScopesAndWhen(rules: PromptRule[], issues: PolicyIssue[]): void {
    for (const rule of rules) {
      if (!rule.scope || rule.scope.length === 0) {
        issues.push({
          severity: "critical",
          code:     "EMPTY_SCOPE",
          message:  `"${rule.id}" n'a aucun scope : elle ne serait jamais active.`,
        });
        continue;
      }
      for (const scope of rule.scope) {
        if (!VALID_SCOPES.has(scope)) {
          issues.push({
            severity: "critical",
            code:     "INVALID_SCOPE",
            message:  `"${rule.id}" a un scope invalide : "${scope}".`,
          });
        }
      }
    }
  }

  /**
   * Conflit déclaré entre deux règles de même priorité SANS départage
   * (restrictiveness identique) : non déterministe → critique pour P0/P1,
   * avertissement sinon (le ConflictResolver départage par ID). (C5)
   */
  private checkTieBreakers(rules: PromptRule[], issues: PolicyIssue[]): void {
    const byId = new Map(rules.map(r => [r.id, r]));
    for (const rule of rules) {
      for (const oppId of rule.conflictsWith ?? []) {
        const opp = byId.get(oppId);
        if (!opp) continue;
        if (rule.priority !== opp.priority) continue;
        const r1 = rule.restrictiveness ?? 0;
        const r2 = opp.restrictiveness ?? 0;
        if (r1 !== r2) continue;

        // Même priorité + même restrictiveness → départage ambigu.
        const severity: IssueSeverity = rule.priority <= RulePriority.AUTHORITY
          ? "critical"
          : "warning";
        issues.push({
          severity,
          code:     "UNRESOLVABLE_TIE",
          message:
            `Conflit non départageable entre "${rule.id}" et "${oppId}" ` +
            `(P${rule.priority}, restrictiveness égale). Déclarez une ` +
            `'restrictiveness' distincte ou des priorités différentes.`,
        });
      }
    }
  }

  /** Les garde-fous P0/P1 doivent être marqués immuables. */
  private checkImmutableGuardrails(rules: PromptRule[], issues: PolicyIssue[]): void {
    for (const rule of rules) {
      const isGuardrail =
        rule.priority === RulePriority.SAFETY || rule.priority === RulePriority.AUTHORITY;
      if (isGuardrail && !rule.immutable) {
        issues.push({
          severity: "warning",
          code:     "MUTABLE_GUARDRAIL",
          message:  `Garde-fou "${rule.id}" (P${rule.priority}) non marqué immutable : modifiable après boot.`,
        });
      }
    }
  }

  /** Les `requires` des sections doivent pointer vers des IDs de règles existants. */
  private checkSectionRequires(
    sections: PromptSection[],
    ruleIds:  Set<string>,
    issues:   PolicyIssue[],
  ): void {
    for (const section of sections) {
      for (const dep of section.requires ?? []) {
        if (!ruleIds.has(dep)) {
          issues.push({
            severity: "warning",
            code:     "SECTION_UNKNOWN_REQUIRES",
            message:  `Section "${section.id}" requiert la règle "${dep}" qui n'existe pas (elle sera toujours exclue).`,
          });
        }
      }
    }
  }

  /** Les sections critiques doivent être présentes. */
  private checkCriticalSections(
    sections:           PromptSection[],
    criticalSectionIds: string[],
    issues:             PolicyIssue[],
  ): void {
    const present = new Set(sections.map(s => s.id));
    for (const id of criticalSectionIds) {
      if (!present.has(id)) {
        issues.push({
          severity: "critical",
          code:     "MISSING_CRITICAL_SECTION",
          message:  `Section critique "${id}" absente du pipeline.`,
        });
      }
    }
  }
}

// Export d'une instance partagée pratique.
export const policyValidator = new PolicyValidator();
