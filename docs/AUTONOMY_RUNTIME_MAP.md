# CARTOGRAPHIE DÉTAILLÉE DU RUNTIME AUTONOME DE LEANNA (v1.4.0)

Ce document cartographie l'architecture d'exécution réelle de Leanna, de la réception d'une intention ou mission jusqu'à sa vérification finale, persistance et audit.

---

## 1. VUE D'ENSEMBLE DU FLUX D'EXÉCUTION CIBLE ET RÉEL

```text
                 USER GOAL / AUTONOMOUS TRIGGER
                                │
                                ▼
                     MISSION / TASK ENTRY POINT
       (server.ts / LiveSocketHandler / LeannaCore / AgentOrchestrator)
                                │
                                ▼
                         LEANNA SUPERVISOR
           (ExecutionLedger + CheckpointManager + StateStore)
                                │
                                ▼
                       PLANNING & GOAL STACK
             (server/mission/Planner.ts | Agentic Planner)
                                │
                                ▼
                         AGENT SELECTION
             (Deterministic capability matching in roles.ts)
                                │
                                ▼
                          TOOL ROUTING
         (ToolRegistry manifest + resolveAgentTools filter)
                                │
                                ▼
                    PERMISSION & SAFETY GATES
       (PermissionPolicy [enforce] + JevSafetyGate + LedgerGuard)
                                │
                                ▼
                       SANDBOX ENFORCEMENT
              (assertSandboxReady -> .Leanna/sandbox/)
                                │
                                ▼
                         TOOL EXECUTION
             (SkillManagerV2 / ToolRegistry.call)
                                │
                                ▼
                           OBSERVATION
          (Result extraction + PromptInjectionGuard scan)
                                │
                                ▼
                      INDEPENDENT VERIFICATION
           (EvidenceEngine + WorkspaceState SHA-256 + tsc/test)
                              ╱   ╲
                       PASSED      FAILED
                         │            │
                         ▼            ▼
                   NEXT STEP      DIAGNOSIS & REPAIR
                                      │
                                  RECOVERABLE?
                                   ╱       ╲
                                 YES        NO (Blocked)
                                  │          │
                                  ▼          ▼
                             RE-PLAN     ESCALATE
                                  │
                                  ▼
                            RETRY ACTION
                                  │
                                  ▼
                         FINAL VERIFICATION
                                  │
                                  ▼
                          MISSION COMPLETED
```

---

## 2. DÉTAIL DES ÉTAPES DU RUNTIME

### A. Point d'entrée d'une mission

Une mission peut démarrer via 4 chemins :
1. **Chat / Live API WebSocket (`server/live/LiveSocketHandler.ts`)** :
   - L'utilisateur formule une requête nécessitant une mission ou un agent.
   - Les tools d'orchestration (`mission_start`, `agent_orchestrate`, `agent_delegate`) sont déclenchés.
2. **Cœur Autonome (`server/autonomy/LeannaCore.ts` -> `AutonomousExecutive.ts`)** :
   - Déclenchement périodique d'objectifs autonomes (veille, audit, auto-maintenance).
   - Validation via `TaskManager` (dédoublonnage, circuit breaker).
3. **Orchestrateur Agentique (`server/agents/AgentOrchestrator.ts`)** :
   - Méthodes `delegateTask()` et `orchestrate()`.
   - Dispatché vers `AgentRuntimeExecutor` (`AgentTaskRunner`).
4. **Noyau Supervisé P0 (`server/core/kernel.ts`)** :
   - `runSupervisedAgenticMission()` piloté par `LeannaSupervisor`.

---

### B. Création du plan

1. **Décomposition d'objectif (`server/mission/Planner.ts`)** :
   - Transforme l'objectif en `GoalStack` (sous-objectifs avec `dependsOn`, critères de succès explicites).
   - Utilise `SkillScorer` pour prioriser les outils pertinents selon leur historique de fiabilité (`StrategyMemory`).
2. **Planification Agentique locale (`server/runtime/agentic/AgentRuntime.ts`)** :
   - L'agent analyse son intention, formule des critères mesurables, et produit une séquence d'étapes `PlanStep` :
     ```json
     {
       "intent": "...",
       "successCriteria": ["fichier modifié", "typecheck passe"],
       "steps": [
         { "description": "Localiser l'erreur", "suggestedTools": ["search_in_files"], "verification": "fichier identifié" },
         { "description": "Corriger le typage", "suggestedTools": ["modify_project_file"], "verification": "code valide" },
         { "description": "Vérifier le build", "suggestedTools": ["verify_typecheck"], "verification": "aucun diagnostic" }
       ]
     }
     ```

---

### C. Sélection de l'agent

- 15 rôles spécialisés définis dans `server/agents/roles.ts` :
  `coder`, `refactor`, `debugger`, `reviewer`, `tester`, `security`, `architect`, `vision`, `writer`, `formatter`, `researcher`, `proofreader`, `translator`, `summarizer`, `planner`.
- Filtrage déterministe :
  1. La tâche requiert des compétences spécifiques (ex. `typecheck`, `repair` -> `debugger` / `coder`).
  2. Filtrage des agents éligibles via `roles.ts` (`capabilities`, `maxConcurrency`, politique de délégation).
  3. L'agent sélectionné est instancié ou alloué avec sa boucle autonome (`AutonomousLoop`) et son runner (`AgentRuntimeExecutor`).

---

### D. Sélection de l'outil

- Les outils sont hébergés dans le `ToolRegistry` (`runtime.tools`).
- Chaque rôle d'agent n'a accès qu'aux outils résolus par `resolveAgentTools(agent.capabilities, registry)`.
- Élimination des attributions hasardeuses :
  - **Priorité 1** : Attribution explicite définie dans le manifeste `ToolRegistry` / `SENSITIVE_TOOL_ATTRIBUTION`.
  - **Priorité 2** : Capability déclarée sur le rôle dans `roles.ts`.
  - **Priorité 3** : Catégorie sémantique bornée (découverte / suggestion).

---

### E. Exécution et Gardes de Sécurité

Chaque exécution d'outil traverse séquentiellement :
1. **PermissionPolicy (`server/runtime/PermissionPolicy.ts`)** :
   - Mode `enforce` vérifiant les permissions accordées (`read`, `write`, `exec`, `network`, `dangerous`).
   - Vérification de l'agent appelant (`isAgentAllowedForTool`).
2. **JevSafetyGate (`server/core/JevSafetyGate.ts`)** :
   - Évalue le risque des actions à effet de bord avant toute écriture ou commande destructive.
   - Refuse ou exige confirmation si le risque est critique.
3. **LedgerGuard (`server/core/LedgerGuard.ts` & `ExecutionLedger.ts`)** :
   - Empêche le rejeu accidentel d'actions à effet de bord (Idempotence P0).
4. **Sandbox Enforcement (`server/utils/sandbox.ts` & `codebaseHelpers.ts`)** :
   - Tout chemin d'écriture est converti via `assertSandboxReady()` / `resolveSandboxWriteTarget()`.
   - Les écritures sont confinées dans `.Leanna/sandbox/`. Le code source racine n'est jamais écrasé à chaud sans validation.
5. **ToolRegistry.call()** :
   - Exécution bornée par timeout et signal d'annulation `AbortSignal`.

---

### F. Observation

1. **Extraction structurée** du résultat brut de l'outil (stdout, stderr, diff, JSON).
2. **Inspection de Sécurité (`server/utils/promptInjectionGuard.ts`)** :
   - Tout contenu externe (fichiers distants, sorties shell, web, documents) est scanné pour neutraliser les tentatives de prompt injection ("ignore instructions", "reveal secrets").
3. **Capture d'état de l'espace de travail (`WorkspaceState.ts`)** :
   - Calcul des empreintes SHA-256 des fichiers inspectés et modifiés.
   - Enregistrement dans la session d'exécution (`RunSession.observations`).

---

### G. Vérification Indépendante

- **Règle absolue** : `result.success === true` ne suffit PAS pour valider une étape.
- Postconditions obligatoires selon la nature de l'étape :
  - **Modification de code** :
    1. Présence physique du fichier dans le sandbox (`fs.existsSync`).
    2. Correspondance du contenu avec le patch appliqué.
    3. Diagnostic `verify_typecheck` (aucun diagnostic d'erreur TypeScript).
    4. Exécution de tests de non-régression (`run_tests` ou tests ciblés).
  - **Preuve (`EvidenceEngine.ts`)** :
    - Évaluation cryptographique ou sémantique formelle avant transition d'état.

---

### H. Diagnostic, Récupération et Replanification

En cas d'échec de vérification ou d'exécution :
1. **Classification de l'erreur** :
   - Erreur de chemin / fichier manquant -> correction de chemin via inspection workspace.
   - Erreur de typage TypeScript -> extraction des diagnostics exacts (fichier, ligne, code TSxxxx).
   - Outil non disponible / permission refusée -> arrêt propre ou choix d'un outil alternatif autorisé.
2. **Garde anti-boucle (`AgentRepairLoop.ts` & `Executor.loopGuards`)** :
   - Suivi des empreintes d'erreurs et des patches proposés.
   - Interdiction de répéter le même patch ou la même lecture en boucle.
3. **Replanification (`Planner.replan` ou `AgentRuntime.replan`)** :
   - Mise à jour du plan vivant avec les leçons apprises (`failures`, `hypotheses`).
   - Reprise déterministe à partir de la nouvelle étape planifiée.
4. **Escalade** :
   - Si les approches sont épuisées ou si une permission critique est refusée, la mission est marquée `blocked` pour arbitrage sans boucle infinie.

---

### I. Finalisation et Persistance

1. **Revue de complétion globale** :
   - Tous les sous-objectifs et critères de succès de la racine sont vérifiés.
2. **Commit / Promotion du Sandbox** :
   - Si le sandbox est validé (tsc + tests OK) et autorisé, promotion vers le projet principal.
3. **Journalisation durable (`DurableMissionStore.ts` & OpenTelemetry)** :
   - Enregistrement de l'état final, tokens consommés, durée, actions exécutées, traces OTel.
4. **Apprentissage inter-missions (`StrategyMemory`)** :
   - Mise à jour des scores de fiabilité des outils utilisés.
