/**
 * Phase Prompts — Guidage contextuel par phase de la boucle agentique
 *
 * Le `BASE_SYSTEM_PROMPT` (roles.ts) décrit la boucle PLAN-ACT-OBSERVE-VERIFY-
 * COMPLETE, mais ce contrat restait STATIQUE : à chaque tour, l'agent recevait
 * le même méga-prompt, quelle que soit la phase réellement en cours côté
 * runtime (`AgentPhase` : discovery → plan → write → verify → recovery). Résultat
 * documenté par les audits : saturation précoce du contexte (~26k tokens/tour)
 * et dérive sur les missions longues, l'agent « oubliant » où il en est.
 *
 * Ce module fournit un bloc COMPACT (quelques lignes) ciblé sur la phase
 * courante, injecté par l'exécuteur agentique dans le prompt système de chaque
 * tour. Deux bénéfices directs sur l'autonomie :
 *   1. Recentrage : l'agent sait exactement ce qu'on attend de lui MAINTENANT
 *      (explorer ? écrire ? vérifier ? récupérer ?), ce qui réduit les tours
 *      stériles et les décisions contradictoires.
 *   2. Budget de contexte : un bloc court et phasé coûte bien moins qu'un rappel
 *      exhaustif de toutes les règles à chaque tour.
 *
 * Le texte reste volontairement bref et NON redondant avec le socle : il
 * rappelle l'INTENTION de la phase et la transition attendue, pas les règles
 * déjà portées par le prompt d'agent. Aucune dépendance runtime : fonction pure
 * `string → string`, triviale à tester et sans effet de bord.
 */

import type { AgentPhase } from "../runtime/agentic/types.js";

/**
 * Guidage par phase. Chaque entrée tient en 2–4 lignes : objectif de la phase,
 * ce qu'il faut faire, et la condition de transition vers la phase suivante.
 */
const PHASE_GUIDANCE: Record<AgentPhase, string[]> = {
  discovery: [
    "PHASE ACTUELLE — DÉCOUVERTE :",
    "- Objectif : rassembler le CONTEXTE MINIMAL nécessaire pour agir (lire les",
    "  fichiers concernés, repérer les points d'entrée). Pas d'écriture ici.",
    "- Ne sur-explore pas : dès que tu sais quoi modifier, PASSE À L'ÉCRITURE.",
  ],
  plan: [
    "PHASE ACTUELLE — PLAN :",
    "- Objectif : décomposer la tâche en étapes concrètes et ordonnées, chacune",
    "  reliée à un outil précis et à une vérification attendue.",
    "- Un plan court et exécutable vaut mieux qu'un plan exhaustif. Puis AGIS.",
  ],
  write: [
    "PHASE ACTUELLE — ACTION (ÉCRITURE) :",
    "- Objectif : appliquer la modification la plus CHIRURGICALE qui atteint le",
    "  but. Un write ciblé, pas une réécriture de fichier entier.",
    "- Après chaque écriture réussie, tu passeras en VÉRIFICATION : prépare-toi",
    "  à prouver que le changement est correct (verify_file / typecheck / tests).",
  ],
  verify: [
    "PHASE ACTUELLE — VÉRIFICATION :",
    "- Objectif : prouver INDÉPENDAMMENT que le travail est correct (verify_file,",
    "  verify_typecheck, run_tests). Ne te fie pas à ta propre certitude.",
    "- Si la vérification passe : termine par la réponse finale + statut structuré.",
    "- Si elle échoue : décris l'écart précis — tu passeras en RÉCUPÉRATION.",
  ],
  recovery: [
    "PHASE ACTUELLE — RÉCUPÉRATION :",
    "- Objectif : corriger la CAUSE de l'échec de vérification, pas le symptôme.",
    "- Ne répète pas à l'identique un patch déjà tenté : change d'approche.",
    "- Si le problème est externe/préexistant (dépendance manquante, build cassé",
    "  en amont), déclare-le honnêtement via le statut structuré `blocked`.",
  ],
};

/**
 * Construit le bloc de guidage pour la phase courante.
 *
 * @param phase - Phase courante de la boucle agentique. Si absente ou inconnue,
 *   retourne une chaîne vide (comportement strictement inchangé — le prompt
 *   d'agent statique reste seul maître).
 * @returns Un bloc markdown compact, ou "" si aucune phase exploitable.
 */
export function buildPhaseGuidance(phase?: AgentPhase | string): string {
  if (!phase) return "";
  const lines = PHASE_GUIDANCE[phase as AgentPhase];
  if (!lines || lines.length === 0) return "";
  return lines.join("\n");
}

/** Liste des phases outillées (utile aux tests et à l'introspection). */
export function listGuidedPhases(): AgentPhase[] {
  return Object.keys(PHASE_GUIDANCE) as AgentPhase[];
}
