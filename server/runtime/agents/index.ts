/**
 * Agent Plugins — Assemblage du registre runtime
 *
 * Les 15 plugins runtime dérivent TOUS leurs métadonnées de la source de vérité
 * unique `server/agents/roles.ts` :
 *   • 7 rôles de rédaction  → `writing.agents.ts`     (exécuteur LLM one-shot)
 *   • 8 rôles d'ingénierie  → `engineering.agents.ts` (boucle plan→act→verify)
 *
 * Il n'existe donc plus de métadonnées codées en dur qui pourraient dériver de
 * `roles.ts` : « agents runtime » et « agents de délégation » sont alignés
 * (15 = 15) et le warning `delegationOnlyRoles` reste structurellement vide.
 *
 * Ce registre est utilisé par `AgentRuntime.submit()` et les workflows runtime,
 * pas par l'outil conversationnel `agent_delegate` (qui lit directement
 * `roles.ts` via l'orchestrateur).
 *
 * Pour ajouter un rôle : l'ajouter dans `roles.ts` (source de vérité), puis
 * dans `WRITING_ROLES` ou `ENGINEERING_ROLES` selon sa sémantique d'exécution.
 */

export { defineAgent } from "./plugin.js";
export type { AgentConfig } from "./plugin.js";

export { writingAgents } from "./writing.agents.js";
export { engineeringAgents } from "./engineering.agents.js";
export {
  setAgenticRuntimeProvider,
  hasAgenticRuntimeProvider,
} from "./agenticBridge.js";

import type { AgentPlugin } from "../AgentRuntime.js";
import { writingAgents } from "./writing.agents.js";
import { engineeringAgents } from "./engineering.agents.js";

/**
 * Tous les agents par défaut = 7 rédaction + 8 ingénierie = 15.
 *
 * Métadonnées dérivées de `roles.ts` pour les 15. Les 8 rôles d'ingénierie
 * délèguent leur exécution à la boucle agentique partagée (plan→act→verify) via
 * `runViaAgentic`, branché au bootstrap par `setAgenticRuntimeProvider` ; les 7
 * rôles de rédaction utilisent l'exécuteur LLM one-shot de `defineAgent`.
 */
export const defaultAgents: AgentPlugin[] = [
  ...writingAgents,
  ...engineeringAgents,
];
