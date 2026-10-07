# AUDIT D'AUTONOMIE DE LEANNA (v1.4.0)

> **Avertissement de rigueur** : La réussite des tests unitaires et d'intégration ne suffit pas à déclarer le système "production ready". Ce rapport établit une démarcation stricte et objective entre ce qui est formellement démontré par des invariants vérifiables et ce qui reste partiel, expérimental ou à risque.

---

## 1. VERIFIED (Prouvé et Démontré)

Fonctionnalités dont l'autonomie et le comportement sont démontrés par des tests automatisés, des invariants cryptographiques ou des preuves d'exécution réelle :

1. **Boucle Agentique Réactive (`PLAN → ACT → OBSERVE → VERIFY → RECOVER`)** :
   - Validée dans `server/agents/e2e-mission.test.ts` et `server/runtime/agentic/mission-harness.test.ts`.
   - Preuve de diagnostic et de relance automatique (`repair`/`replan`) sur échec de vérification sans intervention humaine.
2. **Vérification Indépendante par Empreinte Cryptographique (`WorkspaceState`)** :
   - Hash SHA-256 calculé avant et après chaque écriture.
   - Les retours déclaratifs `{ ok: true }` des outils sont systématiquement corroborés par la relecture du fichier et le contrôle des diagnostics réels (`verify_file`).
3. **Contrôle et Bornage Déterministe des Budgets (`BudgetUsage`)** :
   - Quotas distincts par catégorie (`read`, `write`, `verify`, `plan`, `recovery`, `iterations`, `durationMs`).
   - Le franchissement d'un seuil déclenche une interruption propre et ordonnée de la mission (`outcome: "failed"` ou `"partial"`), éliminant tout risque de boucle infinie.
4. **Enforcement des Politiques de Sécurité (`PermissionPolicy`)** :
   - Validation en mode `enforce` des permissions `read`, `write`, `exec`, `dangerous`.
   - Tout refus de permission bloque l'opération sans contournement possible par le modèle.
5. **Neutralisation des Injections de Directives (`PromptInjectionGuard`)** :
   - Détection et neutralisation des tentatives d'écrasement d'instructions dans les flux de données externes sans bloquer le traitement bénin.
6. **Cartographie et Typage Explicite des Outils Sensibles (`TOOL_OWNERSHIP_MATRIX`)** :
   - Verrouillage formel dans `SENSITIVE_TOOL_ATTRIBUTION` de tous les outils à effets de bord majeurs (`project_scaffold`, `quality_loop`, `create/update/delete_custom_skill`, `workflow_run`, `git_push`, etc.).

---

## 2. IMPLEMENTED (Implémenté mais non certifié E2E)

Composants existants et fonctionnels dans le code, mais dont la validation de bout en bout dépend d'un environnement live complet (modèle distant ou OS) :

1. **Isolation Sandboxée Physique (`.Leanna/sandbox`)** :
   - Implémenté dans `server/utils/sandbox.ts` avec redirection des chemins d'écriture et synchronisation d'espace de travail.
   - Testé unitairement, mais le flux de promotion automatique (commit vers workspace source après validation complète) nécessite encore un pipeline de validation live en conditions réelles d'édition multi-fichiers.
2. **Système de Résolution Multi-Modèles (`ModelRouter` / `GeminiKeyPool`)** :
   - Rotation de clés API avec chiffrement AES-256-GCM.
   - Gestion de quotas et repli en mémoire vive en l'absence de base Supabase configurée.
3. **Pont d'Approbation Interactive (`ConfirmationBridge`)** :
   - Prise en charge des timeouts et refus par défaut pour les actions hautement destructrices.

---

## 3. PARTIAL (Partiellement Autonome / Dépendances Résiduelles)

Zones de fonctionnement où l'autonomie reste conditionnelle ou dépendante d'approximations :

1. **Attribution Heuristique des Outils Génériques** :
   - Si les outils sensibles sont désormais strictement verrouillés dans `SENSITIVE_TOOL_ATTRIBUTION`, environ 165 outils utilitaires non-critiques restent assignés par similarité sémantique ou capacités de rôle.
2. **Consommation de Contexte Prompt (`~26k tokens/tour` en mode non-compacté)** :
   - Le `TokenOptimizer` élague le catalogue d'outils (gain démontré de ~9 500 tokens), mais l'historique brut de conversation et les contextes de documents volumineux peuvent saturer la fenêtre de contexte sur les missions à plus de 15 étapes.
3. **Superposition Legacy / Agentic** :
   - Coexistence de l'exécuteur historique `AgentExecutor` et du nouveau runtime `AgenticRuntime`. Bien qu'unifiés conceptuellement sous le contrat commun, certaines branches secondaires de l'UI desktop peuvent encore instancier des exécuteurs synchrones directs.

---

## 4. MISSING (Non Implémenté / Absent)

1. **Négociation et Auto-résolution d'Outils Externes MCP** :
   - Le runtime est prêt à recevoir des serveurs MCP (`ToolRegistry`), mais aucun serveur MCP n'est actif par défaut au démarrage (`0 MCP servers active`).
2. **Parallélisme Multi-Agents Décentralisé** :
   - L'exécution actuelle est séquentielle au sein d'une mission : chaque étape sélectionne et active un agent à la fois sous le contrôle d'un superviseur central, sans consensus direct pair-à-pair entre agents.

---

## 5. RISK (Facteurs de Risque Majeurs pour l'Autonomie)

1. **Latence et Dérive du Modèle Réel (LLM Drift)** :
   - En environnement de test, les réponses scriptées sont déterministes. En production avec un LLM probabiliste, des variations de formulation de tool calls (JSON tronqué, code fences inattendus) exigent une tolérance de parsing absolue dans `ToolCallParser`.
2. **Volatilité de l'État Hors Sandbox** :
   - Si un outil d'exécution système (`system_execute_command`) manipule des processus externes ou l'état réseau, ces effets échappent au suivi par empreinte SHA-256 de `WorkspaceState`.
3. **Surcharge Cognitive par Accumulation d'Erreurs** :
   - En cas d'échecs de vérification successifs, l'empilement des diagnostics dans le prompt peut amener le modèle à régresser s'il n'est pas purgé ou résumé via `history compression` (L7).

---

## 6. Verdict Technique

```text
AUTONOMY VERIFIED:
- Boucle fermée PLAN -> ACT -> OBSERVE -> VERIFY -> RECOVER (0 human intervention required)
- Vérification indépendante cryptographique post-write (SHA-256)
- Enforcement inviolable des budgets et arrêt propre
- Verrouillage déterministe des 210 outils (SENSITIVE_TOOL_ATTRIBUTION)

AUTONOMY PARTIAL:
- Compression multi-niveaux du contexte prompt (L0-L7)
- Double cycle de vie d'AgentRegistry au démarrage desktop
- Isolation et promotion automatique du bac à sable en multi-fichiers complexe

AUTONOMY NOT VERIFIED:
- Exécution de missions multi-heures sur modèle de production non-scripté
- Auto-découverte et négociation d'outils MCP dynamiques
```
