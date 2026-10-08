/**
 * PlanEstimator — Estimation coût / durée / risque avant exécution
 *
 * Produit une estimation structurée à partir des actions planifiées et du
 * contexte de la mission, AVANT que la première action soit exécutée.
 *
 * Sources de données (dans l'ordre de priorité décroissante) :
 *  1. Historique en mémoire du SkillScorer (données de la session courante)
 *  2. Données amorçées depuis StrategyMemory (historique inter-missions)
 *  3. Defaults conservateurs par catégorie de skill (fallback)
 *  4. Tarification réelle du modèle actif via TelemetryService.calculateCost()
 */

import type { PlannedAction, MissionPlan } from "./types.js";
import type { SkillScorer } from "./SkillScorer.js";
import { telemetryService } from "../observability/TelemetryService.js";
import { getActiveProvider } from "../utils/textGeneration.js";

// ─── Constantes de tarification ───────────────────────────────────────────────

/** Tokens d'entrée estimés par appel (prompt système + contexte objectif moyen). */
const ESTIMATED_INPUT_TOKENS_PER_CALL = 1_800;

/** Tokens supplémentaires pour la planification elle-même (analyse + décomposition LLM). */
const PLANNING_OVERHEAD_TOKENS = 2_400;

/** Modèle utilisé par défaut si le provider actif est Gemini. */
const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
/** Modèle utilisé par défaut si le provider actif est OpenRouter. */
const DEFAULT_OPENROUTER_MODEL = "google/gemini-3.6-flash";

// ─── Seuils de niveau de risque ───────────────────────────────────────────────

/** Score de risque brut → niveau qualitatif. */
const RISK_THRESHOLDS = {
  low:      25,   // score ≤ 25 → low
  medium:   50,   // score ≤ 50 → medium
  high:     75,   // score ≤ 75 → high
  // score > 75  → critical
} as const;

// ─── Types internes ───────────────────────────────────────────────────────────

export interface PlanEstimate {
  estimatedTokens: number;
  estimatedCostUsd: number;
  estimatedDurationMs: number;
  riskLevel: MissionPlan["riskLevel"];
  estimationConfidence: number;
  /** Facteurs de risque identifiés (libellés courts affichables). */
  riskFactors: string[];
}

interface EstimationInput {
  plannedActions: PlannedAction[];
  missionTitle: string;
  missionDescription: string;
  targetedFiles: string[];
  maxRetries: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PlanEstimator
// ═══════════════════════════════════════════════════════════════════════════════

export class PlanEstimator {
  constructor(private readonly scorer: SkillScorer) {}

  /**
   * Calcule l'estimation complète à partir des actions planifiées.
   * Retourne un objet prêt à être fusionné dans `MissionPlan`.
   */
  estimate(input: EstimationInput): PlanEstimate {
    const { plannedActions, missionTitle, missionDescription, targetedFiles, maxRetries } = input;

    // ── 1. Tokens & coût ───────────────────────────────────────────────────
    const { estimatedTokens, estimatedCostUsd } = this.estimateTokensAndCost(plannedActions);

    // ── 2. Durée ───────────────────────────────────────────────────────────
    const estimatedDurationMs = this.estimateDuration(plannedActions);

    // ── 3. Risque ──────────────────────────────────────────────────────────
    const { riskLevel, riskFactors, rawScore } = this.assessRisk({
      plannedActions,
      missionTitle,
      missionDescription,
      targetedFiles,
      maxRetries,
      estimatedDurationMs,
    });

    // ── 4. Confiance dans l'estimation ────────────────────────────────────
    const estimationConfidence = this.computeConfidence(plannedActions, rawScore);

    return {
      estimatedTokens,
      estimatedCostUsd,
      estimatedDurationMs,
      riskLevel,
      estimationConfidence,
      riskFactors,
    };
  }

  // ─── Tokens & coût ─────────────────────────────────────────────────────────

  private estimateTokensAndCost(actions: PlannedAction[]): {
    estimatedTokens: number;
    estimatedCostUsd: number;
  } {
    if (actions.length === 0) {
      return {
        estimatedTokens: PLANNING_OVERHEAD_TOKENS,
        estimatedCostUsd: this.toCost(PLANNING_OVERHEAD_TOKENS / 2, PLANNING_OVERHEAD_TOKENS / 2),
      };
    }

    let totalInput  = PLANNING_OVERHEAD_TOKENS;
    let totalOutput = 0;

    for (const action of actions) {
      totalInput  += ESTIMATED_INPUT_TOKENS_PER_CALL;
      totalOutput += this.scorer.getEstimatedOutputTokens(action.skillName);
    }

    const estimatedTokens = totalInput + totalOutput;
    const estimatedCostUsd = this.toCost(totalInput, totalOutput);

    return { estimatedTokens, estimatedCostUsd };
  }

  /** Calcule le coût USD en utilisant la tarification réelle du modèle actif. */
  private toCost(inputTokens: number, outputTokens: number): number {
    const provider = getActiveProvider();
    const model = provider === "gemini" ? DEFAULT_GEMINI_MODEL : DEFAULT_OPENROUTER_MODEL;
    return telemetryService.calculateCost(model, inputTokens, outputTokens);
  }

  // ─── Durée ─────────────────────────────────────────────────────────────────

  /**
   * Durée totale = somme des durées par skill + overhead de réflexion (15 %),
   * car les actions s'exécutent séquentiellement dans la boucle Executor.
   */
  private estimateDuration(actions: PlannedAction[]): number {
    if (actions.length === 0) return 30_000; // planification seule ~30 s

    const rawSum = actions.reduce(
      (sum, a) => sum + this.scorer.getEstimatedDurationMs(a.skillName),
      0,
    );

    // +15 % overhead réflexion LLM entre chaque action
    return Math.round(rawSum * 1.15);
  }

  // ─── Risque ────────────────────────────────────────────────────────────────

  private assessRisk(params: {
    plannedActions:   PlannedAction[];
    missionTitle:     string;
    missionDescription: string;
    targetedFiles:    string[];
    maxRetries:       number;
    estimatedDurationMs: number;
  }): { riskLevel: MissionPlan["riskLevel"]; riskFactors: string[]; rawScore: number } {
    const {
      plannedActions, missionTitle, missionDescription,
      targetedFiles, estimatedDurationMs,
    } = params;

    let score = 0;
    const factors: string[] = [];
    const text = `${missionTitle} ${missionDescription}`.toLowerCase();

    // ── Complexité : nombre d'actions ──────────────────────────────────────
    if (plannedActions.length >= 15) {
      score += 25; factors.push("Nombre d'actions élevé (≥ 15)");
    } else if (plannedActions.length >= 8) {
      score += 15; factors.push("Nombre d'actions modéré (≥ 8)");
    } else if (plannedActions.length === 0) {
      score += 20; factors.push("Aucune action planifiée — scope incertain");
    }

    // ── Présence d'actions à effet de bord élevé ───────────────────────────
    const sideEffectSkills = new Set([
      "write_project_file", "modify_project_file", "patch_project_file",
      "run_command", "github_create_issue", "github_create_pr",
      "delete_project_file", "execute_sql",
    ]);
    const sideEffectCount = plannedActions.filter(a => sideEffectSkills.has(a.skillName)).length;
    if (sideEffectCount >= 5) {
      score += 20; factors.push(`${sideEffectCount} actions à effet de bord`);
    } else if (sideEffectCount >= 2) {
      score += 10; factors.push(`${sideEffectCount} actions modifient des fichiers`);
    }

    // ── Durée estimée longue ───────────────────────────────────────────────
    if (estimatedDurationMs >= 10 * 60_000) {
      score += 15; factors.push("Durée estimée > 10 min");
    } else if (estimatedDurationMs >= 5 * 60_000) {
      score += 8; factors.push("Durée estimée > 5 min");
    }

    // ── Mots-clés à risque dans l'énoncé ──────────────────────────────────
    const riskKeywords: [string, number, string][] = [
      ["supprim",   20, "Suppression mentionnée"],
      ["delet",     20, "Suppression mentionnée"],
      ["drop",      20, "Suppression BDD mentionnée"],
      ["migrat",    15, "Migration de données"],
      ["production",15, "Environnement de production"],
      ["authentif", 12, "Modification d'authentification"],
      ["sécurité",  12, "Modification de sécurité"],
      ["credential",12, "Gestion de credentials"],
      ["secret",    12, "Gestion de secrets"],
      ["deploy",    10, "Déploiement"],
      ["refactor",   8, "Refactorisation étendue"],
      ["réécrire",   8, "Réécriture"],
    ];
    for (const [keyword, weight, label] of riskKeywords) {
      if (text.includes(keyword)) {
        score += weight;
        factors.push(label);
      }
    }

    // ── Fichiers critiques ciblés ──────────────────────────────────────────
    const criticalPatterns = [".env", "auth", "secret", "credential", "schema.sql", "migration"];
    const hitFiles = targetedFiles.filter(f =>
      criticalPatterns.some(p => f.toLowerCase().includes(p))
    );
    if (hitFiles.length > 0) {
      score += 15;
      factors.push(`Fichier(s) sensible(s) ciblé(s) : ${hitFiles.slice(0, 2).join(", ")}`);
    }

    // ── Faible score moyen des actions planifiées (fiabilité) ─────────────
    if (plannedActions.length > 0) {
      const avgScore = plannedActions.reduce((s, a) => s + a.score, 0) / plannedActions.length;
      if (avgScore < 30) {
        score += 15; factors.push("Fiabilité des actions estimée faible");
      } else if (avgScore < 45) {
        score += 8; factors.push("Fiabilité des actions estimée modérée");
      }
    }

    // ── Cap à 100 ─────────────────────────────────────────────────────────
    const rawScore = Math.min(100, score);

    let riskLevel: MissionPlan["riskLevel"];
    if (rawScore <= RISK_THRESHOLDS.low)    riskLevel = "low";
    else if (rawScore <= RISK_THRESHOLDS.medium) riskLevel = "medium";
    else if (rawScore <= RISK_THRESHOLDS.high)   riskLevel = "high";
    else                                          riskLevel = "critical";

    return { riskLevel, riskFactors: factors, rawScore };
  }

  // ─── Confiance dans l'estimation ──────────────────────────────────────────

  /**
   * Confiance = proportion d'actions pour lesquelles le scorer dispose
   * d'au moins un enregistrement historique, pondérée par le niveau de risque.
   *
   * La confiance est délibérément basse quand le risque est élevé, pour
   * inciter l'utilisateur à vérifier manuellement.
   */
  private computeConfidence(actions: PlannedAction[], rawRiskScore: number): number {
    if (actions.length === 0) return 0.4;

    // Couverture réelle : proportion d'actions dont le skill possède un
    // historique d'usage observé (données fiables plutôt qu'un proxy de score).
    const withHistory = actions.filter((a) => this.scorer.hasUsageHistory(a.skillName)).length;

    const dataCoverage = withHistory / actions.length;

    // Pénalité proportionnelle au risque (max -0.3 pour risk critical)
    const riskPenalty = (rawRiskScore / 100) * 0.3;

    return Math.max(0.1, Math.min(1.0, dataCoverage * 0.9 - riskPenalty + 0.1));
  }
}
