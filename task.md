# Prompt system ou skills ? La vraie réponse est : **les deux, mais pas en premier**

En lisant l'architecture (notamment `docs/AUTONOMY_AUDIT.md`, `docs/LEANNA_EXECUTION_REALITY_AUDIT.md`, `docs/TOOL_OWNERSHIP_MATRIX.md` et `ROADMAP.md`), les audits internes **démentent l'hypothèse implicite** que l'autonomie se joue au niveau des prompts ou des skills. Voici ce que les docs disent réellement.

---

## 1. Ce que les audits désignent comme le vrai frein

| Frein réel | Preuve dans les docs | Impact autonomie |
|---|---|---|
| **Attribution outil→agent non déterministe** | `tools audit` : `resolveToolAttribution()` retourne `source: 'unattributed'` pour ~165 outils → rôles `system` | Le runtime ne sait pas *à qui* attribuer une action, l'UI ment, l'agent peut appeler un outil non autorisé |
| **Outils fantômes** | `roleCapabilities.test.ts` a été créé *spécifiquement* pour détecter les capabilities déclarées mais absentes de `EXECUTABLE_AGENT_TOOLS` (ex : `knowledge_graph_query`, `automation_*` de `vision`) | Un agent déclare pouvoir faire X, l'exécuteur refuse → boucle de retry stérile |
| **Saturation de contexte (~26k tokens/tour)** | `AUTONOMY_AUDIT.md` §3, `TokenOptimizer` élague les catalogues d'outils mais pas l'historique | Missions > 15 étapes → dérive, hallucinations, décisions contradictoires |
| **Fenêtre de démarrage `missionExecutor=null`** | `LEANNA_EXECUTION_REALITY_AUDIT.md` §R-4 | Les premiers événements autonomes escaladent à vide |
| **`planner` a `delete_project_file` dans ses capabilities** | `ROADMAP.md` dette technique P1 — contradiction documentée | Un agent censé être "lecture seule" peut supprimer |
| **Contrat de sortie parsé par heuristique textuelle** (`ResultParser.detectFailure`) | `ROADMAP.md` bug identifié | L'agent dit "Vérification : FAIL" → détecté ; s'il dit "je n'ai pas pu", raté |

**Aucun de ces points n'est un problème de rédaction de prompt ni de richesse de skill.** Ce sont des problèmes d'**architecture d'exécution**.

---

## 2. Ce qu'améliorer les prompts apporterait (réellement)

Les prompts actuels (`roles.ts`, `promptSections.ts`) sont **déjà très riches** — missions, processus, règles, interdictions, critères. Le vrai problème est leur **coût** et leur **redondance** :

- `BASE_SYSTEM_PROMPT` + 20 sections spécifiques par agent → duplication massive
- `promptSections.ts` existe déjà mais n'est pas généralisé (commentaire explicite : *"Gain attendu : ~30-40% de réduction"*)
- 26k tokens/tour → surcoût financier et latence, mais surtout **saturation précoce de la fenêtre**

**Gain réel d'une refonte de prompt :**
- ✅ Réduction de tokens (économie de coût, plus de marge avant saturation)
- ✅ Moins de contradictions entre règles génériques et règles spécifiques
- ⚠️ **Pas d'amélioration directe de l'autonomie** (l'agent ne devient pas plus capable)
- ⚠️ Risque : si on allège trop, on perd les garde-fous (interdictions, critères de vérification)

**Recommandation prompt :** généraliser `promptSections.ts` (factoriser `COMMON_CODE_RULES`, `READONLY_RULES`, etc.) **ET** introduire des prompts **contextuels par phase** (plan / act / verify / recover) au lieu d'un méga-prompt statique. C'est ce que suggère la structure `PLAN-ACT-OBSERVE-VERIFY` déjà mentionnée dans `BASE_SYSTEM_PROMPT` mais jamais implémentée côté prompt.

---

## 3. Ce qu'améliorer les skills apporterait (réellement)

Les skills sont **nombreux** (`server/skills/` : automation, browser, codebase, github, knowledge, memory, mission, verify, securityAudit, reasoning, system…). Le problème n'est pas la quantité, c'est :

- **La cohérence déclaré vs exécutable** : `roleCapabilities.test.ts` est un pansement. Il faudrait que `ToolRegistry.register()` **valide** que toute capability déclarée sur un rôle correspond à un outil réellement enregistré.
- **La fiabilité** : `StrategyMemory` enregistre déjà les taux de succès par outil → `SkillScorer` les consomme. Bonne base.
- **La granularité** : `run_project_command` n'accepte que `npm`/`npx`/`node` (très restrictif) → sur-restriction qui force les agents à contourner via d'autres outils.

**Gain réel d'un travail sur les skills :**
- ✅ Attribuer explicitement chaque outil à un agent (via `attribution` dans `ToolDefinition`) → supprime la cascade heuristique
- ✅ Rendre `ToolRegistry.register()` fail-fast sur capabilities orphelines
- ✅ Ajouter des skills de **méta-vérification** (`verify_contract`, `verify_no_regression`) au lieu de multiplier les skills métier
- ⚠️ **Pas de gain d'autonomie** si l'attribution reste non déterministe

**Recommandation skill :** généraliser `applyRuntimeAgentAuthorization` (déjà présent dans `toolAgentMapper.ts`) pour **estampiller** chaque `ToolDefinition` sensible. C'est le chantier identifié dans `ROADMAP.md` sous « chaîne déterministe ».

---

## 4. Ma réponse en une phrase

> **Améliorer les prompts seuls** → gain de coût et de robustesse de contexte, **mais pas d'autonomie**.
> **Améliorer les skills seuls** → gain de fiabilité, **mais pas d'autonomie**.
> **Les deux, sans toucher à la chaîne d'exécution** → risque de complexifier sans résoudre le vrai blocage : l'attribution outil→agent→permission reste heuristique sur ~78 % des outils.

---

## 5. Ordre de priorité recommandé (basé sur les audits)

| Priorité | Action | Fichier(s) | Effort |
|---|---|---|---|
| **P0** | Estampiller `attribution` sur toutes les `ToolDefinition` sensibles (généraliser `SENSITIVE_TOOL_ATTRIBUTION`) | `server/agents/toolAgentMapper.ts`, `server/runtime/ToolRegistry.ts` | M |
| **P0** | Rendre `ToolRegistry.register()` fail-fast si capability déclarée mais outil absent | `server/runtime/ToolRegistry.ts` | S |
| **P0** | Migrer `ResultParser.detectFailure` vers un champ `status` structuré (`AgentResult.outcome` déjà existant) | `server/agents/ResultParser.ts`, `promptSections.ts` | M |
| **P1** | Généraliser `promptSections.ts` + prompts par phase (plan/act/verify/recover) | `server/agents/roles.ts`, `promptSections.ts` | L |
| **P1** | Résoudre la fenêtre `missionExecutor=null` (file d'attente au boot au lieu d'escalade) | `server.ts` (~L398), `LeannaCore.ts` | S |
| **P1** | Retirer `delete_project_file` des capabilities de `planner` | `server/agents/roles.ts` | S |
| **P2** | Compression de contexte à L0-L7 (déjà listé PARTIAL dans `AUTONOMY_AUDIT.md`) | `TokenOptimizer`, `PromptBuilder` | L |
| **P2** | Ajouter des skills de méta-vérification (contrat, non-régression) | `server/skills/verify.ts` | M |

---

## 6. Le piège à éviter

Ne **pas** ajouter :
- Plus de skills métier (les 210+ outils sont déjà trop : ~165 non attribués)
- Plus de règles dans les prompts (le `BASE_SYSTEM_PROMPT` fait déjà 40+ lignes de principes contradictoires à trancher)
- Des "agents autonomes" supplémentaires (la flotte a déjà 15 rôles, dont ~5 réellement exercés)

**La dette est dans la chaîne outil→capability→agent→permission→executor, pas dans la rédaction.** Les docs le disent eux-mêmes : `ATTRIBUTION_ENFORCEMENT=strict` est un flag, mais aucune stratégie n'est déployée pour atteindre l'objectif.

Si tu veux que Leanna soit plus autonome, commence par **exécuter `enforceAttribution(runtime, "strict")` en dev** — tu verras immédiatement combien d'outils sont réellement attribués. Le chiffre te dira où travailler.