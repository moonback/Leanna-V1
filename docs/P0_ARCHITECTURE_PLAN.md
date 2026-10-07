# Leanna P0 — Plan d'industrialisation du noyau

> Traduction de l'audit (`src/components/notebooks/audit.md`) en architecture cible + plan d'implémentation P0, fichier par fichier, ancré dans le code réel du dépôt.

Ce document ne propose **aucune nouvelle fonctionnalité produit**. Il durcit le noyau : durabilité, idempotence, checkpoints/rollback, preuve d'exécution et une autorité de mission unique — exactement les points marqués 🟠/🔴 dans l'audit (§1, §7, §15, §16, §19, §21).

---

## 0. Contraintes de conception (issues de l'audit réel)

L'audit rappelle (§24, §27) : **ne pas supprimer brutalement les moteurs existants, migrer progressivement.** Le plan P0 est donc **additif et non cassant** :

- On **ne modifie pas** `GoalStatus` ni `MissionState` existants (`server/mission/types.ts`).
- On **réutilise** le hachage SHA-256 déjà présent (`WorkspaceState.hash`) — pas de hasheur parallèle.
- On **branche** l'idempotence sur le seul point de passage réel des outils : `ToolRegistry.call` (`server/runtime/ToolRegistry.ts`), via un hook injecté optionnel (aucun outil ne le voit s'il n'est pas configuré).
- La persistance P0 utilise le **stockage local `.Leanna/*.json`** (toujours disponible, survit au crash sans Supabase), suivant la convention de `DocumentStore`/`MarketplaceRegistry`.

### État vérifié du dépôt (fait, pas supposé)

| Élément | Réalité constatée |
| --- | --- |
| Deux moteurs parallèles | Confirmé : `mission/Executor.ts` (skillHandler) **et** `runtime/agentic/AgenticRuntime.ts` (ToolRegistry). `Executor` n'appelle jamais `AgenticRuntime`. |
| Funnel d'outils unique | `ToolRegistry.call(name, args, options)` — permissions, dry-run, timeout, métriques, abort. |
| Hachage contenu | `WorkspaceState.hash()` = SHA-256 ; `VerificationRecord` déjà défini. |
| Persistance mission | `MissionStore` = Supabase optionnel (no-op si non configuré). |
| Persistance locale | `DocumentStore`, `MarketplaceRegistry` écrivent sous `.Leanna/`. `SELF_ROOT` peut être `""` → fallback `process.cwd()`. |
| Tests | `node:test` + `node:assert/strict`, imports ESM en `.js`, `npm test`. |

---

## 1. Architecture cible P0 (nouveau dossier `server/core/`)

```
server/core/
├── paths.ts               # résolution .Leanna/ (SELF_ROOT || cwd) — util partagé
├── MissionStateMachine.ts # P0.2 — états durables + transitions validées
├── DurableMissionStore.ts # P0.2 — persistance locale .Leanna/missions/*.json
├── ExecutionLedger.ts     # P0.3 — idempotence + reprise (ledger d'actions)
├── CheckpointManager.ts   # P0.4 — snapshot/commit/rollback de fichiers
├── EvidenceEngine.ts      # P0.5 — EvidenceBundle par mission
└── LeannaSupervisor.ts    # P0.6 — autorité unique de mission (state machine)
```

Chaque module est **autonome et testable en isolation** (dépendances injectées), à l'image de `WorkspaceState` / `AgentRepairLoop`.

---

## 2. Détail fichier par fichier

### P0.2 — `MissionStateMachine.ts` + `DurableMissionStore.ts`

- **Comportement actuel** : `MissionState.status` réutilise `GoalStatus` (6 valeurs). Pas d'état `RECOVERING`/`VERIFYING`/`COMMITTING`/`WAITING_APPROVAL`/`ESCALATED`. `MissionStore` persiste seulement dans Supabase (souvent désactivé).
- **Comportement cible** : une machine à états **séparée** `MissionLifecycleState` (CREATED, PLANNING, READY, RUNNING, VERIFYING, RECOVERING, WAITING_APPROVAL, PAUSED, COMMITTING, COMPLETED, FAILED, ESCALATED, CANCELLED) avec transitions validées (transition illégale → exception). Persistée localement à chaque transition.
- **Dépendances** : `paths.ts`. Aucune sur les moteurs existants.
- **Tests** : transitions légales/illégales ; reprise après « crash » (relecture disque) ; horodatage monotone.
- **Non-cassant** : n'altère pas `GoalStatus`. Un mapping optionnel `lifecycle → GoalStatus` est fourni pour l'affichage.

### P0.3 — `ExecutionLedger.ts`

- **Comportement actuel** : `ToolRegistry.call` exécute sans mémoire d'idempotence. Un crash après un effet de bord peut ré-exécuter l'action à la reprise (risque §15/§16).
- **Comportement cible** : registre append-only. Clé = `idempotencyKey` (déterministe : `missionId:stepId:tool:argsHash`). Avant exécution : si clé `completed` → retourner le résultat mémorisé (skip). Sinon écrire `started`, exécuter, écrire `completed`/`failed`. Reprise : les `started` orphelins sont marqués `unknown` et NON rejoués s'ils ont un effet de bord.
- **Point d'intégration** : hook optionnel `beforeCall`/`afterCall` injecté dans `ToolRegistry` (aucun impact si absent). Couvre le chemin agentique ; le chemin mission (skillHandler) pourra l'adopter en P1.
- **Dépendances** : `paths.ts`, `WorkspaceState.hash` (pour `argsHash`).
- **Tests** : dédup d'une clé complétée ; deux appels identiques → un seul effet ; reprise ne rejoue pas un effet de bord `unknown`.

### P0.4 — `CheckpointManager.ts`

- **Comportement actuel** : recovery présent mais **aucun snapshot/rollback** (🔴 audit §7).
- **Comportement cible** : `snapshot(files[])` capture (chemin, existait?, contenu, hash) ; `commit(id)` fige ; `rollback(id)` restaure exactement l'état capturé (y compris suppression des fichiers créés). PREPARE → SNAPSHOT → ACT → VERIFY → COMMIT/ROLLBACK.
- **Dépendances** : `paths.ts`, `WorkspaceState.hash`, `fs`.
- **Tests** : rollback restaure contenu modifié ; rollback supprime un fichier créé ; commit rend le rollback inopérant.

### P0.5 — `EvidenceEngine.ts`

- **Comportement actuel** : preuves dispersées (`AgentEvidenceEvaluator`, `AgentResult`, `VerificationRecord`).
- **Comportement cible** : un `EvidenceBundle` durable par mission agrégeant changes, filesModified, tests, typecheck, lint, hashesBefore/After, toolCalls, approvals, policyDecisions, confidence, unresolvedRisks (structure §12 de l'audit). Règle : **la preuve prime sur la narration LLM**.
- **Dépendances** : `paths.ts`. Consomme des données déjà produites (AgentResult, ledger, checkpoints).
- **Tests** : sérialisation/relecture ; `passed` faux si un check échoue ; confiance bornée [0,1].

### P0.6 — `LeannaSupervisor.ts`

- **Comportement actuel** : `autonomy/Supervisor.ts` = anti-boucle par fichier (pas une autorité de mission).
- **Comportement cible** : autorité unique orchestrant état (MissionStateMachine) + ledger + checkpoints + evidence, et décidant `continue | retry | repair | replan | pause | escalate | complete`. États internes explicites (§19).
- **Dépendances** : les 4 modules ci-dessus.
- **Tests** : cycle nominal CREATED→…→COMPLETED ; échec → RECOVERING → replan/escalate ; escalade après N échecs.

### P0.1 — Runtime canonique

- **Cible** : `AgenticRuntime` reste le kernel. En P0 on **ne fusionne pas** les moteurs (risqué) ; on rend le Supervisor capable de piloter une exécution via une fonction d'exécution injectée (le runtime agentique), posant la couture pour la convergence P1.

---

## 3. Ordre exact des commits

1. `core/paths.ts` (+ test) — util de chemins `.Leanna/`.
2. `core/MissionStateMachine.ts` + `DurableMissionStore.ts` (+ tests) — P0.2.
3. `core/ExecutionLedger.ts` (+ test) — P0.3.
4. `core/CheckpointManager.ts` (+ test) — P0.4.
5. `core/EvidenceEngine.ts` (+ test) — P0.5.
6. `core/LeannaSupervisor.ts` (+ test) — P0.6, assemble tout.
7. Hook optionnel `ExecutionLedger` dans `ToolRegistry.call` — intégration non cassante.
8. `npm run typecheck` + `npm test` verts.

Chaque étape compile et teste isolément : aucune ne casse un chemin existant.

---

## 4. État de livraison P0 (implémenté)

| Livrable | Fichier(s) | Tests |
| --- | --- | --- |
| Util chemins locaux | `server/core/paths.ts` | (couvert indirectement) |
| P0.2 State machine durable | `server/core/MissionStateMachine.ts`, `DurableMissionStore.ts` | 8/8 |
| P0.3 Execution Ledger | `server/core/ExecutionLedger.ts` | 6/6 |
| P0.4 Checkpoint / rollback | `server/core/CheckpointManager.ts` | 6/6 |
| P0.5 Evidence Engine | `server/core/EvidenceEngine.ts` | 6/6 |
| P0.6 Supervisor + intégration | `server/core/LeannaSupervisor.ts`, `LedgerGuard.ts`, `index.ts` | 9/9 |
| Hook idempotence (non cassant) | `server/runtime/ToolRegistry.ts` (`IdempotencyGuard`, `setIdempotencyGuard`) | 80/80 existants OK |
| Branchement au bootstrap | `server/core/kernel.ts` (`createCoreKernel`), `server/runtime/bootstrap.ts` (`kernel` dans `BootstrapResult`), `.env.example` (`LEANNA_IDEMPOTENCY`) | 4/4 |

**Vérification globale** : `npm run typecheck` vert sur tout le projet ; 39/39 tests noyau ; 80/80 tests runtime existants inchangés.

### Activation

Le noyau est instancié à chaque démarrage (`bootstrapRuntime` → `result.kernel`). La garde d'idempotence n'est branchée sur le `ToolRegistry` que si `LEANNA_IDEMPOTENCY="true"` (ou `config.enableIdempotency`). Sans ce flag, le runtime est strictement inchangé. Le `LeannaSupervisor`, le `CheckpointManager`, l'`EvidenceEngine` et le `DurableMissionStore` sont toujours disponibles via `result.kernel` pour gouverner une mission, indépendamment du flag.

### Comment brancher le noyau (exemple)

```ts
import { ExecutionLedger, LedgerGuard, LeannaSupervisor } from "./server/core/index.js";

// Idempotence sur le chemin agentique (aucun impact si non branché) :
const guard = new LedgerGuard(new ExecutionLedger());
toolRegistry.setIdempotencyGuard(guard);
guard.setContext({ missionId, stepId }); // clés d'idempotence stables par étape

// Gouvernance d'une mission de bout en bout :
const supervisor = new LeannaSupervisor();
const result = await supervisor.runMission({
  missionId,
  goal,
  plannedFiles: ["server/foo.ts"], // snapshottés AVANT exécution (rollback fidèle)
  runner: async () => {
    const agentResult = await agenticRuntime.run(agentTask);
    return {
      success: agentResult.success,
      evidence: {
        filesModified: agentResult.filesModified,
        toolsExecuted: agentResult.toolsExecuted,
        testsExecuted: agentResult.verifications.flatMap((v) =>
          v.checks.map((c) => ({ name: c, passed: v.passed }))
        ),
      },
    };
  },
});
```

### P0.1 — Couture vers le runtime canonique (implémentée)

La couture entre le Supervisor et le moteur réel est désormais concrète :

- `server/core/AgenticMissionRunner.ts` : adaptateur `MissionRunner` qui appelle
  `AgenticRuntime.run()` et traduit le `AgentResult` en `RunnerOutcome`. La
  traduction produit une PREUVE observable (`verifications → CheckResult[]`,
  `filesModified → changes`) et une décision de récupération dérivée du
  `AgentOutcome` (`blocked→escalate`, `no_change→replan`, `failed→retry`,
  `partial→repair`). Découplé par interfaces structurelles (`AgenticLike`,
  `AgentResultLike`) : `server/core` ne dépend d'aucune classe agentique.
- `kernel.runSupervisedAgenticMission(runtime, { goal, plannedFiles, … })` :
  point d'entrée gouverné qui pose le contexte d'idempotence, exécute la mission
  via le Supervisor (état durable + snapshot/rollback + preuve + récupération),
  puis nettoie le contexte.

Une exécution agentique réelle peut donc désormais être gouvernée de bout en
bout, tout en restant opt-in : rien ne change pour les appelants existants qui
continuent d'utiliser `AgenticRuntime.run()` directement.

Tests : `server/core/AgenticMissionRunner.test.ts` (8/8) — COMPLETED sur preuve,
ESCALATED + rollback sur échec répété, récupération à une tentative ultérieure,
escalade immédiate d'un `blocked`, et contexte d'idempotence posé/nettoyé.

### Ce qui reste hors P0 (P1+, non traité ici, conforme à l'audit §22-23)

Mémoire structurée à 5 niveaux, boucle d'apprentissage complète, risk engine,
capability attenuation, réputation d'agents, mission replay, opérations longue
durée. La FUSION effective des deux moteurs reste un chantier P1 : la couture
`MissionRunner` rend le chemin agentique gouvernable, mais le mission `Executor`
(goal-stack, skillHandler) n'est pas encore rerouté — migration progressive
conforme à l'audit §24.
