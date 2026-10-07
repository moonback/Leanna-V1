Oui. Après analyse du document complet, mon diagnostic est assez clair :

> **Leanna possède déjà une vraie architecture agentique, et pas simplement un chatbot avec des tools. Mais elle n’est pas encore un “agent autonome de niveau production” au sens fort.**
>
> Le problème principal n’est plus d’ajouter des capacités. C’est maintenant de **réduire la fragmentation du système, établir un chemin d’exécution canonique et rendre l’autonomie durable, récupérable, vérifiable et pilotable de bout en bout.**

Le dépôt montre déjà une architecture considérable : `AgentBrain`, `AgenticRuntime`, `AgentRuntime`, `AgentExecutor`, `AutonomousLoop`, `AutonomousExecutive`, `Mission Executor`, `TaskManager`, `Supervisor`, `KnowledgeGraph`, mémoire hiérarchique, permissions, sandbox, observabilité, etc. 

---

# 1. Verdict global

### État actuel de Leanna

| Domaine                         | Diagnostic                                                    |
| ------------------------------- | ------------------------------------------------------------- |
| Architecture agentique          | 🟢 Très avancée                                               |
| Boucle plan → act → verify      | 🟢 Réelle                                                     |
| Tool use                        | 🟢 Réel et contrôlé                                           |
| Multi-agent                     | 🟢 Réel                                                       |
| Vérification                    | 🟢 Présente, mais fragmentée                                  |
| Réparation automatique          | 🟢 Présente                                                   |
| Mémoire                         | 🟢 Très riche                                                 |
| Apprentissage                   | 🟢 Présent, encore perfectible                                |
| Autonomie événementielle        | 🟢 Présente                                                   |
| Persistance                     | 🟡 Présente mais partiellement optionnelle                    |
| Recovery après crash            | 🟡 Présent, mais pas transactionnel au niveau mission complet |
| Sécurité                        | 🟢 Très structurée                                            |
| Observabilité                   | 🟢 Bonne base                                                 |
| Cohérence architecturale        | 🟠 Trop de moteurs parallèles                                 |
| Contrôle central de l'autonomie | 🟠 Fragmenté                                                  |
| Production multi-instance       | 🟠 À durcir                                                   |
| Autonomie longue durée          | 🟠 Pas encore suffisamment robuste                            |
| Self-healing complet            | 🟠 Partiel                                                    |
| Rollback transactionnel         | 🔴 Manquant                                                   |
| Mission replay/reconstruction   | 🔴 Partiel                                                    |

La propre matrice de maturité du projet confirme plusieurs de ces points : vérification encore partiellement indépendante, multi-agent non directement déclenché par l’autonomie, queue in-process, absence de snapshots/rollback et replay de mission partiel. 

### Mon diagnostic

**Leanna ≈ 70–75 % du chemin vers un agent production-grade.**

Mais attention : ce n'est pas un pourcentage de fonctionnalités.

Le dernier 25–30 % est précisément le plus difficile :

* cohérence du runtime ;
* durabilité ;
* recovery ;
* idempotence ;
* contrôle des effets de bord ;
* supervision ;
* preuves d'exécution ;
* autonomie longue durée ;
* gestion des échecs complexes.

---

# 2. Ce que Leanna est réellement aujourd'hui

Leanna n'est plus simplement :

```text
Utilisateur
   ↓
LLM
   ↓
Tool
   ↓
Réponse
```

Elle possède maintenant plusieurs boucles.

## Boucle agentique

Le runtime agentique implémente explicitement :

```text
OBSERVE
   ↓
PLAN
   ↓
ACT
   ↓
OBSERVE
   ↓
VERIFY
   ↓
RECOVER / NEXT
   ↓
COMPLETE
```

Le `AgenticRuntime` résout les capacités déclarées de l'agent contre le `ToolRegistry`, exécute les tools par le registre et applique budget, permissions, dry-run et métriques. Le dépôt contient même un harness déterministe couvrant plan → tool call → `ToolRegistry` → hash → vérification → récupération. 

C'est une **vraie boucle agentique**.

---

# 3. Le problème majeur : Leanna possède trop de “cerveaux”

C'est à mon avis **le problème architectural n°1**.

Dans le même projet nous avons :

```text
AgentBrain
DynamicPlanner
BrainScheduler
BrainVerifier
BrainCorrectionLoop

        +

AgenticRuntime
AgentRuntimeExecutor
WorkspaceState
AgentRepairLoop

        +

AgentExecutor
AutonomousLoop
AutonomousAgent
AgentRegistry
AgentOrchestrator

        +

Mission Planner
Mission Executor
Reflection
SkillScorer

        +

AutonomousExecutive
PerceptionEngine
TaskManager

        +

WorkflowEngine
```

Le tree confirme cette coexistence : le domaine `server/agents` contient le Brain, l'Executor, l'Orchestrator, l'AutonomousLoop, l'AgentRegistry, etc., tandis que `server/runtime` contient simultanément `AgentRuntime` et `runtime/agentic/AgenticRuntime`; parallèlement `server/mission` et `server/autonomy` ont leurs propres moteurs.  

### Ce n'est pas nécessairement faux.

Le document explique d'ailleurs que certaines duplications sont volontairement conservées parce que chaque système est testé et atteignable.

Mais pour **un véritable agent autonome**, cette situation devient dangereuse.

Parce qu'à terme il faut pouvoir répondre à une question extrêmement simple :

> **“Qui possède la décision de la prochaine action ?”**

Aujourd'hui la réponse dépend encore du chemin emprunté.

---

# 4. Architecture cible que je recommande

Je transformerais Leanna vers cette architecture :

```text
                         ┌───────────────────────┐
                         │       LEANNA          │
                         │    Agent Supervisor   │
                         └───────────┬───────────┘
                                     │
                         ┌───────────▼───────────┐
                         │      GOAL ENGINE       │
                         │ compréhension objectif│
                         │ priorité / contraintes│
                         └───────────┬───────────┘
                                     │
                         ┌───────────▼───────────┐
                         │     MISSION ENGINE     │
                         │ état durable de tâche  │
                         │ DAG / dépendances      │
                         └───────────┬───────────┘
                                     │
                         ┌───────────▼───────────┐
                         │     AGENTIC RUNTIME    │
                         │ OBSERVE → PLAN → ACT   │
                         │ → VERIFY → RECOVER     │
                         └───────────┬───────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                ▼
                 Tools            Agents           Browser
                    │                │                │
                    └────────────────┼────────────────┘
                                     │
                         ┌───────────▼───────────┐
                         │   POLICY / SECURITY    │
                         │ permission             │
                         │ autonomy               │
                         │ sandbox                │
                         │ approval               │
                         │ dry-run                │
                         └───────────┬───────────┘
                                     │
                         ┌───────────▼───────────┐
                         │      VERIFICATION      │
                         │ evidence               │
                         │ tests                  │
                         │ hashes                 │
                         │ invariants             │
                         └───────────┬───────────┘
                                     │
                         ┌───────────▼───────────┐
                         │       MEMORY           │
                         │ working                │
                         │ episodic               │
                         │ semantic               │
                         │ procedural             │
                         │ strategy               │
                         └────────────────────────┘
```

Et surtout :

### **un seul moteur d'exécution canonique.**

`AgenticRuntime` doit devenir le **kernel agentique**.

Les autres composants deviennent :

* planners ;
* stratégies ;
* adaptateurs ;
* policies ;
* mémoire ;
* interfaces ;
* superviseurs.

Ils ne doivent plus chacun posséder leur propre boucle concurrente.

---

# 5. Ce qui est déjà très bon

## 5.1 ToolRegistry

C'est l'un des meilleurs choix architecturaux du projet.

Le runtime agentique passe par :

```text
Agent
 ↓
ToolRegistry
 ↓
PermissionPolicy
 ↓
DryRun
 ↓
Tool
```

C'est exactement le type de frontière qu'il faut conserver.

Le `.env.example` montre notamment un modèle explicite `read / write / network / exec / dangerous`, avec `enforce` comme mode de permissions par défaut et `dangerous` séparé. 

### À conserver absolument.

---

# 6. Le budget agentique est une excellente base

Le runtime agentique possède un `AgentBudget` avec :

* `maxIterations`
* `maxToolCalls`
* `maxExecutionTimeMs`
* `maxRetries`
* `maxCost`

C'est essentiel.

Un agent autonome **sans budget absolu n'est pas un agent de production**.

Mais je pousserais encore plus loin.

Il faut trois niveaux :

```text
Global Budget
      ↓
Mission Budget
      ↓
Step Budget
      ↓
Tool Budget
```

Exemple :

```text
Mission
 ├── 10 min max
 ├── $2 max
 ├── 100 tool calls
 │
 ├── Step 1
 │    ├── 30 sec
 │    └── 10 calls
 │
 ├── Step 2
 │    ├── 2 min
 │    └── 30 calls
 │
 └── Step 3
      ├── 1 min
      └── 20 calls
```

---

# 7. Le vrai gros manque : le transactionnel

Leanna sait vérifier.

Elle sait réparer.

Elle sait calculer des hashes.

Elle sait conserver des `VerificationRecord`.

Mais cela ne suffit pas.

Pour une autonomie production, il faut :

```text
PREPARE
   ↓
SNAPSHOT
   ↓
ACT
   ↓
VERIFY
   ↓
COMMIT
```

ou :

```text
ACT
 ↓
VERIFY FAIL
 ↓
ROLLBACK
 ↓
RECOVER
 ↓
RETRY
```

Actuellement, la documentation indique explicitement :

> recovery présent, mais **pas de snapshot/rollback checkpoints**. 

### C'est une priorité P0.

Pour du code, il faut pouvoir revenir à :

```text
workspace_state_before
```

et comparer avec :

```text
workspace_state_after
```

Puis décider :

```text
COMMIT
ROLLBACK
ESCALATE
```

---

# 8. Le deuxième gros problème : autonomie ≠ simple exécution automatique

Leanna possède déjà :

```text
Heartbeat
Perception
TaskManager
AutonomousExecutive
```

Le runtime autonome est même conçu pour fonctionner de façon événementielle, avec heartbeat adaptatif, perception, déduplication, priorité, retry, circuit breaker et dead-letter. 

C'est très bien.

Mais il faut maintenant créer une distinction stricte entre :

### Réaction

```text
Event
 ↓
Action
```

### Autonomie

```text
Event
 ↓
Observation
 ↓
Compréhension
 ↓
Goal
 ↓
Decision
 ↓
Mission
 ↓
Planning
 ↓
Execution
 ↓
Verification
 ↓
Reflection
 ↓
Learning
 ↓
Future decision
```

Leanna a déjà presque toutes ces briques.

Le travail consiste maintenant à **les faire fonctionner comme une seule machine**.

---

# 9. Le cycle d'apprentissage

C'était historiquement un GAP important.

Le document montre que Leanna produisait des enseignements mais qu'ils n'étaient pas initialement réinjectés dans la planification.

La correction R5 introduit `StrategyMemory` pour conserver les résultats des skills et réinjecter leur fiabilité dans `SkillScorer` et le Planner.

C'est une bonne direction.

Mais je recommande une architecture encore plus forte :

```text
Mission
   ↓
Episode
   ↓
Outcome
   ↓
Reflection
   ↓
Lesson
   ↓
Strategy
   ↓
Policy adjustment
   ↓
Future planning
```

Il faut donc distinguer :

### Memory

> “Qu'est-ce qui s'est passé ?”

### Learning

> “Qu'est-ce que j'ai appris ?”

### Strategy

> “Que devrais-je faire différemment la prochaine fois ?”

### Policy

> “Est-ce que cette stratégie est suffisamment fiable pour être utilisée automatiquement ?”

---

# 10. Le système multi-agent

Leanna dispose déjà de :

```text
AgentOrchestrator
AgentRegistry
AutonomousAgent
DelegationManager
DelegationDispatcher
AgentMessageBus
AgentBrain
```

et de nombreux rôles.

L'arborescence montre notamment les rôles spécialisés `coder`, `refactor`, `debugger`, `reviewer`, `tester`, `security`, `architect`, etc. 

Mais il faut éviter que le multi-agent devienne :

```text
Agent A
 ↓
Agent B
 ↓
Agent C
 ↓
Agent D
```

sans contrôle global.

Je recommande :

```text
                SUPERVISOR
                    │
             ┌──────┼──────┐
             ▼      ▼      ▼
           Coder  Tester Security
             │      │      │
             └──────┼──────┘
                    ▼
               EVIDENCE
                    │
                    ▼
               SUPERVISOR
```

Le superviseur doit être **l'unique autorité de mission**.

---

# 11. Le Brain doit devenir un composant de planification, pas un deuxième runtime

Le `AgentBrain` est intéressant.

Il contient notamment :

```text
GoalUnderstandingEngine
DynamicPlanner
BrainPlanValidator
BrainScheduler
BrainVerifier
BrainCorrectionLoop
```

Le problème est que ces responsabilités chevauchent fortement celles du runtime agentique.

Je ferais :

```text
AgentBrain
    │
    ├── comprendre objectif
    ├── produire plan
    ├── valider plan
    └── adapter plan
             │
             ▼
       AgenticRuntime
```

Et **pas** :

```text
AgentBrain
   ↓
son propre executor
   ↓
son propre verifier
   ↓
son propre recovery
```

---

# 12. Vérification : passer de “succès technique” à “preuve”

C'est un point extrêmement important.

Aujourd'hui Leanna dispose déjà de `WorkspaceState`, hashes et `VerificationRecord`.

C'est excellent.

Mais un agent production-grade doit produire un :

```ts
EvidenceBundle
```

par mission.

Exemple conceptuel :

```ts
{
  missionId,
  goal,
  changes: [...],
  filesModified: [...],
  testsExecuted: [...],
  testsPassed: [...],
  typecheck: {...},
  lint: {...},
  runtimeChecks: [...],
  hashesBefore: {...},
  hashesAfter: {...},
  toolCalls: [...],
  approvals: [...],
  policyDecisions: [...],
  confidence,
  unresolvedRisks: [...]
}
```

Puis :

```text
Narration du LLM
        ≠
Preuve d'exécution
```

La preuve doit toujours gagner.

---

# 13. Le système de permissions est déjà bien pensé

Le modèle :

```text
read
write
network
exec
dangerous
```

est sain.

Et le projet possède :

```text
PermissionPolicy
AuthorizationGate
AutonomyPolicy
DryRunController
Sandbox
PromptInjectionGuard
```

Le document indique notamment que les chemins de contenu externe destinés au modèle sont maintenant protégés contre les injections, notamment documents, GitHub, navigateur et recherche web. 

### Mais il manque une notion essentielle :

## Capability attenuation

Un agent enfant ne devrait jamais obtenir plus de permissions que son parent.

```text
User
 ↓
Mission permissions
 ↓
Supervisor permissions
 ↓
Coder permissions
 ↓
Tool permissions
```

Exemple :

```text
Mission:
read + write + exec

Coder:
read + write

Reviewer:
read

Tester:
read + exec

Security:
read + network
```

C'est beaucoup plus sûr que :

```text
Tous les agents
 ↓
read/write/network/exec
```

---

# 14. Le mode `auto` doit être beaucoup plus intelligent

Le `.env.example` définit :

```text
suggest
ask
auto
```

avec `ask` par défaut. 

C'est bien.

Mais je recommande de remplacer conceptuellement :

```text
auto = tout autoriser
```

par :

```text
AUTO = autonomie graduelle
```

avec un risk score :

```text
Risk 0-20
→ automatique

Risk 20-50
→ automatique + journalisation

Risk 50-75
→ confirmation

Risk 75-100
→ interdiction / escalade
```

Le risque dépendrait de :

* type d'action ;
* permissions ;
* fichier ;
* portée ;
* nombre de fichiers ;
* réseau ;
* données sensibles ;
* suppression ;
* production ;
* confiance ;
* historique de l'agent ;
* réversibilité.

---

# 15. La persistance doit devenir obligatoire pour une vraie production

Aujourd'hui la persistance est présente, notamment via `MissionStore` et `AutonomyPersistence`, mais certaines queues restent in-process et la persistance peut être optionnelle. 

Pour une vraie autonomie longue durée :

```text
Process crash
      ↓
Restart
      ↓
Load Mission
      ↓
Load current state
      ↓
Load last checkpoint
      ↓
Check idempotency
      ↓
Resume
```

Le système doit savoir exactement :

```text
Mission: M123
Step: 7
State: ACTING
Tool: modify_project_file
Invocation: abc123
Status: UNKNOWN
```

Et surtout :

> **ne jamais exécuter deux fois une action potentiellement destructive simplement parce que le processus a crashé après l'appel.**

C'est l'un des problèmes les plus importants à résoudre.

---

# 16. Idempotency

Je placerais une couche dédiée :

```text
ActionExecutionLedger
```

Chaque action obtient :

```text
missionId
stepId
toolCallId
idempotencyKey
argumentsHash
startedAt
completedAt
result
sideEffects
```

Avant d'exécuter :

```text
idempotencyKey déjà exécutée ?
        │
       oui
        ↓
retourner résultat connu

        non
        ↓
exécuter
```

C'est indispensable pour :

* browser ;
* GitHub ;
* Telegram ;
* FTP ;
* filesystem ;
* shell ;
* API externes.

---

# 17. Recovery : il faut distinguer quatre niveaux

Aujourd'hui Leanna possède déjà retry, repair loop, circuit breaker et dead-letter.

Je recommande quatre niveaux :

### Niveau 1 — Retry

Même action.

```text
timeout
→ retry
```

### Niveau 2 — Repair

Modifier l'action.

```text
test fail
→ analyse
→ correction
```

### Niveau 3 — Replan

Changer la stratégie.

```text
strategy failed
→ new plan
```

### Niveau 4 — Escalation

L'agent reconnaît qu'il ne peut pas continuer.

```text
cannot recover
→ human
```

Jamais :

```text
retry forever
```

---

# 18. Heartbeat : très bonne base, mais attention

La configuration actuelle contient :

```text
15s active
60s idle
300s sleep
max concurrency = 2
queue = 100
retry = 3
timeout = 60s
circuit breaker = 5
```



C'est sain.

Mais il faut ajouter :

```text
CPU budget
RAM budget
LLM budget
network budget
disk budget
global daily cost budget
```

Sinon un agent autonome peut être techniquement borné mais économiquement incontrôlé.

---

# 19. Le vrai “Supervisor” qu'il manque

Je considère ceci comme **P0**.

Leanna possède déjà `Supervisor.ts`, `AgentBrain`, `AutonomousExecutive`, etc.

Mais il faut une autorité supérieure :

# `LeannaSupervisor`

Responsabilités :

```text
1. reçoit les événements
2. crée/actualise les objectifs
3. décide si une mission est nécessaire
4. construit la mission
5. attribue les agents
6. surveille les budgets
7. surveille les risques
8. vérifie les preuves
9. décide COMPLETE / RETRY / REPLAN / ESCALATE
10. écrit l'épisode mémoire
11. met à jour les stratégies
```

Il doit avoir un état explicite :

```text
IDLE
OBSERVING
DECIDING
PLANNING
EXECUTING
VERIFYING
RECOVERING
WAITING_APPROVAL
PAUSED
ESCALATED
COMPLETED
FAILED
```

---

# 20. Architecture cible du cycle complet

Je viserais exactement ceci :

```text
                         EVENT
                           │
                           ▼
                    ┌──────────────┐
                    │  PERCEPTION  │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │   SUPERVISOR │
                    └──────┬───────┘
                           │
                    Goal required?
                       /       \
                     NO         YES
                     │           │
                     ▼           ▼
                   WAIT       GOAL ENGINE
                                  │
                                  ▼
                              MISSION
                                  │
                                  ▼
                              PLANNER
                                  │
                                  ▼
                           PLAN VALIDATOR
                                  │
                                  ▼
                          AGENTIC RUNTIME
                                  │
                      ┌───────────┴───────────┐
                      ▼                       ▼
                    ACT                    DELEGATE
                      │                       │
                      └───────────┬───────────┘
                                  ▼
                              OBSERVE
                                  │
                                  ▼
                              VERIFY
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
                 SUCCESS       REPAIR        REPLAN
                    │             │             │
                    │             └──────┬──────┘
                    │                    │
                    ▼                    ▼
                 COMMIT              RECOVER
                    │
                    ▼
                REFLECTION
                    │
                    ▼
                 LEARNING
                    │
                    ▼
              STRATEGY MEMORY
                    │
                    ▼
                SUPERVISOR
```

Ça, c'est le cœur de **Leanna 2.0**.

---

# 21. Priorités exactes

Je ne recommande surtout pas de continuer à ajouter 50 nouvelles fonctionnalités.

Il faut maintenant **industrialiser le noyau**.

## P0 — obligatoire

### P0.1 — Unifier le runtime

Faire de :

```text
AgenticRuntime
```

le seul moteur d'exécution agentique.

Les autres deviennent des couches autour.

---

### P0.2 — Mission State Machine durable

Créer un état persistant :

```text
CREATED
PLANNING
READY
RUNNING
VERIFYING
RECOVERING
WAITING_APPROVAL
PAUSED
COMMITTING
COMPLETED
FAILED
ESCALATED
CANCELLED
```

---

### P0.3 — Action Execution Ledger

Pour idempotence et recovery.

---

### P0.4 — Checkpoint + rollback

Avant toute modification significative :

```text
checkpoint
```

Puis :

```text
commit
```

ou :

```text
rollback
```

---

### P0.5 — Evidence Engine

Ne jamais considérer :

```text
LLM says "done"
```

comme une preuve.

---

### P0.6 — Supervisor central

Une seule autorité pour :

```text
continue
retry
repair
replan
pause
escalate
complete
```

---

# 22. P1 — autonomie avancée

Ensuite :

### P1.1

Mémoire structurée :

```text
WorkingMemory
EpisodicMemory
SemanticMemory
ProceduralMemory
StrategyMemory
```

### P1.2

Learning loop complet :

```text
experience
→ reflection
→ lesson
→ strategy
→ planning
```

### P1.3

Risk engine.

### P1.4

Capability attenuation.

### P1.5

Agent reputation :

```text
coder success rate
tester reliability
tool reliability
strategy reliability
```

### P1.6

Mission replay.

---

# 23. P2 — autonomie longue durée

Enfin :

```text
long-running missions
scheduled goals
proactive maintenance
self-monitoring
resource optimization
predictive recovery
cross-project learning
```

C'est là que Leanna commence réellement à se comporter comme un **agent permanent** plutôt qu'un assistant qui sait exécuter des missions.

---

# 24. Ce que je supprimerais / fusionnerais

Je ne supprimerais pas brutalement les fichiers.

Je ferais une migration progressive.

### À terme :

```text
AgentExecutor
        ↓
Legacy adapter
        ↓
deprecated
```

Même chose pour les chemins concurrents.

Architecture finale :

```text
                   ┌──────────────────┐
                   │ LeannaSupervisor │
                   └────────┬─────────┘
                            │
                   ┌────────▼─────────┐
                   │ MissionEngine    │
                   └────────┬─────────┘
                            │
                   ┌────────▼─────────┐
                   │ AgenticRuntime   │
                   └────────┬─────────┘
                            │
                   ┌────────▼─────────┐
                   │ ToolRegistry     │
                   └──────────────────┘
```

Et autour :

```text
Memory
Knowledge
Security
Observability
Persistence
UI
```

---

# 25. Architecture de fichiers cible

Je viserais progressivement :

```text
server/
│
├── core/
│   ├── LeannaSupervisor.ts
│   ├── GoalEngine.ts
│   ├── MissionEngine.ts
│   ├── MissionStateMachine.ts
│   └── MissionStore.ts
│
├── runtime/
│   ├── AgenticRuntime.ts
│   ├── ExecutionContext.ts
│   ├── ExecutionLedger.ts
│   ├── CheckpointManager.ts
│   ├── EvidenceEngine.ts
│   └── RecoveryEngine.ts
│
├── agents/
│   ├── AgentRegistry.ts
│   ├── AgentDefinition.ts
│   ├── DelegationManager.ts
│   └── roles.ts
│
├── planning/
│   ├── Planner.ts
│   ├── Replanner.ts
│   ├── PlanValidator.ts
│   └── StrategySelector.ts
│
├── memory/
│   ├── WorkingMemory.ts
│   ├── EpisodicMemory.ts
│   ├── SemanticMemory.ts
│   ├── ProceduralMemory.ts
│   └── StrategyMemory.ts
│
├── security/
│   ├── PermissionPolicy.ts
│   ├── AutonomyPolicy.ts
│   ├── RiskEngine.ts
│   ├── AuthorizationGate.ts
│   └── PromptInjectionGuard.ts
│
└── observability/
    ├── MissionTracer.ts
    ├── Metrics.ts
    └── MissionReplay.ts
```

---

# 26. Le point le plus important

**Je ne pense pas que Leanna ait besoin d'un nouveau “cerveau IA”.**

Elle a déjà énormément de composants cognitifs.

Le problème est plutôt :

```text
             TROP DE CERVEAUX
                    ↓
          responsabilités croisées
                    ↓
           plusieurs chemins
                    ↓
          plusieurs états
                    ↓
          recovery incomplet
                    ↓
       autonomie difficile à garantir
```

Il faut maintenant passer de :

> **“Leanna sait faire énormément de choses.”**

à :

> **“Leanna sait toujours exactement pourquoi elle agit, quelle action elle exécute, sous quelle autorisation, avec quel budget, quelle preuve, quel état, quel plan de récupération et quelle conséquence.”**

C'est la différence entre **un framework agentique riche** et **un agent autonome de production**.

---

# 27. Mon plan de transformation

Je ferais les travaux dans cet ordre :

```text
PHASE 0
Architecture freeze
        ↓
PHASE 1
Canonical Agentic Runtime
        ↓
PHASE 2
Durable Mission State Machine
        ↓
PHASE 3
Execution Ledger + Idempotency
        ↓
PHASE 4
Checkpoint + Rollback
        ↓
PHASE 5
Evidence Engine
        ↓
PHASE 6
Central Supervisor
        ↓
PHASE 7
Unified Recovery / Replanning
        ↓
PHASE 8
Memory + Learning closed loop
        ↓
PHASE 9
Risk / Capability Attenuation
        ↓
PHASE 10
Long-running Autonomous Operations
        ↓
PRODUCTION
```

### Et surtout :

**aucune nouvelle grosse fonctionnalité avant P0.**

Le dépôt contient déjà suffisamment de briques : runtime, missions, agents, mémoire, Knowledge Graph, sandbox, permissions, observabilité, workflows, UI et persistance.  

Le prochain gain ne vient donc pas de **+100 tools**.

Il vient de :

**cohérence + durabilité + preuve + récupération + supervision.**

---

## Conclusion

Mon audit donne donc cette image :

```text
                    LEANNA ACTUELLE

             ███████████████████░░░
             ~70–75% architecture
              agentique production


                    MANQUE

       ┌─────────────────────────────┐
       │ Canonical Supervisor        │
       │ Durable Mission State       │
       │ Idempotency Ledger          │
       │ Checkpoints                 │
       │ Rollback                    │
       │ Evidence Engine             │
       │ Unified Recovery            │
       │ Risk Engine                 │
       └─────────────────────────────┘


                    OBJECTIF

             ┌──────────────────┐
             │     LEANNA       │
             │                  │
             │ Observe          │
             │ Understand       │
             │ Decide           │
             │ Plan             │
             │ Act              │
             │ Verify           │
             │ Repair           │
             │ Replan           │
             │ Learn            │
             │ Remember         │
             │ Resume           │
             │ Escalate         │
             │                  │
             │    24/7          │
             └──────────────────┘
```

**Leanna est suffisamment avancée pour qu'une refonte complète soit une mauvaise stratégie.** Il faut maintenant faire une **industrialisation du noyau**, en conservant les briques déjà fonctionnelles et en supprimant progressivement les chemins d'exécution concurrents.

Le document lui-même confirme cette logique : le runtime agentique a déjà été introduit comme chemin principal pour `orchestrate`, `delegateTask`, `TaskScheduler` et la flotte autonome, via `AgentTaskRunner` → `AgentRuntimeExecutor` → `AgenticRuntime`. 

**La prochaine étape logique est donc de transformer cet audit en “Architecture cible + plan d’implémentation P0”, fichier par fichier**, avec pour chaque modification : **fichier, classe/fonction, comportement actuel, comportement cible, dépendances, tests à ajouter et ordre exact des commits**.
