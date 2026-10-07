/**
 * jevGating.ts — Politique de gating des actions agentiques via Jev.
 *
 * C'est l'exemple d'intégration recommandé de Jev dans Leanna : au lieu de
 * demander à un LLM de chat « cette action est-elle dangereuse ? OUI/NON »
 * (texte à parser, non calibré), on pose à Jev des questions TYPÉES et on route
 * sur ses probabilités.
 *
 * Découpage (le même que la doc TypeSafe) :
 *   1. Le code déterministe s'occupe du reste (chemins interdits, .leannaignore…).
 *   2. Jev est appelé UNIQUEMENT pour le jugement sémantique.
 *   3. Une fonction PURE (`decideGate`) transforme les probabilités en action,
 *      donc les seuils sont rejouables sans nouvel appel réseau.
 */

import { decide, isChoice, isNoul, type JevAnswer } from './jevDecisions.js';

export type GateAction = 'allow' | 'review' | 'block';

/** Description d'une action agentique à évaluer. */
export interface AgentActionContext {
  /** Nom de l'outil demandé (ex: fs_write, execute_command, delete_file). */
  tool: string;
  /** Cible principale (chemin, commande, URL…). */
  target?: string;
  /** Arguments/résumé de ce que l'action va faire, en langage naturel. */
  summary: string;
  /** Faits calculés par le code, passés comme labels finis à Jev. */
  facts?: Record<string, string | number | boolean>;
}

/** Sortie brute de Jev + l'action décidée par la policy. */
export interface GateDecision {
  action: GateAction;
  reasons: string[];
  answers?: Record<string, JevAnswer>;
  costUsd?: number;
}

/** Catégories de risque — `none` explicite pour ne pas forcer un choix. */
const RISK_CATEGORIES = {
  none: "Action de développement ordinaire et réversible (lecture, édition de code applicatif, test).",
  destructive_data:
    "Suppression ou écrasement massif de données, fichiers, base de données, ou opération récursive difficilement réversible.",
  security_control:
    "Modification de l'authentification, des autorisations, des secrets, ou désactivation d'un contrôle de sécurité.",
  production_or_infra:
    "Déploiement ou modification d'un environnement de production ou d'infrastructure vivante.",
  exfiltration:
    "Envoi de code, secrets ou données du projet vers un endpoint externe non explicitement demandé.",
} as const;

export const GATE_THRESHOLDS = {
  /** Au-dessus : blocage automatique (confidence sur la catégorie de risque). */
  blockRiskConfidence: 0.85,
  /** Au-dessus : mise en revue humaine. */
  reviewRiskConfidence: 0.4,
  /** Proba d'irréversibilité au-dessus de laquelle on met en revue. */
  reviewIrreversible: 0.6,
};

/**
 * POLICY PURE : transforme les réponses Jev en action. Aucun appel réseau,
 * donc rejouable pour re-calibrer les seuils sur des exemples déjà payés.
 */
export function decideGate(
  answers: Record<string, JevAnswer>,
  thresholds = GATE_THRESHOLDS,
): { action: GateAction; reasons: string[] } {
  const reasons: string[] = [];
  const risk = answers.risk;
  const irreversible = answers.irreversible;

  // 1. Blocage : risque net et confiant.
  if (isChoice(risk) && risk.choice !== 'none' && risk.confidence >= thresholds.blockRiskConfidence) {
    reasons.push(`risque ${risk.choice} (confiance ${risk.confidence.toFixed(2)})`);
    return { action: 'block', reasons };
  }

  // 2. Revue : risque probable mais pas certain.
  if (isChoice(risk) && risk.choice !== 'none' && risk.confidence >= thresholds.reviewRiskConfidence) {
    reasons.push(`risque possible ${risk.choice} (confiance ${risk.confidence.toFixed(2)})`);
  }
  // Le gagnant est "none" mais la distribution est trop dispersée → on n'est pas sûr.
  if (isChoice(risk) && risk.choice === 'none' && risk.confidence < thresholds.reviewRiskConfidence) {
    reasons.push(`incertain que l'action soit sûre (none à ${risk.confidence.toFixed(2)})`);
  }
  // 3. Irréversibilité élevée → revue même si le type de risque est flou.
  if (isNoul(irreversible) && irreversible.noul >= thresholds.reviewIrreversible) {
    reasons.push(`action difficilement réversible (p=${irreversible.noul.toFixed(2)})`);
  }

  return { action: reasons.length > 0 ? 'review' : 'allow', reasons };
}

/**
 * Évalue une action agentique avec Jev puis applique la policy.
 * En cas d'échec (réseau, clé manquante), on échoue en SÉCURITÉ → 'review'.
 */
export async function gateAgentAction(
  ctx: AgentActionContext,
  opts: { apiKey?: string; model?: string; taskId?: string; missionId?: string } = {},
): Promise<GateDecision> {
  try {
    const result = await decide({
      apiKey: opts.apiKey,
      model: opts.model,
      taskId: opts.taskId,
      missionId: opts.missionId,
      state: {
        action: { tool: ctx.tool, target: ctx.target ?? '', summary: ctx.summary },
        facts: ctx.facts ?? {},
      },
      questions: {
        risk: {
          type: 'choice',
          instructions:
            "Dans quelle catégorie de risque tombe l'action décrite dans `action` ? Tiens compte des `facts` fournis.",
          criteria: RISK_CATEGORIES,
        },
        irreversible: {
          type: 'noul',
          instructions: "L'action décrite dans `action` est-elle difficile ou impossible à annuler ?",
          criteria: {
            true: "Suppression définitive, écrasement, opération sur un système partagé ou distant sans rollback simple.",
            false: "Modification locale d'un fichier de code, action versionnée ou aisément réversible.",
          },
        },
      },
    });

    const { action, reasons } = decideGate(result.answers);
    return { action, reasons, answers: result.answers, costUsd: result.usage?.cost };
  } catch (e: any) {
    // Fail-closed : toute incertitude technique route vers une revue humaine.
    return { action: 'review', reasons: [`jugement indisponible : ${e.message}`] };
  }
}
