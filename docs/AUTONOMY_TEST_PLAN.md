# PLAN DE TEST DE L'AUTONOMIE — Leanna v1.4.0

Ce document spécifie le plan de test exhaustif de la boucle agentique et de l'autonomie réelle de Leanna, conformément aux exigences de certification de production.

---

## 1. Objectifs de Test

L'objectif est d'apporter la **preuve formelle et observable** que Leanna exécute une boucle autonome fermée :
$$\text{PLAN} \longrightarrow \text{ACT} \longrightarrow \text{OBSERVE} \longrightarrow \text{VERIFY} \longrightarrow \text{RECOVER} \longrightarrow \text{COMPLETE}$$

Critères d'acceptation stricts :
1. **Zéro simulation aveugle** : Un outil retournant `{ ok: true }` ne constitue pas une validation de l'étape. Seul le contrôle d'état (hash SHA-256, diagnostics compiler, tests) fait foi.
2. **Bornage strict** : Tout débordement de budget (itérations, lectures, écritures, temps) déclenche un arrêt déterministe (`blocked`/`failed`), jamais de boucle infinie.
3. **Récupération sans intervention** : Sur incident ou régression détectée par la vérification, le système diagnostique, élabore une stratégie de réparation (`repair`/`replan`), et réapplique une solution.
4. **Enforcement des sécurités** : Aucune permission refusée ne peut être contournée ; les écritures sont confinées au sandbox ; les injections de prompts sont neutralisées.

---

## 2. Niveaux de Test et Couverture

| Niveau | Cible / Fichiers | Objectif | Type d'oracle |
|--------|------------------|----------|---------------|
| **Unitaire** | `server/agents/ToolCallParser.test.ts`<br>`server/utils/safeguards.test.ts`<br>`server/runtime/PermissionPolicy.test.ts` | Parsing robuste des tool calls, application des politiques de sécurité, détection d'injection. | Entrées/sorties pures, regex, structures JSON. |
| **Sous-système** | `server/runtime/agentic/WorkspaceState.test.ts`<br>`server/runtime/agentic/ToolPromptBuilder.test.ts` | Intégrité transactionnelle de l'état workspace (hash SHA-256), calcul de budgets et compaction de prompts. | Invariants d'état, empreintes cryptographiques. |
| **Harness Loop** | `server/runtime/agentic/mission-harness.test.ts` | Boucle agentique fermée (fake deterministic LLM) sur FS virtuel. | Transitions d'état de session, compteurs d'usage. |
| **Intégration REST** | `server/routes/*.test.ts` (22 fichiers) | Validation end-to-end des endpoints HTTP Express, rate limits et auth. | Codes HTTP, schémas de payload JSON (118 tests). |
| **Système Global** | `npm run typecheck`<br>`npm test` | Non-régression totale sur l'ensemble de la suite (855 tests / 131 suites). | Code de sortie 0, 0 erreur TypeScript, 0 échec. |

---

## 3. Scénarios E2E Autonomes Clés

### Scénario A : Détection → Plan → Patch → Vérification (1 Cycle)
- **Précondition** : `src/broken.ts` contient une erreur de typage TypeScript (`const x: string = 42`).
- **Déroulement** :
  1. L'agent `coder` reçoit l'objectif.
  2. Planification initiale : décomposition en étape de lecture et étape de modification/vérification.
  3. Action : `read_project_file`, puis `modify_project_file` avec `const x: string = '42'`.
  4. Vérification indépendante : invocation automatique de `verify_file` post-écriture.
  5. Hash avant/après validé dans `WorkspaceState`.
- **Postcondition** : Fichier conforme sur disque virtuel, rapport `status: "success"`, 0 retries.

### Scénario B : Récupération Autonome (Auto-Repair Loop)
- **Précondition** : Fichier source erroné.
- **Déroulement** :
  1. Première tentative de correction par l'agent avec un code erroné (`const x: string = 43`).
  2. Vérification post-écriture : échec détecté (`Type 'number' is not assignable to type 'string'`).
  3. L'étape bascule en `failed`. Le moteur de récupération diagnostique la cause (`recover({ phase: "verify", ... })`).
  4. Stratégie `retry`/`replan` enclenchée. Consigne corrective injectée dans le contexte du modèle.
  5. Seconde tentative : écriture du correctif valide.
  6. Seconde vérification : succès.
- **Postcondition** : `writes.length >= 2`, `recoveries.length >= 1`, fichier final valide.

### Scénario C : Respect des Budgets et Arrêt Déterministe
- **Précondition** : Tâche infaisable ou boucle d'erreurs avec budget strict (`maxIterations: 3, maxWrite: 1`).
- **Déroulement** :
  1. L'agent effectue une écriture qui ne résout pas le problème.
  2. Le quota d'écriture ou d'itérations est atteint.
  3. Le gate `admitCall` bloque tout appel excédentaire.
  4. Le runtime interrompt la boucle proprement sans bloquer le thread.
- **Postcondition** : Durée bornée (< 10s), résultat déterministe (`outcome: "failed"` ou `"partial"`), absence de fuite mémoire.

### Scénario D : Découplage Outil / Vérification Réelle
- **Précondition** : L'outil d'écriture retourne `{ ok: true, status: "success" }` mais le contenu ne résout pas l'anomalie.
- **Déroulement** :
  1. Le runtime ne se fie pas au statut d'exécution de l'outil.
  2. `WorkspaceState` relit le fichier et calcule son hash SHA-256.
  3. `verify_file` analyse les diagnostics réels et invalide l'opération.
  4. La boucle continue jusqu'à ce que l'invariant réel soit satisfait.
- **Postcondition** : Succès proclamé uniquement après validation indépendante par hash et compilateur.

---

## 4. Matrice de Commandes de Test

| Commande | Fréquence | Périmètre |
|----------|-----------|-----------|
| `npx tsx --test server/agents/e2e-mission.test.ts` | À chaque modification de l'orchestration | Validation E2E autonome (4 scénarios). |
| `npx tsx --test server/runtime/agentic/mission-harness.test.ts` | À chaque modification du runtime agentique | Validation de la boucle de réparation et du budget. |
| `npm run typecheck` | Pré-commit | Vérification de la cohérence de types TypeScript. |
| `npm test` | Intégration continue | Exécution de la suite complète (852 tests). |
| `graphify update .` | Post-modification de code | Mise à jour du graphe de connaissances AST. |
