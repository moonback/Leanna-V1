/**
 * Plugins runtime des 5 rôles spécialisés Web & Qualité.
 *
 * Historiquement, les rôles de délégation `accessibility`, `documentation`,
 * `performance`, `seo` et `ui_ux` (Section 4 de `roles.ts`) n'existaient que
 * comme définitions de délégation : exécutables via l'orchestrateur mais pas
 * via `AgentRuntime.submit()`. D'où le warning du module `reconcileCounts` :
 * « 5 rôle(s) de délégation SANS plugin runtime ».
 *
 * Comme `engineering.agents.ts`, ces plugins comblent l'écart SANS dupliquer la
 * logique : leur `execute` délègue à la MÊME boucle agentique plan→act→verify
 * que l'orchestrateur, via le pont `runViaAgentic`. Ces agents analysent et
 * modifient du code (audit WCAG, SEO technique, profiling perf, doc d'API,
 * revue UI/UX) ; ils ont donc besoin de la vraie boucle d'exécution, et non de
 * l'exécuteur LLM one-shot réservé aux rôles de rédaction.
 *
 * Les métadonnées (nom, description, capabilities, concurrence, timeout) sont
 * dérivées de la définition de délégation canonique (`roles.ts`), de sorte
 * qu'il n'existe qu'une seule source de vérité pour « ce qu'est un seo ».
 */

import type { AgentPlugin } from "../AgentRuntime.js";
import type { AgentMetadata } from "../types.js";
import { getAgentDefinition } from "../../agents/roles.js";
import { runViaAgentic } from "./agenticBridge.js";

/** Rôles spécialisés Web & Qualité à exposer comme plugins runtime. */
const SPECIALIZED_ROLES = [
  "ui_ux",
  "seo",
  "documentation",
  "accessibility",
  "performance",
] as const;

/**
 * Construit un `AgentPlugin` pour un rôle spécialisé à partir de sa définition
 * de délégation canonique. L'exécution est déléguée à la boucle agentique
 * partagée (plan→act→verify), identique à celle des rôles d'ingénierie.
 */
function buildSpecializedPlugin(role: string): AgentPlugin {
  const def = getAgentDefinition(role);
  if (!def) {
    // Ne devrait jamais arriver : SPECIALIZED_ROLES ⊆ STATIC_AGENT_REGISTRY.
    throw new Error(`[specialized.agents] Rôle spécialisé inconnu: "${role}"`);
  }

  const metadata: AgentMetadata = {
    id: def.role,
    name: def.name,
    description: def.description,
    capabilities: [...def.capabilities],
    maxConcurrency: def.maxConcurrency,
    timeoutMs: def.defaultTimeoutMs,
  };

  return {
    metadata,
    execute: (context) => runViaAgentic(def.role, context),
  };
}

/** Les 5 plugins spécialisés, prêts à être enregistrés dans AgentRuntime. */
export const specializedAgents: AgentPlugin[] = SPECIALIZED_ROLES.map(buildSpecializedPlugin);
