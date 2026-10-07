/**
 * core/EvidenceEngine.ts — P0.5 : moteur de preuve d'exécution.
 *
 * Principe directeur de l'audit (§12) :
 *
 *     Narration du LLM   ≠   Preuve d'exécution
 *     La preuve doit TOUJOURS gagner.
 *
 * Un agent qui « dit » avoir réussi ne suffit pas. Chaque mission produit un
 * `EvidenceBundle` durable qui agrège des faits observables : fichiers modifiés
 * (avec hash avant/après), tests exécutés/passés, typecheck, lint, appels
 * d'outils, approbations, décisions de politique, hypothèses non résolues, et
 * une confiance BORNÉE dérivée de ces faits (pas de l'auto-évaluation du modèle).
 *
 * Le bundle réutilise les structures déjà produites par le runtime agentique
 * (AgentResult) et par les modules P0 (ledger, checkpoints). Il n'invente aucune
 * donnée : il assemble et scelle ce qui a réellement été observé.
 */

import { coreDir, writeJsonAtomic, readJson } from "./paths.js";
import path from "node:path";

/** Résultat d'une phase de contrôle (typecheck, lint, test). */
export interface CheckResult {
  name: string;
  passed: boolean;
  details?: string;
}

/** Un fichier modifié avec ses empreintes avant/après (preuve d'écriture). */
export interface FileChange {
  path: string;
  hashBefore?: string;
  hashAfter?: string;
}

/** Décision de politique (permission/autonomie) journalisée. */
export interface PolicyDecision {
  tool: string;
  allowed: boolean;
  reason?: string;
}

/** Structure §12 de l'audit : preuve complète et sérialisable d'une mission. */
export interface EvidenceBundle {
  missionId: string;
  goal: string;
  createdAt: string;
  /** Fichiers modifiés avec hash avant/après. */
  changes: FileChange[];
  filesModified: string[];
  filesRead: string[];
  toolsExecuted: string[];
  testsExecuted: CheckResult[];
  typecheck?: CheckResult;
  lint?: CheckResult;
  runtimeChecks: CheckResult[];
  approvals: string[];
  policyDecisions: PolicyDecision[];
  /** Confiance BORNÉE [0,1], DÉRIVÉE des faits (pas de la narration). */
  confidence: number;
  /** Risques non résolus déclarés explicitement. */
  unresolvedRisks: string[];
  /** Verdict global : la preuve établit-elle le succès ? */
  passed: boolean;
}

/** Entrées brutes pour construire un bundle. Toutes optionnelles sauf le noyau. */
export interface EvidenceInput {
  missionId: string;
  goal: string;
  changes?: FileChange[];
  filesModified?: string[];
  filesRead?: string[];
  toolsExecuted?: string[];
  testsExecuted?: CheckResult[];
  typecheck?: CheckResult;
  lint?: CheckResult;
  runtimeChecks?: CheckResult[];
  approvals?: string[];
  policyDecisions?: PolicyDecision[];
  unresolvedRisks?: string[];
}

/** Ramène une valeur dans [0,1]. */
function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Calcule une confiance DÉTERMINISTE à partir des seuls faits observés :
 *   - tout check échoué plombe fortement la confiance ;
 *   - des risques non résolus la réduisent ;
 *   - l'absence totale de preuve (aucun check, aucun changement) la borne bas.
 * Aucune contribution ne provient de la narration du modèle.
 */
export function deriveConfidence(bundle: Omit<EvidenceBundle, "confidence" | "passed">): number {
  const checks: CheckResult[] = [
    ...bundle.testsExecuted,
    ...bundle.runtimeChecks,
    ...(bundle.typecheck ? [bundle.typecheck] : []),
    ...(bundle.lint ? [bundle.lint] : []),
  ];

  // Sans aucune preuve observable, la confiance est plancher.
  const hasEvidence = checks.length > 0 || bundle.filesModified.length > 0;
  if (!hasEvidence) return 0.1;

  const failed = checks.filter((c) => !c.passed).length;
  if (failed > 0) {
    // Au moins un contrôle a échoué : la preuve NE PEUT PAS établir le succès.
    return clamp01(0.2 - failed * 0.05);
  }

  // Base élevée quand tout ce qui a été mesuré passe.
  let score = checks.length > 0 ? 0.9 : 0.6;
  score -= bundle.unresolvedRisks.length * 0.1;
  return clamp01(score);
}

/**
 * Le bundle établit le succès uniquement si AUCUN contrôle exécuté n'a échoué.
 * (Un bundle sans aucun contrôle n'établit pas le succès d'une tâche d'écriture,
 * mais reste "passed=true" pour une tâche purement analytique sans check — la
 * décision finale revient au Supervisor qui connaît le type de tâche.)
 */
export function evidenceEstablishesSuccess(
  bundle: Omit<EvidenceBundle, "confidence" | "passed">
): boolean {
  const checks: CheckResult[] = [
    ...bundle.testsExecuted,
    ...bundle.runtimeChecks,
    ...(bundle.typecheck ? [bundle.typecheck] : []),
    ...(bundle.lint ? [bundle.lint] : []),
  ];
  return checks.every((c) => c.passed);
}

export class EvidenceEngine {
  private readonly dir: string;

  constructor(dirOverride?: string) {
    this.dir = dirOverride ?? coreDir("evidence");
  }

  private file(missionId: string): string {
    const safe = missionId.replace(/[^a-zA-Z0-9_.-]/g, "_");
    return path.join(this.dir, `${safe}.json`);
  }

  /** Assemble un `EvidenceBundle` à partir de faits observés, puis le scelle. */
  build(input: EvidenceInput): EvidenceBundle {
    const partial: Omit<EvidenceBundle, "confidence" | "passed"> = {
      missionId: input.missionId,
      goal: input.goal,
      createdAt: new Date().toISOString(),
      changes: input.changes ?? [],
      filesModified: input.filesModified ?? (input.changes ?? []).map((c) => c.path),
      filesRead: input.filesRead ?? [],
      toolsExecuted: input.toolsExecuted ?? [],
      testsExecuted: input.testsExecuted ?? [],
      typecheck: input.typecheck,
      lint: input.lint,
      runtimeChecks: input.runtimeChecks ?? [],
      approvals: input.approvals ?? [],
      policyDecisions: input.policyDecisions ?? [],
      unresolvedRisks: input.unresolvedRisks ?? [],
    };

    return {
      ...partial,
      confidence: deriveConfidence(partial),
      passed: evidenceEstablishesSuccess(partial),
    };
  }

  /** Persiste durablement un bundle (une preuve par mission). */
  save(bundle: EvidenceBundle): void {
    writeJsonAtomic(this.file(bundle.missionId), bundle);
  }

  /** Construit puis persiste en une étape. */
  record(input: EvidenceInput): EvidenceBundle {
    const bundle = this.build(input);
    this.save(bundle);
    return bundle;
  }

  /** Relit un bundle persisté, ou undefined s'il n'existe pas. */
  load(missionId: string): EvidenceBundle | undefined {
    return readJson<EvidenceBundle | null>(this.file(missionId), null) ?? undefined;
  }
}
