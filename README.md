<div align="center">

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- HERO SECTION — DARK DESIGN                                             -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->

<br>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/images/logo.png">
  <source media="(prefers-color-scheme: light)" srcset="assets/images/logo.png">
  <img src="assets/images/logo.png" alt="Leanna" width="160">
</picture>

<br><br>

# 🧠 LEANNA

**Environnement d'exécution d'agents IA autonomes, local-first**

<br>

<img src="https://readme-typing-svg.demolab.com?font=JetBrains+Mono&weight=600&size=18&pause=1000&color=A78BFA&center=true&vCenter=true&width=1200&lines=Comprendre+%E2%86%92+Planifier+%E2%86%92+Agir+%E2%86%92+V%C3%A9rifier+%E2%86%92+R%C3%A9cup%C3%A9rer+%E2%86%92+Terminer" alt="Typing SVG" />

<br>

<sub>Le projet Leanna est une plateforme desktop local-first dédiée à l’exécution d’agents IA autonomes, structurée autour d’un cycle de compréhension, planification, exécution, observation, vérification et récupération.

Rien ne quitte la machine sans action explicite. Chaque action à effet de bord traverse une chaîne d'autorisation (permissions, sandbox, dry-run, Safety Gate Jev, approbations). Le succès n'est jamais déclaré par un modèle : il est prouvé par l'état du workspace.</sub>

<br><br>

<!-- Badges row 1 — Status -->
<img src="https://img.shields.io/badge/Tests%20backend-1148%20passing-00C853?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Tests backend" />
&nbsp;
<img src="https://img.shields.io/badge/Tests%20front-27%20passing-00C853?style=for-the-badge&logo=vitest&logoColor=white" alt="Tests front" />
&nbsp;
<img src="https://img.shields.io/badge/version-1.5.0-A78BFA?style=for-the-badge" alt="Version" />

<br>

<!-- Badges row 2 — Tech stack -->
<img src="https://img.shields.io/badge/Electron-desktop-47848F?style=flat-square&logo=electron&logoColor=white" alt="Electron" />
&nbsp;
<img src="https://img.shields.io/badge/React-frontend-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React" />
&nbsp;
<img src="https://img.shields.io/badge/TypeScript-runtime-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
&nbsp;
<img src="https://img.shields.io/badge/Node.js-backend-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js" />
&nbsp;
<img src="https://img.shields.io/badge/Supabase-persistence-3ECF8E?style=flat-square&logo=supabase&logoColor=white" alt="Supabase" />
&nbsp;
<img src="https://img.shields.io/badge/Gemini-AI-4285F4?style=flat-square&logo=google&logoColor=white" alt="Gemini" />
&nbsp;
<img src="https://img.shields.io/badge/license-BUSL%201.1-F97316?style=flat-square" alt="License" />

<br><br>

<!-- Quick links -->
<a href="#-installation"><kbd>🚀 Installation</kbd></a>&nbsp;&nbsp;
<a href="#-ce-que-leanna-peut-faire"><kbd>✨ Fonctionnalités</kbd></a>&nbsp;&nbsp;
<a href="#-architecture-du-système"><kbd>🏗️ Architecture</kbd></a>&nbsp;&nbsp;
<a href="#-api"><kbd>📡 API</kbd></a>&nbsp;&nbsp;
<a href="#-contribuer"><kbd>🤝 Contribuer</kbd></a>

<br><br>

</div>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- TABLE OF CONTENTS                                                       -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->

<details>
<summary><b>📋 Table des matières</b></summary>

<br>

| | Section | | Section |
|---|---|---|---|
| 🧠 | [Qu'est-ce que Leanna ?](#quest-ce-que-leanna-) | 🔐 | [Architecture de sécurité](#architecture-de-sécurité) |
| 💡 | [L'idée centrale](#lidée-centrale) | 🛡️ | [Safety Gate Jev](#safety-gate-jev) |
| 🎯 | [Pourquoi Leanna existe](#pourquoi-leanna-existe) | 🔑 | [Permissions](#permissions) |
| ✨ | [Ce que Leanna peut faire](#-ce-que-leanna-peut-faire) | ⚙️ | [Modes d'autonomie](#modes-dautonomie) |
| 🔄 | [Boucle d'exécution autonome](#la-boucle-dexécution-autonome) | 📦 | [Bac à sable](#bac-à-sable-et-exécution-sûre) |
| 🧠 | [Cerveau de l'agent](#cerveau-de-lagent-agent-brain) | 🧪 | [Exécution à blanc](#exécution-à-blanc-dry-run) |
| ⚡ | [Runtime de l'agent](#runtime-de-lagent) | 🔪 | [Kill-switch temps-réel](#kill-switch-temps-réel-abortsignal) |
| | | ♻️ | [Idempotence et reprise](#idempotence-et-reprise-sûre-après-crash-executionledger) |
| | | 🛑 | [Protection injection prompt](#protection-contre-linjection-de-prompt) |
| 🎯 | [Système de missions](#système-de-missions) | 👁️ | [Observabilité](#observabilité) |
| 📊 | [Estimation avant exécution](#estimation-avant-exécution) | 🖥️ | [Environnement de bureau](#environnement-de-bureau) |
| 🤖 | [Architecture multi-agents](#architecture-multi-agents) | 💻 | [IDE et espace de travail](#ide-et-espace-de-travail) |
| 🔧 | [Outils et compétences](#outils-et-compétences) • [Attribution déterministe](#attribution-déterministe-outil--agent) • [Skills tiers isolés](#exécution-isolée-des-skills-tiers-skillworker) | 🌐 | [Automatisation navigateur](#automatisation-du-navigateur) • [Navigateur intégré](#navigateur-intégré) |
| 📚 | [Connaissance et compréhension](#connaissance-et-compréhension) | 🔀 | [Git et GitHub](#git-et-github) |
| 🧠 | [Architecture de la mémoire](#architecture-de-la-mémoire) | 📓 | [Notebooks et RAG](#-notebooks-et-rag) |
| 📈 | [Apprentissage et fiabilité](#apprentissage-et-fiabilité) | 🎙️ | [Assistant vocal notebook](#-assistant-vocal-du-notebook) |
| ✅ | [Vérification et récupération](#vérification-et-récupération) | 🖼️ | [Génération d'images](#génération-dimages) |
| | | 🗺️ | [Workflows et automatisation](#workflows-et-automatisation) |
| | | 🔌 | [MCP](#mcp) • [Telegram](#telegram) • [API](#-api) |

</details>

<br>

<img src="https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.png" alt="separator" width="100%">

<br>

## 🧠 Qu'est-ce que Leanna ?

**Leanna est un environnement d'agent IA autonome natif pour le bureau.**

Il est conçu autour d'une différence fondamentale entre un assistant conversationnel classique et un système agentique.

Un assistant classique suit principalement ce modèle :

```text
Utilisateur
  ↓
Question
  ↓
IA
  ↓
Réponse
```

Leanna est conçu autour de :

```text
Utilisateur
  ↓
Objectif
  ↓
Comprendre
  ↓
Planifier
  ↓
Agir
  ↓
Observer
  ↓
Vérifier
  ↓
Récupérer / Replanifier
  ↓
Terminer
```

L'objectif n'est pas simplement de générer du texte.

L'objectif est de créer un runtime capable de :

* comprendre un objectif ;
* comprendre le contexte du projet ;
* déterminer quels outils et agents sont pertinents ;
* construire un plan d'exécution ;
* exécuter des actions ;
* observer leurs résultats ;
* vérifier le résultat ;
* détecter les échecs ;
* tenter une récupération bornée ;
* replanifier lorsque nécessaire ;
* maintenir la mémoire et le contexte ;
* respecter les permissions et les politiques d'autonomie ;
* exposer l'état d'exécution à l'utilisateur.

Leanna combine une interface de bureau, un runtime IA, un système d'agents, un registre d'outils, un système de missions, la connaissance du projet, une mémoire persistante, des contrôles de sécurité et l'observabilité au sein d'un même environnement.

<br><img src="https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.png" alt="separator" width="100%"><br>

## 💡 L'idée centrale

Le principe de conception central de Leanna est :

> **Un agent IA ne doit pas être considéré comme performant parce qu'il a produit une réponse. Il doit être considéré comme performant lorsque l'objectif demandé a été exécuté et vérifié selon des critères de succès explicites.**

Cela conduit à une philosophie d'exécution différente.

## IA orientée réponse

```text
Prompt
  ↓
Génération
  ↓
Réponse
```

## Exécution orientée agent

```text
Objectif
  ↓
Acquisition du contexte
  ↓
Compréhension de l'objectif
  ↓
Planification
  ↓
Sélection d'outil / d'agent
  ↓
Exécution
  ↓
Observation
  ↓
Vérification
  ↓
Récupération ou replanification
  ↓
Résultat final
```

Cette distinction est particulièrement importante pour les tâches d'ingénierie logicielle.

Par exemple :

```text
« Corriger le bug d'authentification. »
```

Leanna ne doit pas considérer la tâche comme terminée simplement parce qu'un modèle IA a suggéré une modification de code.

Une exécution complète peut impliquer :

```text
1. Comprendre l'objectif
2. Inspecter le projet
3. Identifier les fichiers pertinents
4. Déterminer les dépendances
5. Créer un plan d'exécution
6. Sélectionner l'agent approprié
7. Lire les fichiers requis
8. Modifier l'implémentation
9. Vérifier les fichiers modifiés
10. Exécuter les vérifications pertinentes
11. Détecter les échecs
12. Corriger l'implémentation si nécessaire
13. Relancer la vérification
14. Rapporter le résultat réel
```

<br><img src="https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.png" alt="separator" width="100%"><br>

## 🎯 Pourquoi Leanna existe

Les systèmes d'IA modernes sont de plus en plus capables de raisonnement et d'utilisation d'outils, mais les tâches complexes nécessitent encore une coordination entre :

* le contexte ;
* la planification ;
* l'exécution ;
* les outils ;
* les agents spécialisés ;
* la mémoire ;
* la vérification ;
* la sécurité ;
* la gestion des échecs ;
* l'approbation humaine.

Leanna est conçu comme un runtime autour de ces préoccupations.

Au lieu de traiter chaque requête comme une conversation isolée, Leanna traite une requête comme une **mission** potentielle.

Une mission possède :

* un objectif ;
* un contexte ;
* des contraintes ;
* un plan ;
* **une estimation coût / durée / risque avant exécution** ;
* des étapes d'exécution ;
* des outils ;
* des agents ;
* des observations ;
* des critères de vérification ;
* un comportement de récupération ;
* un résultat.

<br><img src="https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.png" alt="separator" width="100%"><br>

## ✨ Ce que Leanna peut faire

Leanna fournit un large ensemble de capacités autour de son runtime d'agent.

## Interaction IA

* interaction conversationnelle ;
* sélection de modèle ;
* prompting contextuel ;
* interaction en direct ;
* visibilité de l'utilisation des tokens ;
* tâches orientées raisonnement ;
* tâches en arrière-plan ;
* exécution structurée d'agents.

## Ingénierie logicielle

* inspecter une base de code ;
* naviguer dans les fichiers du projet ;
* lire les fichiers source ;
* modifier les fichiers du projet ;
* raisonner sur les dépendances ;
* analyser la structure du projet ;
* effectuer une vérification ;
* inspecter l'état Git ;
* interagir avec GitHub ;
* exécuter des opérations de terminal contrôlées ;
* réaliser des audits de sécurité ;
* construire et exécuter des workflows de développement.

## Exécution autonome

* créer des missions ;
* planifier des missions ;
* exécuter des tâches en plusieurs étapes ;
* suivre l'état d'exécution ;
* vérifier les résultats ;
* récupérer après des échecs ;
* réessayer des opérations ;
* replanifier lorsque nécessaire ;
* maintenir des budgets d'exécution bornés.

## Exécution multi-agents

Leanna contient une infrastructure pour des rôles d'agents spécialisés couvrant notamment :

* le codage ;
* le débogage ;
* le refactoring ;
* la revue ;
* les tests ;
* la sécurité ;
* la planification ;
* la recherche ;
* la rédaction ;
* le formatage ;
* la relecture ;
* la traduction ;
* la synthèse ;
* les tâches orientées vision.

La disponibilité effective d'un rôle au runtime dépend de son enregistrement et de sa configuration d'exécution.

## Connaissance

Leanna contient plusieurs systèmes de compréhension du projet :

* Graphe de connaissances ;
* Graphe de dépendances ;
* Mémoire du projet ;
* Recherche sémantique ;
* Analyse AST ;
* analyse du graphe d'appels ;
* analyse d'impact ;
* analyse de documents ;
* indexation du projet ;
* indexation de l'espace de travail.

## Productivité

* notebooks ;
* assistant vocal du notebook (interrogation et génération à la voix) ;
* ingestion de documents ;
* RAG ;
* embeddings ;
* génération de documents ;
* génération d'images à la demande ;
* export PDF ;
* export DOCX ;
* export HTML ;
* workflows ;
* automatisation ;
* tâches planifiées ;
* listes ;
* historique des conversations.

## Intégrations

Le dépôt contient des intégrations pour :

* Gemini ;
* OpenRouter ;
* Supabase ;
* GitHub ;
* Telegram ;
* MCP ;
* automatisation du navigateur ;
* Puppeteer ;
* opérations de bureau au niveau système.

<br><img src="https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.png" alt="separator" width="100%"><br>

## 🔄 La boucle d'exécution autonome

Le modèle d'exécution repose sur une boucle de rétroaction fermée.

```text
┌─────────────────────┐
│      OBJECTIF       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│     COMPRENDRE      │
│                     │
│ Objectif             │
│ Contexte             │
│ Exigences            │
│ Risques              │
│ Critères de succès   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│     PLANIFIER       │
│                     │
│ Étapes               │
│ Dépendances          │
│ Agents               │
│ Compétences          │
│ Outils               │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│        AGIR         │
│                     │
│ Outils               │
│ Agents               │
│ Opérations fichiers  │
│ Commandes            │
│ Intégrations         │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│      OBSERVER       │
│                     │
│ Résultats d'outils   │
│ Fichiers             │
│ Erreurs              │
│ Événements runtime   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│      VÉRIFIER       │
│                     │
│ Syntaxe              │
│ Tests                │
│ Fichiers             │
│ Résultat sémantique  │
│ Critères de succès   │
└──────────┬──────────┘
           │
       ┌───┴────┐
       │        │
       ▼        ▼
   SUCCÈS    ÉCHEC
       │        │
       │        ▼
       │    ┌─────────────┐
       │    │  RÉCUPÉRER  │
       │    └──────┬──────┘
       │           │
       │           ▼
       │    REPLANIFIER / RÉESSAYER
       │           │
       │           └───────┐
       │                   │
       └───────────────────┘
               │
               ▼
         ┌────────────┐
         │  TERMINER  │
         └────────────┘
```

La caractéristique importante est que **la vérification fait partie de l'exécution**, plutôt que d'être une étape finale optionnelle.

<br><img src="https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.png" alt="separator" width="100%"><br>

## 🧠 Cerveau de l'agent (Agent Brain)

Le dépôt contient un sous-système explicite de cerveau d'agent (Agent Brain).

Situé sous :

```text
server/agents/brain/
```

Le Brain contient des composants dédiés pour :

* la compréhension de l'objectif ;
* la planification dynamique ;
* la validation de plan ;
* l'ordonnancement ;
* la vérification ;
* la correction ;
* l'orchestration.

Les composants clés incluent :

```text
AgentBrain.ts
GoalUnderstandingEngine.ts
DynamicPlanner.ts
BrainPlanValidator.ts
BrainVerifier.ts
BrainCorrectionLoop.ts
BrainScheduler.ts
```

## Compréhension de l'objectif

Le `GoalUnderstandingEngine` analyse l'objectif demandé et en dérive des informations structurées telles que :

* l'intention ;
* le domaine ;
* la complexité ;
* les technologies ;
* les fichiers pertinents ;
* les exigences ;
* les critères de succès ;
* les risques ;
* la justification.

Cela permet à la couche de planification d'opérer sur une représentation structurée plutôt que sur le seul prompt brut de l'utilisateur.

---

# Planification dynamique

Le `DynamicPlanner` génère des étapes d'exécution basées sur :

* l'objectif compris ;
* le contexte du projet ;
* les agents disponibles ;
* les rôles des agents ;
* les compétences disponibles ;
* les outils disponibles ;
* les dépendances entre les étapes.

Un plan peut contenir des étapes telles que :

```text
Étape 1
  Recherche / inspection

Étape 2
  Architecture / planification

Étape 3
  Implémentation

Étape 4
  Tests

Étape 5
  Vérification

Étape 6
  Correction si nécessaire
```

Les étapes peuvent dépendre des étapes précédentes.

```text
inspecter
   ↓
planifier
   ↓
implémenter
   ↓
tester
   ↓
vérifier
```

Le planificateur valide la structure des plans générés avant l'exécution.

Le dépôt utilise une validation de schéma pour la sortie brute du planificateur ainsi qu'une validation supplémentaire du graphe et des invariants avant de transformer le résultat en étapes exécutables.

<br><img src="https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.png" alt="separator" width="100%"><br>

## ⚡ Runtime de l'agent

Le runtime est la couche d'exécution qui relie :

```text
Agents
  +
Outils
  +
Permissions
  +
Mémoire
  +
Événements
  +
Workflows
  +
Vérification
```

Les composants principaux du runtime incluent :

```text
server/runtime/

AgentRuntime.ts
ToolRegistry.ts
PermissionPolicy.ts
AuthorizationGate.ts
DryRun.ts
StateMachine.ts
WorkflowEngine.ts
EventBus.ts
Memory.ts
HierarchicalMemoryService.ts
Observability.ts
PromptRegistry.ts
```

Le runtime fournit un emplacement central pour exécuter les capacités des agents, au lieu de permettre à chaque sous-système de contourner indépendamment les règles de sécurité et d'exécution.

<br><img src="https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.png" alt="separator" width="100%"><br>

## 🎯 Système de missions

Le sous-système de missions est responsable de l'exécution orientée objectif.

Situé sous :

```text
server/mission/
```

Les composants principaux incluent :

```text
Mission.ts
MissionStore.ts
Planner.ts
Executor.ts
Reflection.ts
AutonomyPolicy.ts
SkillScorer.ts
PlanEstimator.ts
```

Une mission représente un objectif structuré qui peut être :

1. créé ;
2. planifié ;
3. exécuté ;
4. observé ;
5. vérifié ;
6. soumis à réflexion ;
7. réessayé ou replanifié ;
8. terminé ou arrêté.

---

# Estimation avant exécution

Avant qu'une seule action ne soit exécutée, Leanna calcule une **estimation structurée** du coût LLM, de la durée totale et du niveau de risque du plan.

Cette estimation est affichée dans le panneau de mission au moment où le plan est présenté à l'utilisateur.

## Composant

```text
server/mission/PlanEstimator.ts
```

## Ce qui est estimé

### Coût LLM (`estimatedCostUsd`)

Calculé action par action à partir de :

* les tokens d'entrée estimés par appel (prompt système + contexte objectif) ;
* les tokens de sortie estimés selon la **catégorie** du skill (lecture → ~300 tokens, génération de code → ~2 000 tokens…) ;
* la **tarification réelle du modèle actif** via `TelemetryService.calculateCost()`.

L'overhead de planification (décomposition LLM des sous-objectifs) est inclus.

### Durée (`estimatedDurationMs`)

Somme des durées moyennes observées par skill via le `SkillScorer`, avec :

* repli sur des durées conservatrices par catégorie si aucun historique n'est disponible (`read` → 1,5 s, `code` → 20 s…) ;
* majoration de 15 % pour l'overhead de réflexion LLM entre chaque action.

### Niveau de risque (`riskLevel`)

Score multi-facteurs (0–100) converti en niveau qualitatif :

```text
low       → score ≤ 25
medium    → score ≤ 50
high      → score ≤ 75
critical  → score > 75
```

Les facteurs pris en compte incluent :

* le nombre d'actions planifiées ;
* la présence d'actions à effet de bord élevé (écriture de fichier, commandes shell, push Git…) ;
* les mots-clés à risque dans l'énoncé (suppression, migration, production, credentials…) ;
* les fichiers sensibles ciblés (`.env`, schémas d'authentification…) ;
* le score de fiabilité moyen des actions planifiées.

### Confiance dans l'estimation (`estimationConfidence`)

Proportion d'actions pour lesquelles le `SkillScorer` dispose d'historique, pondérée par le niveau de risque. Une faible confiance signale que les estimations sont principalement basées sur les defaults de catégorie.

## Affichage dans l'interface

Le composant `MissionPlanSummary` du panneau de mission affiche une **bannière à trois colonnes** dès réception du plan :

```text
┌──────────────────────────────────────────┐
│  Plan d'action              ~4 200 tokens│
├──────────────────────────────────────────┤
│  💲 $0.0012  │  ⏱ ~3min 20s  │  🛡 Modéré │
├──────────────────────────────────────────┤
│  ████████░░░░░░░░  65% confiance         │
└──────────────────────────────────────────┘
```

La barre de confiance est colorée selon le niveau :

```text
≥ 70 %   → vert   (données historiques suffisantes)
≥ 40 %   → orange (historique partiel)
< 40 %   → rouge  (estimation principalement basée sur les defaults)
```

## Boucle d'amélioration continue

Les durées réelles enregistrées par `SkillScorer.recordUsage()` après chaque exécution améliorent automatiquement les estimations des missions suivantes, via l'amorçage depuis `StrategyMemory` à chaque démarrage de mission.

<br><img src="https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.png" alt="separator" width="100%"><br>

## 🤖 Architecture multi-agents

Leanna ne se limite pas à un seul agent monolithique.

L'architecture contient :

```text
                 OBJECTIF UTILISATEUR
                        │
                        ▼
                 ┌─────────────┐
                 │ Agent Brain │
                 └──────┬──────┘
                        │
                 ┌──────▼──────┐
                 │Orchestrateur│
                 └──────┬──────┘
                        │
       ┌────────────────┼────────────────┐
       │                │                │
       ▼                ▼                ▼
    Codeur          Débogueur         Relecteur
       │                │                │
       ▼                ▼                ▼
  Compétences      Compétences       Compétences
       │                │                │
       └────────────────┼────────────────┘
                        ▼
                    ToolRegistry
                        │
                        ▼
                 AuthorizationGate
                        │
                        ▼
                    Exécution
```

L'infrastructure pertinente inclut :

```text
AgentOrchestrator
AgentRegistry
DynamicAgentRegistry
DelegationManager
DelegationDispatcher
AgentTaskRunner
AutonomousAgent
AutonomousLoop
AgentRepairLoop
AgentEventStream
AgentMessageBus
AgentContextResolver
```

---

# AgentTaskRunner

Le contrat d'exécution est séparé des boucles autonomes de plus haut niveau via une abstraction `AgentTaskRunner`.

Cela permet à la couche d'autonomie d'opérer contre un contrat d'exécution de tâche au lieu d'être étroitement couplée à une implémentation d'exécuteur concrète.

Conceptuellement :

```text
AutonomousLoop
      │
      ▼
AgentTaskRunner
      │
      ├── execute(task)
      │
      └── runTool(name, args)
              │
              ▼
         Runtime d'outil
```

Cette séparation permet de faire évoluer le moteur d'exécution sans réécrire la boucle de contrôle autonome.

<br><img src="https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.png" alt="separator" width="100%"><br>

## 🔧 Outils et compétences

Leanna sépare les **compétences** des **outils**.

Une compétence représente un domaine de capacité fonctionnelle.

Un outil représente une opération exécutable.

Conceptuellement :

```text
Agent
  ↓
Compétence
  ↓
Outil
  ↓
Autorisation
  ↓
Exécution
  ↓
Résultat
```

Exemples de domaines de compétences :

* automatisation ;
* navigateur ;
* base de code ;
* Git ;
* GitHub ;
* connaissance ;
* génération d'images ;
* mémoire ;
* mission ;
* raisonnement ;
* sécurité ;
* système ;
* Telegram ;
* vérification ;
* workflows.

Le dépôt contient une couche de compétences natives sous :

```text
server/skills/
```

et un registre au runtime sous :

```text
server/runtime/ToolRegistry.ts
```

---

# Registre d'outils (Tool Registry)

Le registre d'outils est responsable de la centralisation des capacités exécutables.

Une déclaration d'outil peut décrire :

* le nom ;
* la description ;
* le schéma d'entrée ;
* la catégorie ;
* les permissions ;
* le comportement mutatif ;
* le délai d'expiration (timeout) ;
* le gestionnaire d'exécution.

Cela permet aux politiques du runtime de raisonner sur les outils avant leur exécution.

Par exemple :

```text
Outil
 ├── nom
 ├── catégorie
 ├── schéma d'entrée
 ├── permissions
 ├── mutatif
 └── timeout
```

Ces métadonnées deviennent importantes pour :

* l'autorisation ;
* l'exécution à blanc (dry-run) ;
* l'attribution ;
* l'observabilité ;
* le mapping des agents ;
* la sélection d'outils ;
* les contrôles de sécurité.

---

# Attribution déterministe outil → agent

Chaque outil du registre doit être rattaché de façon **déterministe** à un agent
propriétaire, plutôt que routé par simple heuristique au moment de l'appel. Un
audit de boot vérifie cette chaîne et peut faire échouer le démarrage si un outil
n'est pas attribué.

Composant :

```text
server/agents/attributionAudit.ts
```

Le mode est piloté par la variable d'environnement
`Leanna_ATTRIBUTION_ENFORCEMENT` :

```text
off      audit désactivé
warn     journalise les outils non attribués, sans bloquer (défaut)
strict   lève UnattributedToolsError et fait échouer le boot
```

```env
# off | warn | strict
Leanna_ATTRIBUTION_ENFORCEMENT="strict"
```

Un audit symétrique, `server/agents/capabilityAudit.ts`
(`Leanna_CAPABILITY_ENFORCEMENT`), vérifie au boot que les capacités déclarées
par les agents correspondent aux outils réellement enregistrés — ce qui évite les
boucles de retry stériles sur un outil manquant. En mode `strict`, le
désalignement devient une erreur de boot plutôt qu'un échec découvert en pleine
mission.

---

# Exécution isolée des skills tiers (SkillWorker)

Les skills/agents tiers (plugins `*.agent.js`) ne s'exécutent pas dans le process
principal : ils sont lancés dans un **Worker thread** (isolat V8 distinct) via le
`SkillWorker`.

Composants pertinents :

```text
server/runtime/SkillWorker.ts        Exécution isolée via worker_threads
server/security/agentDefinitionSchema.ts   Validation du manifeste d'agent
server/agents/AgentLoader.ts         Chargement + signature des agents dynamiques
```

Le modèle d'isolation :

```text
Main thread                     Worker thread (isolat V8)
───────────────────             ─────────────────────────
runPluginInWorker()             workerEntrypoint()
  ├─ spawn Worker                 ├─ importe le plugin
  ├─ envoie { execute, ctx }      ├─ appelle plugin.execute(ctx, proxy)
  ├─ attend le résultat           └─ chaque appel d'outil → postMessage
  └─ proxyToolCall(name, args)
      ├─ valide la capability
      └─ délègue au ToolRegistry principal
```

Garanties de sécurité :

* **isolation mémoire** — le plugin ne peut ni lire ni modifier la mémoire du
  process principal ;
* **capability enforcement** — chaque appel d'outil est intercepté et rejeté si
  l'outil ne figure pas dans la liste `allowedCapabilities` ; un plugin ne peut
  pas élever ses propres privilèges ;
* **timeout strict** — un `AbortController` termine le Worker au-delà de
  `maxDurationMs` (défaut 30 s), empêchant tout blocage indéfini du runtime ;
* **surface minimale** — seuls des messages JSON-sérialisables transitent entre
  les threads ; aucune référence objet partagée n'est exposée ;
* **pas d'accès direct au ToolRegistry** — le plugin ne reçoit qu'un proxy qui
  relaie chaque appel au main thread, lequel valide puis exécute.

L'isolation est activable via `.env` :

```env
# Allowlist de plugins (JSON : { "mon_agent.agent.js": "<sha256>" }).
LEANNA_PLUGIN_ALLOWLIST=""
# Exécution sandboxée via worker_threads.
LEANNA_PLUGIN_SANDBOX="true"
# Secret HMAC (≥ 32 caractères) pour signer les agents dynamiques.
LEANNA_AGENT_SECRET=""
```

<br><img src="https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.png" alt="separator" width="100%"><br>

## 📚 Connaissance et compréhension

Leanna contient un sous-système dédié à la compréhension du projet.

L'architecture combine plusieurs sources de connaissance.

```text
                 PROJET
                    │
       ┌────────────┼────────────┐
       │            │            │
       ▼            ▼            ▼
Graphe de       Graphe de   Mémoire du projet
connaissances   dépendances
       │            │            │
       └────────────┼────────────┘
                    │
                    ▼
             Recherche sémantique
                    │
                    ▼
          Moteur de compréhension
                    │
                    ▼
             Contexte de l'agent
```

---

# Graphe de connaissances

Le graphe de connaissances représente les relations découvertes dans un projet.

Les composants pertinents incluent :

```text
KnowledgeGraph.ts
KnowledgeGraphCache.ts
ASTParser.ts
ASTCallGraph.ts
DependencyGraph.ts
RelationExtractor.ts
ImpactAnalyzer.ts
ProjectIndexer.ts
WorkspaceIndexer.ts
```

Le système peut raisonner sur :

* les fichiers ;
* les entités ;
* les imports ;
* les dépendances ;
* les relations d'appel ;
* la structure du projet ;
* les relations d'impact.

Cela permet à un agent d'éviter de traiter le projet comme une collection plate de fichiers.

---

# Moteur de compréhension

L'`UnderstandingEngine` coordonne plusieurs systèmes de connaissance :

```text
KnowledgeGraph
DependencyGraph
ProjectMemory
SemanticSearch
ImpactAnalyzer
```

Son but est de construire un contexte d'exécution pour une tâche.

Conceptuellement :

```text
Tâche
 ↓
Récupération de connaissances
 ↓
Fichiers pertinents
 ↓
Faits du projet
 ↓
Informations de dépendance
 ↓
Contexte sémantique
 ↓
Informations d'impact
 ↓
Score de compréhension
 ↓
Contexte de l'agent
```

Ce contexte peut ensuite être incorporé dans la planification et l'exécution.

---

# Architecture de la mémoire

Leanna contient plusieurs couches de mémoire.

## Mémoire de conversation

Maintient les informations contextuelles liées aux interactions.

## Mémoire du projet

Stocke les faits, décisions et informations contextuelles au niveau du projet.

## Mémoire hiérarchique

Fournit une couche de mémoire structurée pouvant opérer à travers différentes portées.

## Mémoire de connaissances

Représente la connaissance structurée du projet.

## Mémoire de stratégie

Stocke des informations historiques compactes sur la fiabilité des compétences/outils.

## Mémoire de notebook

Prend en charge la connaissance orientée documents et les workflows RAG.

Un modèle conceptuel est :

```text
              SYSTÈME DE MÉMOIRE
                      │
        ┌─────────────┼─────────────┐
        │             │             │
        ▼             ▼             ▼
 Conversation      Projet        Stratégie
   Mémoire         Mémoire        Mémoire
        │             │             │
        └─────────────┼─────────────┘
                      │
                      ▼
              Mémoire hiérarchique
                      │
                      ▼
               Contexte de l'agent
```

---

# Apprentissage et fiabilité

Leanna contient un mécanisme de rétroaction sur la fiabilité via `StrategyMemory`.

Le système peut enregistrer des signaux compacts tels que :

* le nombre de succès ;
* le nombre d'échecs ;
* le total des appels ;
* la durée ;
* les résultats récents ;
* le taux de succès ;
* le taux de succès récent ;
* la durée moyenne.

Le but n'est pas de stocker un historique de modèle arbitraire.

Le but est de donner à la planification un signal historique sur les stratégies d'exécution fiables.

Conceptuellement :

```text
Exécution d'outil
      │
      ▼
Succès / Échec
      │
      ▼
StrategyMemory
      │
      ▼
SkillScorer
      │
      ▼
Planificateur
      │
      ▼
Sélection future d'outils
```

Un outil ayant échoué de façon répétée peut donc être déprioriser lors des planifications futures.

Cela crée une boucle de rétroaction à travers les missions.

## Amorçage cross-mission (seedFromReliability)

La boucle d'apprentissage ne se limite pas à la mission en cours : le signal de
fiabilité est **durable et partagé entre les missions**.

```text
server/knowledge/StrategyMemory.ts   Store durable par workspace (.Leanna-strategy.json)
server/mission/SkillScorer.ts         Scoring + amorçage
```

Le `StrategyMemory` persiste par workspace, en JSON atomique (`tmp` + `rename`),
avec *decay* et *prune*. Aucun secret ni payload n'y est stocké — uniquement des
compteurs compacts (succès, échecs, durées). En cas d'erreur d'E/S, il dégrade
proprement en mémoire seule sans jamais faire échouer la boucle.

Le cycle complet s'étend donc sur plusieurs missions :

```text
Mission N
  exécution d'outil
      ↓
  SkillScorer.recordUsage  +  StrategyMemory.recordSkillOutcome   (JSON durable)

Mission N+1
  startMission
      ↓
  SkillScorer.seedFromReliability( StrategyMemory.getAllStats() )
      ↓
  Planner.decompose  ←  avertissements « failing-skill » (getFailingSkills)
```

Au démarrage d'une mission, `SkillScorer.seedFromReliability()` amorce l'historique
de scoring à partir du store durable : un outil historiquement défaillant est
déprioritisé **dès la première planification**, sans attendre un échec re-observé.
Les observations vivantes de la mission priment ensuite — l'amorçage ne touche que
les skills encore vierges pour la session. En complément,
`AutonomousExecutive.recallOutcome()` peut escalader la stratégie après plusieurs
échecs de la même classe.

---

# Vérification

La vérification est une partie de premier ordre du runtime.

Leanna contient plusieurs couches de vérification.

Selon le chemin d'exécution, la vérification peut impliquer :

* la vérification de fichiers ;
* des contrôles de syntaxe ;
* des tests ;
* des contrôles sémantiques ;
* des contrôles visuels ;
* les critères de succès de la mission ;
* l'état d'exécution ;
* les résultats des outils.

Le cerveau de l'agent (Agent Brain) contient un composant dédié :

```text
BrainVerifier
```

La couche d'exécution autonome enregistre également les résultats de vérification pendant l'exécution.

La règle conceptuelle est :

```text
Action ≠ Succès

Action
  ↓
Observation
  ↓
Vérification
  ↓
Succès / Échec
```

---

# Récupération

Une opération échouée ne signifie pas nécessairement qu'une mission doit s'arrêter immédiatement.

Le système d'exécution peut entrer dans un chemin de récupération.

```text
Exécution
   ↓
Échec
   ↓
Analyser l'échec
   ↓
Décision de récupération
   ├── réessayer
   ├── continuer
   ├── replanifier
   └── abandonner
```

Le dépôt contient :

```text
AgentRepairLoop
BrainCorrectionLoop
AutonomousLoop
Reflection
Planner.replan
```

La récupération reste bornée par les budgets d'exécution, les limites de réessai, les délais d'expiration et les règles d'autorisation.

<br><img src="https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.png" alt="separator" width="100%"><br>

## 🔐 Architecture de sécurité

Comme Leanna peut interagir avec les fichiers, les processus, les réseaux et les services externes, la sécurité fait partie de l'architecture d'exécution.

Le runtime ne traite pas tous les outils de la même manière.

Le système d'autorisation combine plusieurs axes.

```text
                 REQUÊTE D'OUTIL
                      │
                      ▼
              AuthorizationGate
                      │
       ┌──────────────┼──────────────┐
       │              │              │
       ▼              ▼              ▼
   Politique de   Politique      Contrôle du
   permission     d'autonomie    bac à sable
       │              │              │
       └──────────────┼──────────────┘
                      │
                      ▼
                Autorisation
                      │
                ┌─────┴─────┐
                ▼           ▼
             AUTORISER   REFUSER / DEMANDER
```

Le dépôt contient des implémentations dédiées pour :

```text
AuthorizationGate
PermissionPolicy
AutonomyPolicy
DryRunController
sandbox
promptInjectionGuard
safeguards
checkpoint
confirmationBridge
```

---

# Safety Gate Jev

Le **Safety Gate Jev** est une couche de sécurité sémantique qui évalue **chaque
action à effet de bord** de l'agent (écriture de fichier, suppression, commande
shell, `push` git, appel réseau…) **avant son exécution**, et peut la bloquer.

Contrairement aux contrôles déterministes (chemins interdits, `.leannaignore`,
bac à sable), qui répondent à la question « cette action touche-t-elle une zone
protégée ? », le Safety Gate répond à la question « cette action est-elle
**risquée** dans son intention ? ». Il s'appuie sur le modèle de décision **Jev**
(TypeSafe, via OpenRouter) auquel on pose des questions **typées** dont on route
les probabilités, au lieu de demander un « OUI/NON » libre à parser.

## Où il se branche

Le garde s'insère au point de passage unique des outils (`ToolRegistry`), via un
adaptateur, sur le même patron que la garde d'idempotence :

```text
Appel d'outil
      │
      ▼
JevSafetyGate  (pré-filtre + jugement Jev)
      │
      ▼
ToolRegistry → Exécution
```

Composants pertinents :

```text
server/core/JevSafetyGate.ts     (adaptateur ToolRegistry ↔ Jev)
server/utils/jevGating.ts        (politique de gating + seuils)
server/utils/jevDecisions.ts     (questions typées posées à Jev)
scripts/jev-gate-calibrate.ts    (calibration des seuils)
```

## Pré-filtre : Jev n'est appelé que si nécessaire

Pour éviter des appels réseau inutiles et des faux positifs, le garde **ne
consulte Jev que** pour les actions réellement à risque système :

* les outils dont le nom correspond à une opération sensible (fichiers, shell,
  `push` distant), **ou**
* les appels portant effectivement un chemin, une commande ou une URL.

Les outils sur l'état interne de l'application (mémoire, mission, lecture) passent
sans appel ni jugement.

## Décision

Jev renvoie des probabilités sur des catégories de risque typées
(`destructive_data`, `security_control`, `production_or_infra`, `exfiltration`, ou
`none`) ainsi qu'une probabilité d'irréversibilité. Une politique **pure**
(`decideGate`) traduit ces probabilités en une action :

```text
Risque net et confiant   → block   (bloqué)
Risque probable / incertain ou action irréversible → review
Action ordinaire réversible → allow
```

Comme la politique est pure et déterministe, les seuils sont **rejouables** sur
des jugements déjà payés — d'où le script de calibration.

## Modes

Le comportement est piloté par la variable d'environnement
`LEANNA_SAFETY_GATE` :

```text
off       désactivé (défaut) — comportement strictement inchangé
audit     évalue et journalise les verdicts SANS jamais bloquer
enforce   bloque les actions jugées risquées
```

En mode `enforce`, le garde est **fail-closed** : en cas de panne, d'erreur ou
d'absence de clé OpenRouter, l'action est mise en revue (donc bloquée) plutôt que
laissée passer.

## Configuration

```env
# off | audit | enforce
LEANNA_SAFETY_GATE="off"
```

Le garde réutilise la même `OPENROUTER_API_KEY` que le reste de l'application.

## Calibration des seuils

Les seuils de décision (`GATE_THRESHOLDS`) peuvent être calibrés sur un jeu
d'exemples labellisés. Chaque exemple est jugé une seule fois par Jev, puis
différents seuils candidats sont rejoués sur ces réponses sans nouvel appel
réseau :

```bash
npm run jev:calibrate
# ou en ciblant un modèle
npx tsx scripts/jev-gate-calibrate.ts --model typesafe/jev-latest
```

---

# Permissions

Le runtime utilise des catégories de permission incluant :

```text
read
write
network
exec
dangerous
```

Exemples :

### read

Lecture des fichiers ou informations du projet.

### write

Modification de fichiers ou de données persistantes du projet.

### network

Accès aux services externes.

### exec

Exécution de commandes ou de processus.

### dangerous

Opérations considérées comme particulièrement destructrices ou sensibles.

La configuration par défaut indiquée par `.env.example` accorde :

```text
read
write
network
exec
```

tout en gardant `dangerous` en dehors de l'ensemble de permissions recommandé par défaut.

---

# Application des permissions

Le runtime prend en charge différents modes de permission.

```text
enforce
audit
off
```

## enforce

Les opérations non autorisées sont rejetées.

## audit

Les opérations peuvent se poursuivre tandis que leur usage est enregistré.

## off

L'application des permissions est désactivée.

Pour les environnements de production, `enforce` est la configuration renforcée prévue.

---

# Modes d'autonomie

Leanna sépare **ce qu'un agent est autorisé à faire** de **la manière autonome dont il peut le faire**.

La configuration de l'environnement expose :

```text
suggest
ask
auto
```

## Suggest

Le système propose des actions sans les exécuter.

```text
Objectif
 ↓
Plan
 ↓
Suggestion
 ↓
Humain
```

## Ask

Le système peut agir, mais requiert une approbation là où la politique l'exige.

```text
Objectif
 ↓
Plan
 ↓
Action nécessitant une approbation
 ↓
Approbation humaine
 ↓
Exécution
```

## Auto

Le runtime peut exécuter les opérations permises de façon autonome tandis que les autres mécanismes de sécurité restent actifs.

```text
Objectif
 ↓
Plan
 ↓
Autorisation
 ↓
Exécution
 ↓
Vérification
```

L'interface expose également des niveaux d'autonomie correspondant conceptuellement à :

```text
Manuel
Semi
Autonome
```

Ces contrôles doivent être compris conjointement avec la politique de permission, les restrictions du bac à sable et l'autorisation au niveau des outils.

---

# Bac à sable et exécution sûre

Leanna inclut une infrastructure de bac à sable (sandbox) pour contraindre les opérations.

Les composants pertinents incluent :

```text
server/utils/sandbox.ts
server/utils/sandboxWatcher.ts
server/runtime/AuthorizationGate.ts
```

Lorsque le bac à sable est actif, les chemins cibles sont validés avant les opérations sensibles sur le système de fichiers.

Le but est d'empêcher un agent de sortir des limites prévues du projet.

Le runtime combine :

```text
Permission
+
Autonomie
+
Bac à sable
+
Approbation
```

plutôt que de s'appuyer sur un seul mécanisme de sécurité.

---

# Exécution à blanc (Dry Run)

Leanna fournit un mode d'exécution à blanc global.

Lorsqu'il est activé :

```text
Opérations en lecture seule
    ↓
S'exécutent normalement

Opérations à effets de bord
    ↓
Interception
    ↓
Non exécutées
```

Les classes d'opérations à effets de bord incluent les opérations impliquant :

* l'écriture ;
* l'exécution ;
* l'activité réseau.

L'exécution à blanc peut être activée globalement via :

```env
Leanna_DRY_RUN="true"
```

ou au niveau de la mission là où c'est pris en charge.

L'exécution à blanc est particulièrement utile pour :

* tester des plans ;
* déboguer des agents ;
* évaluer la sélection d'outils ;
* valider des workflows ;
* tester en toute sécurité des missions autonomes.

---

# Kill-switch temps-réel (AbortSignal)

En plus du budget par action, le runtime prend en charge une **annulation
temps-réel** : un `AbortSignal` est propagé jusqu'au `ToolRegistry` et jusqu'au
handler d'outil.

```text
server/runtime/ToolRegistry.ts   ToolCallOptions.signal?: AbortSignal
```

Le comportement :

```text
Appel d'outil (options.signal)
      │
   signal déjà déclenché ?
      ├── oui → court-circuit : ni cache, ni simulation, ni exécution
      │
      └── non → exécution
                 │
            signal déclenché pendant l'exécution ?
                 ↓
            call() se résout en erreur SANS attendre la fin du handler ;
            le handler coopératif reçoit le même signal et libère ses ressources
```

Deux propriétés importantes :

* une annulation **ne se retente jamais** — le kill-switch est immédiat et
  définitif pour cet appel ;
* l'arrêt par annulation (`ToolAbortedError`) est **distinct** d'un timeout
  (`ToolTimeoutError`) : ici l'arrêt est volontaire.

Cela complète le kill-switch *par action* (vérification de budget en tête de
`Executor.executeAction`) par une interruption qui agit **pendant** une action
longue, et non uniquement entre deux actions.

---

# Idempotence et reprise sûre après crash (ExecutionLedger)

Un crash survenant **après** un effet de bord (écriture fichier, appel
GitHub/FTP/shell…) mais **avant** l'enregistrement du résultat pourrait conduire à
rejouer l'action à la reprise. Pour une action destructive, c'est inacceptable.

La garde d'idempotence s'appuie sur un **journal append-only, durable et local** :

```text
server/core/ExecutionLedger.ts   Journal .Leanna/core/ledger/actions.jsonl
```

Chaque action reçoit une `idempotencyKey` déterministe
(`missionId:stepId:tool:argsHash`, l'empreinte des arguments étant un SHA-256
stable à clés triées). Avant d'exécuter, le ledger décide :

```text
begin(action)
   │
   ├── clé déjà « completed »              → skip  (retourne le résultat mémorisé)
   │
   ├── clé « started » orpheline (crash)
   │     └── l'action a un effet de bord   → block (rejeu interdit)
   │     └── sans effet de bord            → execute
   │
   └── inédite / « failed »                → execute, puis complete/fail
```

À la reprise, les entrées `started` sans terminaison sont considérées comme
interrompues par un crash (statut `unknown`) et ne sont **pas rejouées
aveuglément** si l'action porte un effet de bord. Le ledger ne connaît pas les
outils : l'appelant fournit le flag `sideEffect`, dérivé des permissions de
l'outil (`write` / `exec` / `network` / `dangerous`).

La garde est branchée sur le point de passage unique des outils (`ToolRegistry`)
via un hook optionnel : aucun outil n'est impacté si le ledger n'est pas
configuré. Elle s'active via `.env` :

```env
# Idempotence (ledger d'exécution + reprise sûre après crash).
LEANNA_IDEMPOTENCY="false"
```

---

# Protection contre l'injection de prompt

Le dépôt contient une protection dédiée contre l'injection de prompt :

```text
server/utils/promptInjectionGuard.ts
```

C'est important car les systèmes agentiques consomment du contenu potentiellement non fiable provenant de :

* fichiers source ;
* pages web ;
* documents ;
* dépôts ;
* services externes ;
* contenu généré.

Le modèle de sécurité distingue donc :

```text
Instructions de l'utilisateur / de confiance
```

et :

```text
Contenu externe non fiable
```

L'exécution d'un agent ne doit pas interpréter aveuglément un contenu arbitraire comme des instructions faisant autorité.

---

# Approbation et confirmation

Les opérations sensibles peuvent passer par des mécanismes de confirmation.

Le dépôt inclut :

```text
confirmationBridge.ts
CriticalEditConfirm.tsx
usePendingApprovals.ts
```

Cela permet à l'interface de bureau de faire apparaître les opérations nécessitant une approbation explicite de l'utilisateur.

Le principe est :

```text
L'agent décide
      ↓
La politique évalue
      ↓
Approbation requise ?
      │
   ┌──┴──┐
   │     │
  OUI    NON
   │     │
   ▼     ▼
Humain  Exécuter
   │
   ▼
Exécuter
```

---

# Points de contrôle et récupération

Leanna inclut une infrastructure de points de contrôle (checkpoints) pour préserver l'état d'exécution et prendre en charge la récupération.

Les composants pertinents incluent :

```text
checkpoint.ts
CheckpointPanel.tsx
AutonomyPersistence.ts
```

C'est particulièrement important pour les tâches autonomes de longue durée où l'exécution ne doit pas être traitée comme une seule opération indivisible.

---

# Observabilité

Un agent autonome doit être observable.

Leanna inclut donc des composants d'observabilité au runtime.

```text
server/observability/TelemetryService.ts
server/runtime/Observability.ts
server/runtime/EventBus.ts
```

Le runtime expose des informations sur :

* les agents ;
* les outils ;
* les tâches ;
* les événements ;
* la mémoire ;
* l'état des processus ;
* les appels d'outils ;
* les échecs ;
* la durée d'exécution ;
* l'état d'autonomie ;
* la fiabilité.

Des routes de métriques exposent les informations du runtime sous l'API.

---

# Événements du runtime

Le système d'événements permet de propager l'état d'exécution à travers l'application.

Conceptuellement :

```text
Outil
 ↓
Événement runtime
 ↓
EventBus
 ↓
Agent / UI / Observabilité
```

Cela permet à l'interface d'afficher :

* l'activité des agents ;
* la progression des tâches ;
* l'exécution des outils ;
* la chronologie de l'autonomie ;
* les notifications ;
* l'état du runtime.

---

# Environnement de bureau

Leanna est packagé comme une application de bureau utilisant Electron.

La couche Electron contient :

```text
electron/main.cjs
electron/preload.cjs
electron/splash.html
electron/splash.css
```

Le frontend est construit avec React et Vite.

L'application combine :

```text
Electron
   +
React
   +
Vite
   +
Node.js
   +
Runtime serveur Express
```

<br><img src="https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.png" alt="separator" width="100%"><br>

## 💻 IDE et espace de travail

Leanna contient un environnement de développement intégré.

L'interface inclut des composants pour :

* l'explorateur de fichiers ;
* les onglets d'éditeur ;
* l'édition de code ;
* la visualisation des diffs ;
* le terminal ;
* GitHub ;
* Git ;
* le navigateur ;
* les missions ;
* les agents ;
* les compétences ;
* les workflows ;
* la mémoire ;
* la connaissance ;
* les notebooks ;
* les journaux ;
* l'observabilité ;
* les paramètres ;
* l'édition des variables d'environnement (`.env`).

Les zones frontend pertinentes incluent :

```text
src/views/
src/components/ide/
src/components/panels/
src/components/settings/
```

---

# Modèle d'espace de travail

Leanna est conçu autour d'un contexte de projet/espace de travail.

L'espace de travail fournit la limite pour :

* les opérations sur les fichiers ;
* la compréhension du code ;
* l'indexation des connaissances ;
* la mémoire ;
* les missions ;
* l'exécution des agents ;
* les opérations Git ;
* la vérification.

Ce contexte est essentiel car un agent a besoin de savoir **sur quel projet il opère**.

---

# Intelligence de la base de code

Le sous-système de base de code contient des outils pour :

* lire des fichiers ;
* écrire des fichiers ;
* naviguer dans le code source ;
* analyser la structure du projet ;
* rechercher ;
* analyser les dépendances ;
* vérifier ;
* intégrer Git.

Le dépôt contient des compétences et des utilitaires dédiés à la base de code :

```text
server/skills/codebase.ts
server/skills/codebaseReader.ts
server/skills/codebaseWriter.ts
server/skills/codebaseHelpers.ts
```

---

# Automatisation du navigateur

Leanna inclut une infrastructure d'automatisation du navigateur.

Les composants serveur pertinents incluent :

```text
server/routes/browser.ts
server/skills/browser.ts
server/skills/automation.ts
server/skills/automationBrowser.ts
```

La prise en charge de Puppeteer est également représentée dans la configuration du projet.

L'automatisation du navigateur peut être utilisée pour des workflows où l'agent doit interagir avec des sites web plutôt que de simplement récupérer des informations textuelles.

Pour les déploiements sensibles à la sécurité, des restrictions de domaine peuvent être configurées via :

```env
AUTOMATION_ALLOWED_DOMAINS=""
```

---

# Navigateur intégré

En complément de l'automatisation pilotée par l'agent, Leanna embarque un **navigateur web intégré** (via `<webview>` Electron) utilisable directement depuis l'IDE. L'agent peut le piloter (navigation, clics, saisie, extraction de contenu) tandis que l'utilisateur garde la main sur la barre d'adresse et les contrôles.

Les composants pertinents côté interface incluent :

```text
src/components/panels/BrowserPanel.tsx          # orchestrateur : onglets + barre d'outils
src/components/panels/BrowserTabView.tsx         # une <webview> persistante par onglet
src/components/panels/BrowserTabStrip.tsx        # barre d'onglets
src/components/panels/BrowserToolbar.tsx
src/components/panels/BrowserProfileSwitcher.tsx
src/components/panels/BrowserExtensionsMenu.tsx
src/components/panels/useBrowserHistory.ts
src/components/panels/useBrowserProfiles.ts
src/components/panels/useBrowserExtensions.ts
```

Côté serveur, les outils du navigateur et la recherche web vivent dans :

```text
server/skills/browser.ts            # 28 outils browser_* exposés à l'agent
server/skills/webSearchProvider.ts  # recherche + lecture de pages 100 % serveur
```

## Onglets multiples

Le navigateur gère **plusieurs onglets**, chacun porté par sa propre `<webview>` persistante : les onglets inactifs restent chargés (masqués via CSS) et ne sont pas rechargés au retour.

* barre d'onglets avec sélection, fermeture (croix ou clic molette) et bouton « nouvel onglet » (masquée tant qu'un seul onglet est ouvert) ;
* l'onglet actif pilote la barre d'outils ; l'agent agit toujours sur l'onglet actif ;
* les popups / `target="_blank"` (refusés côté processus principal) sont rouverts dans un **onglet d'arrière-plan** plutôt qu'une fenêtre non contrôlée ;
* l'agent peut ouvrir un onglet via l'outil `browser_new_tab` (`url`, `activate`).

## Historique et autocomplétion

* l'historique de navigation est persisté localement (`localStorage`) ;
* la barre d'adresse propose des **suggestions d'autocomplétion** classées par pertinence (correspondance en préfixe, fréquence de visite, récence) ;
* navigation au clavier dans les suggestions (flèches, Entrée, Échap) ;
* une action permet d'**effacer l'historique**.

## Indicateurs de sécurité

La barre d'adresse signale distinctement les connexions **sécurisées (HTTPS)** et **non sécurisées (HTTP)** via une icône dédiée et un libellé accessible.

## Profils multiples (sessions isolées)

Chaque profil correspond à une **partition de session Electron** (`persist:browser-<id>`), ce qui cloisonne **cookies, cache et stockage local** d'un profil à l'autre.

* création, renommage et suppression de profils ;
* bascule entre profils depuis la barre d'outils ;
* un « Profil par défaut » toujours présent et non supprimable ;
* la liste des profils et le profil actif sont persistés localement.

> Changer de profil remonte la `<webview>` : l'attribut `partition` d'un `<webview>` Electron est immuable une fois l'élément attaché.

## Extensions Chromium

Leanna prend en charge le chargement d'**extensions Chromium décompressées** dans le navigateur intégré, par profil (donc isolées par partition de session).

* chargement d'une extension via un sélecteur de dossier (dossier contenant un `manifest.json`) ;
* liste et suppression des extensions chargées ;
* les chemins d'extensions sont persistés dans `userData/browser-extensions.json` et rechargés automatiquement au démarrage.

Le pont vers le process principal passe par des handlers IPC dédiés :

```text
electron/main.cjs     → electron/browser-extensions-list | -load | -remove
electron/preload.cjs  → window.electronAPI.browserExtensions{List,Load,Remove}
```

> Electron ne prend en charge qu'un **sous-ensemble** de l'API Chrome Extensions et uniquement des extensions **décompressées** (pas d'installation directe depuis le Chrome Web Store). Hors environnement Electron (mode dev web), le menu Extensions est automatiquement masqué.

## Recherche web côté serveur

En plus de la recherche dans la webview visible, Leanna dispose d'une recherche **100 % serveur** (`webSearchProvider.ts`), beaucoup plus rapide et robuste pour collecter de l'information factuelle :

* recherche via DuckDuckGo HTML avec extraction des **vrais liens** (décodage du paramètre `uddg`, pas d'URL tronquée) et détection des pages anti-bot ;
* **lecture des pages en parallèle** côté serveur (`fetch` + extraction « mode lecture » qui privilégie `<main>`/`<article>`), sans détourner le navigateur de l'utilisateur ;
* garde **SSRF stricte** avant toute requête (web public uniquement, jamais localhost ni IP privée/mappée) ;
* tout texte externe est neutralisé contre l'injection de prompt ;
* exposé à l'agent via l'outil `browser_web_search` (`query`, `maxSources`, `read`), avec sources structurées, consensus, contradictions et score de confiance.

## Débogage : console, réseau et vision

Pour qu'un agent puisse diagnostiquer un aperçu de projet, le navigateur capte le contexte d'exécution de la page :

* **`browser_get_console`** — journal `console.log/warn/error` et échecs de ressources réseau de la page affichée, filtrables par niveau (`all`/`warn`/`error`) ;
* **`browser_capture`** — capture visuelle de la page (`capturePage()`) puis **analyse multimodale réelle** par un modèle de vision (l'image est transmise en `inlineData`, pas en texte), pour « que vois-tu sur cette page ? », vérifier un rendu ou comparer à une maquette.

## Durcissement sécurité (processus principal)

Le `<webview>` charge des pages arbitraires ; le processus principal Electron applique donc plusieurs gardes :

* `will-attach-webview` force `nodeIntegration:false`, `contextIsolation:true`, `sandbox:true`, et n'autorise que les partitions de profil connues ;
* permissions refusées par défaut (caméra, micro, géolocalisation, notifications, USB…) ;
* popups / nouvelles fenêtres refusées (`setWindowOpenHandler`) et relayées en onglet ;
* téléchargements silencieux bloqués, certificats invalides jamais contournés ;
* l'ouverture externe (`openExternal`) applique une **allowlist** `http`/`https`/`mailto`.

## Catalogue d'outils agent (`browser_*`)

Le navigateur expose **28 outils** à l'agent, dont :

* navigation : `browser_navigate`, `browser_open`, `browser_close`, `browser_back`, `browser_forward`, `browser_reload`, `browser_scroll`, `browser_new_tab` ;
* lecture / recherche : `browser_read_content`, `browser_summarize_page`, `browser_get_links`, `browser_open_link`, `browser_search`, `browser_research`, `browser_web_search` ;
* interaction : `browser_click`, `browser_type`, `browser_fill_form`, `browser_select_option`, `browser_click_by_role`, `browser_type_by_label` ;
* inspection : `browser_snapshot`, `browser_inspect`, `browser_get_accessibility_snapshot`, `browser_get_element_text`, `browser_get_element_attribute`, `browser_wait_for` ;
* diagnostic : `browser_get_console`, `browser_capture`.

<br><img src="https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.png" alt="separator" width="100%"><br>

## 🔀 Git et GitHub

Leanna intègre Git et GitHub dans l'environnement de développement.

Les capacités incluent :

* l'état Git ;
* les branches ;
* les commits ;
* les opérations sur les dépôts ;
* les interactions avec GitHub ;
* la publication des modifications de l'espace de travail ;
* les workflows liés aux dépôts.

Les composants pertinents incluent :

```text
server/skills/git.ts
server/skills/github.ts
server/routes/github.ts
src/components/github/
src/views/GitHubView.tsx
```

L'interface inclut également une fonctionnalité de publication GitHub.

<br><img src="https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.png" alt="separator" width="100%"><br>

## 📓 Notebooks et RAG

Leanna inclut un système de connaissance orienté notebook.

Le sous-système de notebook contient :

```text
NotebookManager
SourceIngester
EmbeddingStore
RAGEngine
GroundedChat
ProcessingQueue
ResponseCache
ContentGenerator
BackupService
```

Cela permet des workflows tels que :

```text
Documents
   ↓
Ingestion
   ↓
Extraction
   ↓
Embeddings
   ↓
Récupération
   ↓
Contexte ancré (grounded)
   ↓
Génération IA
```

La fonctionnalité de notebook peut être utilisée pour organiser des connaissances externes indépendamment de l'espace de travail de la base de code.

---

# Intelligence documentaire

Le système de documents prend en charge :

* l'ingestion de documents ;
* l'extraction de contenu ;
* l'analyse de documents ;
* la recherche de documents ;
* la mémoire de documents ;
* la gestion des sources.

Le frontend contient :

```text
DocumentsView
NotebookDetail
SourcePanel
SourceViewer
SourcesSummaryCard
DocumentUpload
RichDocumentViewer
```

<br><img src="https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.png" alt="separator" width="100%"><br>

## 🎙️ Assistant vocal du notebook

Leanna dispose d'un **second assistant vocal live**, indépendant de l'assistant global, dédié à l'interrogation et à la génération de documents à partir des sources du notebook.

## Principe

L'utilisateur peut poser des questions à la voix, directement depuis le notebook, et obtenir des réponses **vocales** fondées exclusivement sur les sources du notebook (chat groundé). L'assistant peut également **générer des documents** à la demande (rapport, résumé, FAQ, guide d'étude, etc.) et les enregistrer dans l'historique des générations.

```text
Micro utilisateur
       ↓
  WebSocket /notebook-live
       ↓
  Session Gemini Live (audio bidirectionnel)
       ↓
  Outil notebook_search → RAG (searchHybrid + buildContext)
  Outil generate_document → ContentGenerator.generate
       ↓
  Réponse vocale groundée avec citations
```

## Architecture

La session vocale du notebook est **indépendante** de la session Live globale de Leanna. Elle dispose de son propre handler WebSocket (`/notebook-live`), de sa propre session Gemini Live, et de son propre pipeline audio. Les deux sessions ne partagent aucun état — l'assistant global est mis en sourdine pendant qu'une session notebook est active.

### Serveur

```text
server/live/NotebookLiveSocketHandler.ts
  └── attachNotebookLiveWebSocket(wss, deps)
      ├── Session Gemini Live (modèle gemini-3.8-live, audio bidirectionnel)
      ├── Outil notebook_search  → ragEngine.searchHybrid
      └── Outil generate_document → contentGenerator.generate
```

Le chemin WebSocket est `/notebook-live?notebookId=<id>&sources=<csv optionnel>`, avec authentification par cookie identique au handler Live global.

### Frontend

```text
src/components/notebooks/chat/
  ├── useNotebookLive.ts       Hook de session (WebSocket, useAudio, transcription)
  └── NotebookVoicePanel.tsx   Bouton micro + indicateur d'amplitude + mute
```

Le bouton « Interroger à la voix » est placé dans la `ThreadBar`, à côté du bouton « Nouveau ». L'indicateur d'amplitude animé (barres + anneaux) réagit au niveau audio d'entrée (écoute) et de sortie (réponse).

## Outils disponibles

| Outil | Description |
|-------|-------------|
| `notebook_search` | Recherche RAG hybride (embeddings + TF-IDF) dans les sources du notebook. Appelé automatiquement avant chaque réponse factuelle. Renvoie le contexte groundé + les citations. |
| `generate_document` | Génère un document dérivé des sources (21 types : résumé, FAQ, guide d'étude, briefing, chronologie, plan, carte mentale, SWOT, glossaire, rapport complet, rapports spécialisés…). Le document est enregistré dans l'historique des générations et apparaît dans la barre de progression du panneau « Générer ». |

## Retour vocal intermédiaire

La génération d'un document peut prendre 10 à 20 secondes. Pour ne pas bloquer l'assistant pendant ce temps, l'outil `generate_document` retourne **immédiatement** une réponse au modèle (« annonce que tu prépares le document »), lance la génération en arrière-plan, puis injecte un tour de confirmation vocale une fois le document prêt (ou un message d'erreur en cas d'échec).

## Ajout aux sources

Les documents générés peuvent être **promus en sources** du notebook via un bouton dans l'historique des générations. Une fois promu, le document est chunké, vectorisé (embeddings) et devient interrogeable par l'assistant vocal et le chat groundé, sans reconnexion.

```text
Endpoint : POST /api/notebooks/:id/generated/:docId/add-to-sources
```

## Synchronisation en direct

Les événements de génération vocale (`document_generating`, `document_generated`, `document_generation_error`) sont relayés au frontend via des CustomEvents, ce qui permet :

* la mise à jour en direct de la barre de progression du panneau « Générer » ;
* le rafraîchissement automatique de l'historique des générations ;
* l'incrémentation du badge de compteur sans recharger le notebook (ce qui démonterait la session vocale).

---

# Architecture du module notebooks (frontend)

Le module `src/components/notebooks/` suit une architecture **orchestrateur /
hooks / composants présentationnels**. Chaque panneau est un orchestrateur mince
qui détient l'état et délègue la logique à des hooks dédiés, puis rend des
composants purement présentationnels. L'objectif : des fichiers courts (< 400
lignes), une logique testable isolément et un comportement identique à
l'implémentation d'origine.

Les grands panneaux sont découpés en sous-modules :

```text
notebooks/
├── api/            Client fetch typé, flux SSE, hook useResource
├── chat/           NotebookChat : ThreadBar, MessageList, MessageItem,
│                   Composer, FolderPickerModal, NotebookVoicePanel
│                   + hooks (useChatStream, useChatThreads,
│                   useChatGenerators, useTts, useNotebookLive, …)
├── sources/        SourcePanel : UploadToolbar, UploadQueue,
│                   SourceListFull / SourceListCompact + hooks d'upload/liste
├── generation/     GeneratePanel : DocTypePicker, DocViewer,
│                   GenerationProgress, ReportModal, InfographicModal
│                   + useGenerationQueue
├── audio/          AudioOverviewPanel : AudioGenerator, AudioPlayer,
│                   useTtsPlayer
├── motion.ts       Constantes de transition (spring) partagées
└── motionTypes.ts  Types d'animation partagés (design system)
```

## Performance

Le module applique plusieurs optimisations ciblées :

* **Code-splitting (`React.lazy`)** : les composants lourds affichés uniquement
  sur action explicite sont chargés paresseusement, ce qui les sort du bundle
  initial — `MermaidDiagram` (diagrammes, via `import()` dynamique de `mermaid`),
  `GitHubRepositoryImportModal` et `SlidePreviewModal`.
* **Virtualisation** : `SourceListFull` bascule sur une liste fenêtrée
  (`react-window`) au-delà d'un seuil de sources ; en-dessous, la liste animée
  d'origine est conservée.
* **Mémoïsation ciblée** : les éléments de liste sont mémoïsés et les
  handlers passés en props sont référentiellement stables (lecture via refs)
  pour éviter les re-rendus inutiles.

## Tests et qualité

Le module est couvert par des **tests de caractérisation** (Vitest + React
Testing Library, environnement jsdom) qui verrouillent le comportement observable
des panneaux et de la bascule de virtualisation. Les barrières de qualité du
module :

```bash
npm run test:ui                 # tests front (Vitest + RTL)
npm run typecheck:test          # typage des fichiers de test
npm run lint:eslint:notebooks   # lint ESLint du module notebooks
```

<br><img src="https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.png" alt="separator" width="100%"><br>

## 🖼️ Génération d'images

Leanna peut générer des images à la demande à partir d'une description en langage naturel.

L'utilisateur décrit l'image souhaitée dans le chat, Leanna la génère, l'enregistre dans le bac à sable, puis l'affiche directement dans le panneau de chat.

## Flux d'exécution

```text
Description utilisateur
        ↓
   generate_image
        ↓
   OpenRouter (modèle image)
        ↓
   Image (base64)
        ↓
 ┌──────┴───────┐
 ▼              ▼
Sauvegarde    Affichage
bac à sable   panneau de chat
(generated-   (inline)
 images/)
```

L'outil `generate_image` fait partie du registre d'outils (compétence `imageGeneration`) et est exposé comme outil de base, donc disponible sans configuration supplémentaire.

## Caractéristiques

* déclenché à la demande par une description en langage naturel ;
* génération via **OpenRouter** (modèle image de type Gemini par défaut) ;
* paramètres optionnels : `style`, `aspectRatio` (1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3) et `model` ;
* image enregistrée dans le bac à sable sous `generated-images/` et suivie comme modification ;
* affichage **inline** dans le panneau de chat, avec une barre de progression pendant la génération ;
* retour d'échange léger vers le modèle : les données d'image ne transitent pas par le LLM.

## Configuration

La génération d'images nécessite une clé OpenRouter :

```env
OPENROUTER_API_KEY="..."
```

Le modèle image peut être surchargé :

```env
OPENROUTER_IMAGE_MODEL="google/gemini-3.8-flash-image-preview"
```

À défaut, `OPENROUTER_FREE_API_KEY` est également pris en compte.

## Sécurité de l'affichage

Les images générées sont rendues via le sanitizer Markdown du chat, qui n'autorise que les images en data-URI de type raster (`png`, `jpeg`, `gif`, `webp`) et les chemins relatifs. Les sources `svg`, `javascript:` et les hôtes externes arbitraires sont rejetés.

---

# Graphe de connaissances

Le graphe de connaissances et les systèmes Notebook/RAG servent des objectifs différents.

Le graphe de connaissances concerne principalement les **relations structurées du projet**.

Le sous-système Notebook/RAG concerne principalement la **connaissance ancrée dans les documents**.

Conceptuellement :

```text
BASE DE CODE
   ↓
Graphe de connaissances
   ↓
Compréhension du projet

DOCUMENTS
   ↓
RAG / Notebook
   ↓
Connaissance ancrée
```

Les deux peuvent contribuer au contexte des workflows IA.

<br><img src="https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.png" alt="separator" width="100%"><br>

## 🗺️ Workflows et automatisation

Leanna inclut un moteur de workflow et un sous-système d'automatisation.

Les composants backend pertinents incluent :

```text
server/runtime/WorkflowEngine.ts
server/routes/workflows.ts
server/skills/workflow.ts
server/skills/automation.ts
```

Le frontend inclut un constructeur de workflow visuel.

Les workflows peuvent représenter des séquences d'actions répétables.

Conceptuellement :

```text
Déclencheur
  ↓
Condition
  ↓
Action
  ↓
Action
  ↓
Vérification
  ↓
Résultat
```

---

# Tâches planifiées

Le dépôt inclut une infrastructure de tâches planifiées.

L'application peut donc distinguer entre :

```text
Tâche interactive
```

et :

```text
Tâche planifiée / automatisée
```

C'est important pour les workflows opérationnels de plus longue durée.

<br><img src="https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.png" alt="separator" width="100%"><br>

## 🔌 MCP

Leanna inclut une infrastructure **Model Context Protocol (MCP)** qui permet de connecter des serveurs d'outils et de ressources externes, puis d'exposer leurs outils directement à l'assistant IA.

Les composants pertinents incluent :

```text
server/mcp/McpClient.ts          Client MCP (transports stdio + HTTP)
server/mcp/McpBridge.ts          Orchestrateur multi-serveurs + adaptateur Skill
server/mcp/mcpConfig.ts          Persistance .Leanna/mcp.json
server/routes/mcp.ts             API REST de gestion des serveurs
server/routes/mcp-directory.ts   Proxy vers l'annuaire public MCP Harbor
```

MCP fournit un mécanisme d'extensibilité : chaque serveur connecté expose ses outils, que le `McpBridge` agrège et convertit en déclarations utilisables par le modèle.

Conceptuellement :

```text
Assistant Leanna
     │
     ▼
SkillManager (skill « mcp »)
     │
     ▼
   McpBridge
     │
     ├──► Client MCP ──► Serveur MCP (stdio)   ──► Outils / Ressources
     │
     └──► Client MCP ──► Serveur MCP (HTTP/SSE) ──► Outils / Ressources
```

## Transports pris en charge

* **stdio** — le serveur est lancé comme sous-processus (ex. `npx`, `uvx`, `docker`) et communique en JSON-RPC newline-delimited. Sur Windows, les wrappers `.cmd` (npx, uvx…) sont lancés via un shell avec arguments quotés pour éviter l'erreur `spawn EINVAL` des versions récentes de Node.
* **HTTP** — deux variantes gérées automatiquement :
  * **Streamable HTTP** (standard actuel) : les messages JSON-RPC partent en POST, la réponse revient en JSON ou en flux SSE dans le même POST. Le header `Mcp-Session-Id` est capturé et réémis.
  * **HTTP with SSE** (legacy) : un flux GET persistant démarre par un événement `endpoint`.
  Le client tente le flux GET, puis bascule en Streamable HTTP si le serveur répond `405`/`404`/`406`.

## Annuaire MCP Harbor

Leanna intègre l'annuaire public [MCP Harbor](https://ai.mcpharbor.dev), qui permet de parcourir, rechercher et installer des serveurs MCP gratuits en un clic. Les appels passent par un proxy backend (jamais d'appel direct depuis le frontend).

```text
GET  /api/mcp/directory           Recherche (q, transport, tag, limit, offset)
POST /api/mcp/directory/install   Installe un serveur par son nom Harbor
```

À l'installation, le manifeste Harbor est converti en configuration locale :

```text
remotes[streamable-http|sse]  →  { transport: "sse", url }
packages[npm]                 →  { transport: "stdio", command: "npx",   args: ["-y", <id>] }
packages[pypi]                →  { transport: "stdio", command: "uvx",    args: [<id>] }
packages[oci]                 →  { transport: "stdio", command: "docker", args: ["run","-i","--rm",<id>] }
```

Les variables d'environnement requises sont créées vides dans `.Leanna/mcp.json` ; l'utilisateur les renseigne ensuite (aucun secret n'est journalisé).

L'annuaire est accessible depuis le panneau MCP de l'interface via le bouton **Parcourir l'annuaire**.

## Exposition à l'assistant

Au démarrage, le `McpBridge` est initialisé et enregistre une skill `mcp` auprès du `SkillManager`. Les outils des serveurs connectés (statut `ready`) sont alors :

* agrégés par le bridge (`getAllTools`) ;
* convertis en déclarations Gemini, avec des noms normalisés (`[a-zA-Z0-9_]`) — un mapping retraduit le nom au moment de l'appel ;
* toujours inclus dans les déclarations envoyées au modèle, quel que soit le mode ;
* re-synchronisés automatiquement à chaque (dé)connexion d'un serveur (événement `toolsChanged`).

Les appels d'outils MCP transitent par le sandboxing des chemins du bridge, comme les autres outils à effet de bord.

## Configuration

Les serveurs sont persistés dans `.Leanna/mcp.json` :

```json
{
  "mcpServers": {
    "context7": {
      "name": "Context7",
      "transport": "sse",
      "url": "https://mcp.context7.com/mcp",
      "env": { "CONTEXT7_API_KEY": "" },
      "description": "Documentation de code à jour"
    }
  }
}
```

Un serveur peut aussi être ajouté, désactivé, reconnecté ou supprimé via le panneau MCP ou l'API REST (`/api/mcp/servers`).

---

# Telegram

Leanna inclut une intégration Telegram.

Les composants pertinents incluent :

```text
server/telegram/
server/routes/telegram.ts
server/skills/telegram.ts
```

Cela fournit un canal d'interaction externe pour le runtime de l'agent.

<br><img src="https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.png" alt="separator" width="100%"><br>

## 🧩 Fournisseurs d'IA

L'architecture prend en charge les fonctionnalités liées à Gemini et OpenRouter.

La configuration pertinente inclut :

```env
GEMINI_API_KEY=""
OPENROUTER_API_KEY=""
OPENROUTER_FREE_API_KEY=""
OPENROUTER_MODEL=""
OPENROUTER_IMAGE_MODEL=""
```

Le modèle de texte est configuré via `OPENROUTER_MODEL` et le modèle de génération d'images via `OPENROUTER_IMAGE_MODEL`.

Leanna contient également une infrastructure de repli (fallback) entre fournisseurs.

La configuration documentée prend en charge le repli automatique entre fournisseurs lorsqu'il est activé.

```env
LEANNA_PROVIDER_FALLBACK="true"
```

Un disjoncteur (circuit breaker) de fournisseur peut temporairement éviter un fournisseur après des échecs répétés.

---

# Supabase

Supabase est utilisé pour les données d'application persistantes et l'état du backend.

Le dépôt contient des schémas pour :

```text
tâches d'autonomie
conversations
compétences personnalisées
missions
tâches planifiées
utilisation des tokens
workflows
mémoires
```

L'environnement utilise :

```env
SUPABASE_URL=""
SUPABASE_ANON_KEY=""
SUPABASE_SERVICE_ROLE_KEY=""
```

La clé de rôle de service (service-role key) est un secret côté serveur et ne doit jamais être exposée au navigateur.

---

# Redis

Redis est optionnel pour plusieurs capacités distribuées du runtime.

Les usages possibles incluent :

* la mise en cache du graphe de connaissances ;
* les verrous distribués ;
* les flux d'événements ;
* la coordination multi-processus.

La configuration inclut :

```env
REDIS_URL=""
LEANNA_KNOWLEDGE_REDIS_URL=""
LEANNA_LOCK_REDIS_URL=""
LEANNA_EVENTBUS_REDIS_URL=""
```

Sans Redis, plusieurs composants peuvent revenir à un comportement local au processus ou persistant local selon le sous-système.

<br><img src="https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.png" alt="separator" width="100%"><br>

## 🏗️ Architecture du système

À un haut niveau :

```text
┌─────────────────────────────────────────────────────────────┐
│                         LEANNA DESKTOP                      │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                    Interface React                    │  │
│  │                                                       │  │
│  │ Chat │ IDE │ Agents │ Missions │ Mémoire │ Notebooks │  │
│  │ GitHub │ Navigateur │ Workflows │ Paramètres │ Logs  │  │
│  └──────────────────────────┬────────────────────────────┘  │
│                             │                               │
│                             ▼                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                    API / Serveur                      │  │
│  │                                                       │  │
│  │ Routes │ WebSockets │ Authentification │ Services     │  │
│  └──────────────────────────┬────────────────────────────┘  │
│                             │                               │
│                             ▼                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                  Runtime de l'agent                   │  │
│  │                                                       │  │
│  │ Agent Brain │ Missions │ Orchestration │ EventBus     │  │
│  │ Outils │ Compétences │ Mémoire │ Workflows │ Vérif.  │  │
│  └──────────────────────────┬────────────────────────────┘  │
│                             │                               │
│                             ▼                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Couche d'autorisation                    │  │
│  │                                                       │  │
│  │ Permissions │ Autonomie │ Bac à sable │ Dry Run │ App.│  │
│  └──────────────────────────┬────────────────────────────┘  │
│                             │                               │
│                             ▼                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                    Exécution                          │  │
│  │                                                       │  │
│  │ Fichiers │ Terminal │ Git │ Navigateur │ GitHub │ MCP │  │
│  │ Telegram │ Documents │ Services externes             │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

<br><img src="https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.png" alt="separator" width="100%"><br>

## 📂 Structure du dépôt

Le dépôt est organisé autour des principales zones suivantes :

```text
Leanna/
│
├── electron/
│   ├── main.cjs
│   ├── preload.cjs
│   └── splash.*
│
├── server/
│   │
│   ├── agents/
│   │   ├── AgentExecutor.ts
│   │   ├── AgentOrchestrator.ts
│   │   ├── AgentRegistry.ts
│   │   ├── AgentTaskRunner.ts
│   │   ├── AutonomousAgent.ts
│   │   ├── AutonomousLoop.ts
│   │   ├── DelegationManager.ts
│   │   ├── AgentRepairLoop.ts
│   │   └── brain/
│   │       ├── AgentBrain.ts
│   │       ├── GoalUnderstandingEngine.ts
│   │       ├── DynamicPlanner.ts
│   │       ├── BrainVerifier.ts
│   │       ├── BrainCorrectionLoop.ts
│   │       ├── BrainPlanValidator.ts
│   │       └── BrainScheduler.ts
│   │
│   ├── autonomy/
│   │   ├── LeannaCore.ts
│   │   ├── AutonomousExecutive.ts
│   │   ├── PerceptionEngine.ts
│   │   ├── Supervisor.ts
│   │   ├── TaskManager.ts
│   │   ├── HeartbeatService.ts
│   │   └── AutonomyPersistence.ts
│   │
│   ├── knowledge/
│   │   ├── KnowledgeGraph.ts
│   │   ├── DependencyGraph.ts
│   │   ├── ProjectMemory.ts
│   │   ├── SemanticSearch.ts
│   │   ├── StrategyMemory.ts
│   │   ├── UnderstandingEngine.ts
│   │   ├── ASTParser.ts
│   │   ├── ASTCallGraph.ts
│   │   ├── ImpactAnalyzer.ts
│   │   └── ProjectIndexer.ts
│   │
│   ├── mission/
│   │   ├── Mission.ts
│   │   ├── MissionStore.ts
│   │   ├── Planner.ts
│   │   ├── Executor.ts
│   │   ├── Reflection.ts
│   │   ├── AutonomyPolicy.ts
│   │   ├── SkillScorer.ts
│   │   └── PlanEstimator.ts
│   │
│   ├── runtime/
│   │   ├── AgentRuntime.ts
│   │   ├── ToolRegistry.ts
│   │   ├── PermissionPolicy.ts
│   │   ├── AuthorizationGate.ts
│   │   ├── DryRun.ts
│   │   ├── EventBus.ts
│   │   ├── StateMachine.ts
│   │   ├── WorkflowEngine.ts
│   │   ├── Memory.ts
│   │   ├── HierarchicalMemoryService.ts
│   │   ├── Observability.ts
│   │   ├── agentic/
│   │   ├── agents/
│   │   ├── prompts/
│   │   └── workflows/
│   │
│   ├── skills/
│   │   ├── codebase.ts
│   │   ├── browser.ts
│   │   ├── automation.ts
│   │   ├── git.ts
│   │   ├── github.ts
│   │   ├── memory.ts
│   │   ├── knowledge.ts
│   │   ├── reasoning.ts
│   │   ├── securityAudit.ts
│   │   ├── verify.ts
│   │   ├── workflow.ts
│   │   └── ...
│   │
│   ├── notebooks/
│   │   ├── NotebookManager.ts
│   │   ├── RAGEngine.ts
│   │   ├── EmbeddingStore.ts
│   │   ├── SourceIngester.ts
│   │   ├── GroundedChat.ts
│   │   └── ...
│   │
│   ├── mcp/
│   │   ├── McpClient.ts
│   │   ├── McpBridge.ts
│   │   └── mcpConfig.ts
│   │
│   ├── marketplace/
│   ├── telegram/
│   ├── routes/
│   │   ├── mcp.ts
│   │   ├── mcp-directory.ts
│   │   └── ...
│   ├── utils/
│   ├── observability/
│   └── config/
│
├── src/
│   ├── components/
│   │   ├── ide/
│   │   ├── panels/
│   │   ├── notebooks/
│   │   ├── settings/
│   │   ├── autonomy/
│   │   ├── github/
│   │   ├── sandbox/
│   │   └── ui/
│   │
│   ├── views/
│   ├── hooks/
│   ├── context/
│   ├── services/
│   ├── stores/
│   └── utils/
│
├── supabase/
│   ├── migrations/
│   ├── autonomy_tasks_schema.sql
│   ├── conversations_schema.sql
│   ├── custom_skills_schema.sql
│   ├── missions_schema.sql
│   ├── scheduled_tasks_schema.sql
│   ├── token_usage_schema.sql
│   └── workflows_schema.sql
│
├── scripts/
├── docs/
├── assets/
├── tests/
│
├── package.json
├── tsconfig.json
├── vite.config.ts
├── server.ts
├── server-bootstrap.ts
└── .env.example
```

<br><img src="https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.png" alt="separator" width="100%"><br>

## 🚀 Installation

## Prérequis

Environnement de développement recommandé :

* Node.js ;
* npm ;
* Git ;
* un fournisseur d'IA pris en charge ;
* Supabase pour les fonctionnalités backend persistantes.

---

## Cloner le dépôt

```bash
git clone https://github.com/moonback/Leanna.git

cd Leanna
```

---

## Installer les dépendances

```bash
npm install
```

---

# Configuration

Copier le modèle d'environnement :

```bash
cp .env.example .env
```

Sous Windows :

```powershell
Copy-Item .env.example .env
```

Le fichier `.env.example` contient la surface de configuration documentée.

---

# Variables d'environnement essentielles

## Serveur

```env
VITE_SERVER_PORT="4000"
Leanna_LISTEN_HOST="127.0.0.1"
LOG_LEVEL="info"
```

Le serveur par défaut se lie à localhost.

N'exposez pas le serveur au réseau local (LAN) sans comprendre les implications de sécurité.

---

# Fournisseur d'IA

Gemini :

```env
GEMINI_API_KEY=""
```

Configuration OpenRouter optionnelle :

```env
OPENROUTER_API_KEY=""
OPENROUTER_FREE_API_KEY=""
OPENROUTER_MODEL=""
OPENROUTER_IMAGE_MODEL=""
OPENROUTER_REFERER=""
OPENROUTER_TITLE=""
```

---

# Authentification

Leanna prend en charge un jeton d'API :

```env
Leanna_API_TOKEN=""
```

Si aucun jeton n'est configuré, l'application peut en générer un au démarrage selon la configuration du runtime.

Gardez ce secret.

Le jeton d'API protège l'accès à l'API de l'application et à la fonctionnalité WebSocket.

---

# Clé de chiffrement maître

Les informations sensibles peuvent être protégées à l'aide de :

```env
Leanna_MASTER_KEY=""
```

Cette clé doit être sauvegardée de manière sécurisée.

Si des données chiffrées dépendent de cette clé, la perte de la clé peut rendre ces données irrécupérables.

---

# Supabase

```env
SUPABASE_URL=""
SUPABASE_ANON_KEY=""
SUPABASE_SERVICE_ROLE_KEY=""
```

N'exposez jamais :

```env
SUPABASE_SERVICE_ROLE_KEY
```

au code frontend.

---

# Configuration de l'autonomie

```env
LEANNA_AUTONOMY_MODE="ask"
```

Modes disponibles :

```text
suggest
ask
auto
```

---

# Configuration des permissions

```env
Leanna_PERMISSION_MODE="enforce"
```

Permissions recommandées :

```env
Leanna_GRANTED_PERMISSIONS="read,write,network,exec"
```

Évitez d'accorder :

```text
dangerous
```

sauf si un workflow spécifique le requiert.

---

# Exécution à blanc (Dry Run)

```env
Leanna_DRY_RUN="false"
```

Pour une expérimentation sûre :

```env
Leanna_DRY_RUN="true"
```

---

# Repli entre fournisseurs (Provider Fallback)

```env
LEANNA_PROVIDER_FALLBACK="true"
LEANNA_PROVIDER_BREAKER_THRESHOLD="3"
LEANNA_PROVIDER_BREAKER_COOLDOWN_MS="60000"
```

---

# Redis

Optionnel :

```env
REDIS_URL=""
```

Configuration Redis spécialisée supplémentaire :

```env
LEANNA_KNOWLEDGE_REDIS_URL=""
LEANNA_LOCK_REDIS_URL=""
LEANNA_EVENTBUS_REDIS_URL=""
```

---

# Automatisation du navigateur

Restrictions de domaine optionnelles :

```env
AUTOMATION_ALLOWED_DOMAINS=""
```

Pour les déploiements en production, il est recommandé de configurer explicitement les domaines autorisés.

---

# Telegram

```env
TELEGRAM_BOT_TOKEN=""
```

---

# GitHub

```env
GITHUB_TOKEN=""
```

---

# Édition des variables d'environnement dans l'interface

En plus de l'édition manuelle du fichier `.env`, Leanna expose un éditeur de variables d'environnement directement dans l'interface.

Il est accessible depuis :

```text
Paramètres → Sécurité & Connaissances → Variables .env
```

## Objectif

L'éditeur lit le fichier `.env` actif (ou `.env.local` s'il existe), regroupe les variables par **catégorie** à partir des en-têtes de section du fichier, et propose un champ de saisie adapté au type de chaque variable :

```text
secret   → champ masqué
boolean  → interrupteur
number   → champ numérique
select   → liste déroulante (ex. LOG_LEVEL, LEANNA_AUTONOMY_MODE, Leanna_PERMISSION_MODE)
text     → champ texte
```

Les variables modifiées sont mises en attente et appliquées en lot via une barre de sauvegarde.

## Traitement des secrets

Les clés sensibles (jetons, clés API, secrets) ne sont **jamais renvoyées en clair** par l'API de liste. Le serveur n'envoie qu'un indicateur de présence et un aperçu masqué (par exemple `AIza••••wXyz`).

À l'écriture, les valeurs sensibles sont **chiffrées au repos** via la clé maître (`Leanna_MASTER_KEY`), de la même manière que le reste des secrets de l'application.

## Révéler / déchiffrer une valeur

Chaque secret dispose d'un bouton permettant d'afficher sa valeur **déchiffrée** à la demande. La révélation :

* déclenche un appel serveur dédié qui déchiffre uniquement la clé demandée ;
* affiche la valeur en clair dans le champ, avec un avertissement de visibilité à l'écran ;
* est réinitialisée automatiquement au rechargement, à la sauvegarde et à l'annulation.

## Points de terminaison

```text
GET  /api/env               Liste les variables groupées par section (secrets masqués)
GET  /api/env/reveal/:key   Renvoie la valeur déchiffrée d'une seule clé (sur demande explicite)
POST /api/env               Met à jour une ou plusieurs variables (secrets chiffrés à l'écriture)
```

Ces points de terminaison sont soumis à l'authentification API comme le reste de `/api`. L'écriture est bornée aux clés déjà présentes dans le `.env`, afin d'éviter l'injection de clés arbitraires.

## Note de sécurité

L'éditeur peut modifier des variables qui affectent la sécurité et le comportement du serveur (hôte d'écoute, permissions, autonomie, jetons). Certaines valeurs (ports, hôtes, verrous Redis) nécessitent un redémarrage du serveur pour être prises en compte. Traitez cet écran avec la même prudence qu'une édition directe du fichier `.env`.

---

# Lancer Leanna

## Serveur de développement

```bash
npm run dev
```

Le serveur de développement utilise l'architecture de développement Vite/Node.

---

# Développement desktop

Démarrer l'environnement complet de développement desktop :

```bash
npm run desktop
```

Pour le mode debug :

```bash
npm run desktop:debug
```

La configuration de debug démarre le serveur de développement et Electron ensemble.

---

# Build de production

```bash
npm run build
```

Le processus de build génère le bundle frontend et le bundle serveur.

---

# Démarrage en production

```bash
npm start
```

---

# Packaging Windows

Construire un package répertoire Windows :

```bash
npm run pack:win
```

Construire un distribuable Windows :

```bash
npm run dist:win
```

---

# Flux de travail de développement

Une boucle de développement recommandée est :

```text
1. Démarrer Leanna
2. Sélectionner / ouvrir le projet
3. Inspecter l'état du runtime
4. Implémenter la modification
5. Lancer le typecheck
6. Lancer les tests
7. Lancer le lint
8. Lancer les contrôles de sécurité si pertinent
9. Vérifier l'UI si affectée
10. Relire le diff
11. Commiter
```

---

# Tests

Lancer la suite de tests principale (backend, `node:test`) :

```bash
npm test
```

Lancer les tests du frontend (Vitest + React Testing Library) :

```bash
npm run test:ui          # exécution unique
npm run test:ui:watch    # mode watch
```

---

# Vérification de types (Type Checking)

```bash
npm run typecheck
```

Cela exécute :

```bash
tsc --noEmit -p tsconfig.json
```

---

# Lint

```bash
npm run lint
```

---

# Audit des dépendances

Dépendances de production :

```bash
npm run audit:deps
```

Audit complet des dépendances :

```bash
npm run audit:deps:full
```

---

# Audit de l'UI

```bash
npm run ui:audit
```

---

# Test de fumée de l'Agent Brain

Démarrer le serveur de développement :

```bash
npm run dev
```

Ensuite :

```bash
npm run brain:smoke
```

Cela valide le chemin d'exécution du Brain selon l'implémentation du test de fumée.

---

# Tests de missions

```bash
npm run test:missions
```

---

# Test de charge d'autonomie (Soak Test)

```bash
npm run test:soak
```

Cela exécute le test de charge du gestionnaire de tâches d'autonomie.

---

# Validation de l'autonomie

L'autonomie de Leanna ne repose pas sur de simples déclarations ou logs, mais sur un **comportement démontré et vérifié formellement** via une boucle agentique fermée :

$$\text{PLAN} \longrightarrow \text{ACT} \longrightarrow \text{OBSERVE} \longrightarrow \text{VERIFY} \longrightarrow \text{RECOVER} \longrightarrow \text{COMPLETE}$$

### Banc d'intégration End-to-End autonome (`server/agents/e2e-mission.test.ts`)

Un banc de test autonome hermétique et sans dépendance réseau externe simule et valide l'ensemble du cycle de vie d'une mission :

* **Scénario A — Succès direct (1 boucle)** : L'agent reçoit une mission de correction de code, planifie les étapes, lit le fichier source, applique le correctif typé, et la vérification post-écriture indépendante valide la conformité par empreinte `SHA-256` en un seul cycle.
* **Scénario B — Auto-récupération (Auto-Repair Loop)** : Un premier patch erroné est détecté et rejeté par la vérification cryptographique et le typecheck $\rightarrow$ déclenchement automatique du diagnostic et de la stratégie de réparation $\rightarrow$ génération et application du correctif valide (0 intervention humaine).
* **Scénario C — Respect strict des budgets** : Garantie d'absence de boucle infinie : lorsque les quotas d'écritures, de lectures ou d'itérations sont atteints, le runtime interrompt la boucle de manière propre, prévisible et structurée.
* **Scénario D — Découplage outil / vérification réelle** : Démontre qu'un retour d'outil déclarant `ok: true` ne suffit jamais. Seule la preuve d'état indépendante (`verify_file`, diagnostics compiler, relecture de fichier) autorise la validation d'une étape.

### Commandes de vérification de l'autonomie

Exécuter le banc de test E2E autonome :

```bash
npx tsx --test server/agents/e2e-mission.test.ts
```

Exécuter le harness de mission agentique :

```bash
npx tsx --test server/runtime/agentic/mission-harness.test.ts
```

### Matrice d'attribution des outils et sécurité

Tous les 210+ outils du `ToolRegistry` sont audités et cartographiés dans [`docs/TOOL_OWNERSHIP_MATRIX.md`](docs/TOOL_OWNERSHIP_MATRIX.md). Les outils sensibles à effets de bord majeurs (`project_scaffold`, `quality_loop`, `create/update/delete_custom_skill`, `workflow_run`, `git_push`) sont explicitement verrouillés dans `SENSITIVE_TOOL_ATTRIBUTION` pour interdire tout routage imprévisible par simple heuristique.

<br><img src="https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.png" alt="separator" width="100%"><br>

## 📡 API

Leanna expose une API HTTP et des points de terminaison WebSocket.

La référence détaillée de l'API est maintenue séparément dans :

```text
API_DOCS.md
```

---

# Authentification

Les requêtes API utilisent généralement :

```http
x-leanna-token: <Leanna_API_TOKEN>
```

Le point de terminaison de santé (health) est l'exception.

```http
GET /api/health
```

ne nécessite pas d'authentification.

---

# Réponses API courantes

```text
200  Succès
202  Accepté / tâche asynchrone démarrée
400  Requête invalide
401  Non authentifié
403  Accès refusé
404  Ressource introuvable
409  Conflit
429  Limite de débit
500  Erreur interne du serveur
503  Service indisponible
```

---

# Santé (Health)

```http
GET /api/health
```

Retourne l'état de santé de base du serveur.

---

# Métriques du runtime

Le runtime expose des métriques sous l'API.

Exemples :

```text
/api/v2/metrics
/api/v2/metrics/autonomy
/api/v2/metrics/reliability
/api/v2/metrics/tools
```

Ces points de terminaison offrent une visibilité sur l'exécution du runtime.

---

# WebSockets

L'application utilise des WebSockets pour la fonctionnalité temps réel.

Les canaux runtime pertinents incluent :

```text
/live
/sandbox-watch
/autonomy
```

Le mécanisme d'authentification WebSocket utilise le mécanisme de session/cookie d'application authentifié décrit dans la documentation de l'API.

---

# Modèle des métriques du runtime

Les métriques peuvent inclure :

```text
runtime
outils
événements
mémoire
processus
```

Les métriques d'outils incluent des informations telles que :

* les appels ;
* les échecs ;
* la durée d'exécution.

Les métriques d'autonomie incluent :

* l'état actuel ;
* les tâches actives ;
* les événements en attente ;
* le dernier réveil ;
* la santé ;
* les échecs récents.

---

# Documentation de l'API

Pour la référence complète de l'API :

```text
API_DOCS.md
```

Ne traitez pas ce README comme le contrat d'API exhaustif.

La référence de l'API est l'endroit faisant autorité pour :

* les points de terminaison ;
* les paramètres ;
* l'authentification ;
* les charges utiles (payloads) ;
* les structures de réponse ;
* les WebSockets.

---

# Recommandations de sécurité

Leanna est un système agentique capable d'exécuter des opérations sur l'environnement local.

Traitez-le en conséquence.

## 1. Gardez le serveur sur localhost

Préférez :

```env
Leanna_LISTEN_HOST="127.0.0.1"
```

N'exposez pas :

```env
Leanna_LISTEN_HOST="0.0.0.0"
```

sauf si l'exposition réseau est intentionnelle et correctement sécurisée.

---

## 2. Protégez le jeton d'API

```env
Leanna_API_TOKEN
```

est sensible.

À ne pas faire :

* le commiter ;
* le publier ;
* le placer dans le code frontend ;
* le coller dans des systèmes de suivi de tickets ;
* l'inclure dans des captures d'écran.

---

## 3. Protégez la clé maître

```env
Leanna_MASTER_KEY
```

doit être traitée comme un secret cryptographique.

---

## 4. Évitez les permissions dangereuses inutiles

Préférez :

```env
Leanna_GRANTED_PERMISSIONS="read,write,network,exec"
```

au lieu d'accorder automatiquement :

```text
dangerous
```

---

## 5. Utilisez l'exécution à blanc lors du test d'un nouveau comportement d'agent

```env
Leanna_DRY_RUN="true"
```

est recommandé lors de la validation de nouveaux outils ou workflows autonomes.

---

## 6. Utilisez des politiques d'autonomie explicites

Pour les workflows expérimentaux :

```text
suggest
```

ou :

```text
ask
```

sont des points de départ plus sûrs qu'une exécution autonome sans restriction.

---

## 7. Restreignez l'automatisation du navigateur

Configurez :

```env
AUTOMATION_ALLOWED_DOMAINS
```

lors du déploiement de l'automatisation du navigateur dans un environnement contrôlé.

---

# Modèle de menaces

Les catégories de menaces les plus importantes pour un système de bureau agentique incluent :

```text
Injection de prompt
       ↓
Instructions malveillantes intégrées dans du contenu externe

Exécution d'outil non autorisée
       ↓
L'agent tente une opération au-delà de sa politique

Évasion du système de fichiers
       ↓
Une opération cible un chemin hors de l'espace de travail

Exécution de commande
       ↓
L'agent tente une exécution de processus non sûre

Exposition d'identifiants
       ↓
Des clés API / jetons fuient via le contexte ou les journaux

Exposition réseau
       ↓
L'API locale devient accessible à d'autres machines

État malveillant persistant
       ↓
Une instruction malveillante survit à travers la mémoire
```

Leanna combine donc :

```text
Authentification
+
Permissions
+
Politique d'autonomie
+
Bac à sable
+
Exécution à blanc
+
Approbation
+
Contrôles d'injection de prompt
+
Observabilité
+
Points de contrôle
```

Aucun contrôle individuel ne doit être considéré comme suffisant à lui seul.

---

# Dépannage

## `401 Unauthorized`

Vérifiez :

```env
Leanna_API_TOKEN
```

et assurez-vous que le client envoie :

```http
x-leanna-token
```

---

## Supabase indisponible

Vérifiez :

```env
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Certaines fonctionnalités peuvent fonctionner sans les fonctionnalités persistantes de Supabase, tandis que d'autres dépendent de la configuration du backend.

---

## L'agent ne peut pas exécuter un outil

Vérifiez :

1. l'enregistrement de l'outil ;
2. les permissions de l'outil ;
3. le mode de permission global ;
4. les permissions accordées ;
5. la politique d'autonomie ;
6. l'état du bac à sable ;
7. les exigences d'approbation ;
8. le mode d'exécution à blanc.

---

## Outil refusé en mode `enforce`

Vérifiez :

```env
Leanna_PERMISSION_MODE="enforce"
```

Puis inspectez :

```env
Leanna_GRANTED_PERMISSIONS
```

Vérifiez également que l'outil déclare correctement les permissions dont il a besoin.

---

## Les modifications ne sont pas exécutées en exécution à blanc

Vérifiez :

```env
Leanna_DRY_RUN="true"
```

Les outils à effets de bord sont intentionnellement interceptés dans ce mode.

---

## L'automatisation du navigateur échoue

Vérifiez :

* la disponibilité de Puppeteer ;
* la configuration de l'exécutable du navigateur ;
* la connectivité réseau ;
* les domaines autorisés ;
* l'authentification ;
* le comportement du site web cible.

---

# Documentation

Le dépôt contient une documentation dédiée pour les principaux systèmes architecturaux.

## Architecture

```text
ARCHITECTURE.md
```

Décrit l'architecture technique.

## Autonomie

```text
AUTONOMY.md
```

Décrit le comportement du runtime autonome.

## Runtime agentique

```text
docs/AGENTIC_RUNTIME.md
```

Documentation détaillée du runtime d'agent.

## Contrat d'autonomie

```text
docs/AUTONOMY_CONTRACT.md
```

Définit le contrat d'autonomie et les limites d'exécution.

## Audit de l'agent autonome

```text
docs/AUTONOMOUS_AGENT_AUDIT.md
```

Audit du comportement de l'agent autonome.

## Audit de la réalité d'exécution

```text
docs/LEANNA_EXECUTION_REALITY_AUDIT.md
```

Documente le chemin d'exécution réel et la réalité de l'implémentation.

## Audit maître de l'autonomie

```text
docs/LEANNA_AUTONOMY_MASTER_AUDIT.md
```

Audit complet de l'autonomie.

## Rapport d'implémentation

```text
docs/LEANNA_AUTONOMY_IMPLEMENTATION_REPORT.md
```

Rapport d'autonomie au niveau de l'implémentation.

## Audit officiel d'autonomie (v1.4.0)

```text
docs/AUTONOMY_AUDIT.md
```

Audit rigoureux distinguant ce qui est formellement vérifié (`VERIFIED`), implémenté (`IMPLEMENTED`), partiel (`PARTIAL`), manquant (`MISSING`) et les risques résiduels (`RISK`).

## Plan de test de l'autonomie

```text
docs/AUTONOMY_TEST_PLAN.md
```

Plan de test détaillé avec spécifications des oracles, invariants SHA-256 et scénarios de validation E2E.

## Matrice de propriété des outils

```text
docs/TOOL_OWNERSHIP_MATRIX.md
```

Matrice exhaustive des 210+ outils du `ToolRegistry` avec attribution explicite (`SENSITIVE_TOOL_ATTRIBUTION`), niveau de risque, permissions et contraintes de bac à sable.

## Cartographie du runtime autonome

```text
docs/AUTONOMY_RUNTIME_MAP.md
```

Cartographie complète du flux d'exécution depuis l'intention utilisateur jusqu'à la vérification finale et la persistance.

## Base de données

```text
DB_SCHEMA.md
```

Documentation de la structure de la base de données et de la persistance.

## API

```text
API_DOCS.md
```

Référence de l'API.

## Self IDE

```text
SELF_IDE.md
```

Documentation relative à l'environnement de développement intégré.

## Feuille de route

```text
ROADMAP.md
```

État du projet et développement futur.

---

# Principes d'architecture

Leanna est construit autour de plusieurs principes architecturaux.

## 1. Exécution plutôt que génération

Le système doit mesurer le succès à travers des résultats vérifiés plutôt que par le seul texte généré.

## 2. Contrats explicites

Les sous-systèmes d'agents communiquent via des contrats explicites plutôt que par des hypothèses implicites.

## 3. Autorisation centralisée

Les outils doivent passer par l'architecture d'autorisation du runtime.

## 4. Exécution observable

L'état d'exécution important doit être observable.

## 5. Autonomie bornée

L'autonomie doit être bornée par :

* les permissions ;
* les délais d'expiration ;
* les réessais ;
* les budgets ;
* le bac à sable ;
* l'approbation ;
* les disjoncteurs (circuit breakers).

## 6. Récupération plutôt que répétition aveugle

Les échecs doivent produire de l'information utilisée pour déterminer l'action suivante.

## 7. Contexte persistant

La compréhension du projet et la mémoire doivent survivre aux interactions individuelles lorsque c'est approprié.

## 8. Séparation des préoccupations

L'architecture sépare :

```text
UI
Serveur
Runtime
Agents
Missions
Outils
Connaissance
Mémoire
Sécurité
Persistance
Observabilité
```

---

# Exemple d'exécution d'un agent

Une mission d'ingénierie logicielle typique peut être représentée ainsi :

```text
UTILISATEUR

« Refactoriser le module d'authentification et s'assurer que tous les tests passent. »
```

Leanna :

```text
1. COMPRENDRE
   ├── identifier l'objectif
   ├── identifier le projet
   ├── identifier les fichiers pertinents
   ├── identifier les technologies
   └── identifier les critères de succès

2. PLANIFIER
   ├── inspecter l'authentification
   ├── identifier les problèmes architecturaux
   ├── implémenter le refactoring
   ├── lancer les tests
   └── vérifier le résultat

3. DÉLÉGUER
   ├── chercheur / planificateur
   ├── codeur
   └── testeur

4. EXÉCUTER
   ├── lire les fichiers
   ├── modifier les fichiers
   └── exécuter les vérifications permises

5. OBSERVER
   ├── modifications de fichiers
   ├── résultats des outils
   ├── sortie du compilateur
   └── sortie des tests

6. VÉRIFIER
   ├── syntaxe
   ├── tests
   ├── fichiers modifiés
   └── critères de succès

7. RÉCUPÉRER
   ├── diagnostiquer l'échec
   ├── réparer
   ├── réessayer
   └── replanifier lorsque nécessaire

8. TERMINER
   └── fournir le résultat d'exécution réel
```

---

# Qu'est-ce qui rend l'architecture agentique ?

Leanna doit être compris comme une composition de plusieurs couches plutôt que comme un unique « modèle intelligent ».

```text
                   ┌──────────────┐
                   │     LLM      │
                   └──────┬───────┘
                          │
                   ┌──────▼───────┐
                   │ Agent Brain  │
                   └──────┬───────┘
                          │
                   ┌──────▼───────┐
                   │ Planificateur│
                   └──────┬───────┘
                          │
                   ┌──────▼───────┐
                   │Orchestrateur │
                   └──────┬───────┘
                          │
                   ┌──────▼───────┐
                   │Runtime outils│
                   └──────┬───────┘
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
           Mémoire      Outils    Connaissance
              │           │           │
              └───────────┼───────────┘
                          ▼
                   ┌───────────────┐
                   │ Vérification  │
                   └───────┬───────┘
                           │
                     ┌─────▼─────┐
                     │Récupération│
                     └───────────┘
```

Le LLM est donc un composant du système.

Le runtime de l'agent fournit l'architecture de contrôle autour de lui.

---

# Périmètre actuel

Le dépôt contient actuellement une infrastructure pour :

* l'exécution desktop ;
* l'interaction IA ;
* les tâches autonomes ;
* les missions ;
* l'orchestration d'agents ;
* la délégation multi-agents ;
* l'exécution d'outils ;
* la gestion des compétences ;
* la compréhension du projet ;
* les graphes de connaissances ;
* la recherche sémantique ;
* la mémoire persistante ;
* les notebooks ;
* le RAG ;
* l'automatisation du navigateur ;
* Git/GitHub ;
* les workflows ;
* MCP ;
* Telegram ;
* l'audit de sécurité ;
* le bac à sable ;
* les permissions ;
* l'exécution à blanc ;
* l'observabilité ;
* la communication API/WebSocket ;
* la persistance Supabase.

Tous les composants ne doivent pas automatiquement être interprétés comme étant d'une maturité équivalente ou prêts pour la production.

Le dépôt contient des audits explicites et des documents de feuille de route pour distinguer :

```text
Implémenté
Expérimental
Partiellement intégré
Squelette (scaffolding)
Planifié
```

Ces documents doivent être consultés avant de formuler des affirmations sur la maturité en production.

---

# Philosophie de la feuille de route

La direction à long terme de Leanna est d'évoluer vers un environnement d'exécution autonome fiable.

Les domaines prioritaires sont :

```text
1. Fiabilité
2. Vérification
3. Récupération
4. Sécurité
5. Qualité du contexte
6. Coordination des agents
7. Exécution de longue durée
8. Observabilité
9. Extensibilité
10. Expérience utilisateur
```

L'objectif n'est pas simplement d'ajouter plus d'outils.

Ajouter des outils augmente la capacité.

Améliorer :

```text
la planification
+
la sélection
+
l'autorisation
+
l'exécution
+
la vérification
+
la récupération
```

augmente la fiabilité.

C'est là le défi d'ingénierie central d'un agent autonome.

---

# Priorités de développement recommandées

Lors de l'extension de Leanna, préférez la séquence suivante :

```text
                  NOUVELLE CAPACITÉ
                          │
                          ▼
                  Contrat d'outil
                          │
                          ▼
                    Permissions
                          │
                          ▼
                    Autorisation
                          │
                          ▼
                  Mapping d'agent
                          │
                          ▼
                    Exécution
                          │
                          ▼
                   Vérification
                          │
                          ▼
                  Observabilité
                          │
                          ▼
                      Tests
```

Une nouvelle capacité ne doit pas être considérée comme complète simplement parce que son chemin nominal (happy path) fonctionne.

Elle doit aussi définir :

* les permissions ;
* le comportement en cas d'erreur ;
* le délai d'expiration ;
* la vérification ;
* l'observabilité ;
* la couverture de tests ;
* le comportement de récupération lorsque pertinent.

---

# Contribuer

Avant de modifier Leanna :

```bash
npm install
```

Puis exécutez :

```bash
npm run typecheck
npm run lint
npm test
```

Pour les modifications pertinentes, exécutez également :

```bash
npm run audit:deps
npm run ui:audit
npm run brain:smoke
npm run test:missions
```

---

# Règles de contribution

Lors de la modification d'un composant agentique :

## Modifications d'outils

Vérifiez :

* le schéma d'entrée ;
* les permissions ;
* la classification de mutation ;
* le délai d'expiration ;
* l'autorisation ;
* le comportement en exécution à blanc ;
* l'attribution ;
* l'observabilité ;
* les tests.

## Modifications d'agents

Vérifiez :

* l'enregistrement du rôle ;
* le mapping des outils ;
* la délégation ;
* le contrat d'exécution ;
* la vérification ;
* la gestion des échecs.

## Modifications d'autonomie

Vérifiez :

* la politique d'autonomie ;
* les permissions ;
* le bac à sable ;
* l'approbation ;
* les limites de réessai ;
* le délai d'expiration ;
* le disjoncteur (circuit breaker) ;
* la persistance ;
* l'observabilité.

## Modifications de mémoire

Vérifiez :

* la portée ;
* la persistance ;
* la confidentialité ;
* l'invalidation ;
* la récupération ;
* les tests.

---

# Philosophie de conception

Leanna repose sur un principe simple :

> **L'autonomie n'est pas l'absence de contrôle.
> L'autonomie est une exécution contrôlée avec rétroaction.**

Un système autonome utile a donc besoin de :

```text
Intelligence
     +
Contexte
     +
Planification
     +
Outils
     +
Exécution
     +
Vérification
     +
Mémoire
     +
Récupération
     +
Sécurité
     +
Observabilité
```

Supprimer l'une de ces couches crée un agent plus faible.

---

# Le contrat d'exécution de Leanna

Une mission réussie doit finalement répondre à :

```text
Quel était l'objectif ?

Qu'a compris Leanna ?

Qu'a-t-il planifié ?

Quels agents ont participé ?

Quels outils ont été utilisés ?

Quelles actions ont été effectuées ?

Qu'est-ce qui a changé ?

Qu'est-ce qui a été vérifié ?

Qu'est-ce qui a échoué ?

Qu'est-ce qui a été récupéré ?

Qu'est-ce qui reste incomplet ?

Pourquoi la mission est-elle considérée comme terminée ?
```

Cela crée un modèle d'exécution plus utile que le simple retour d'une réponse générée.

---

# Modèle mental final

Si vous contribuez à Leanna, pensez le système ainsi :

```text
                    UTILISATEUR
                        │
                        ▼
                     OBJECTIF
                        │
                        ▼
               ┌────────────────┐
               │   COMPRENDRE   │
               └───────┬────────┘
                       │
                       ▼
               ┌────────────────┐
               │   PLANIFIER    │
               └───────┬────────┘
                       │
                       ▼
               ┌────────────────┐
               │    DÉLÉGUER    │
               └───────┬────────┘
                       │
                       ▼
               ┌────────────────┐
               │      AGIR      │
               └───────┬────────┘
                       │
                       ▼
               ┌────────────────┐
               │    OBSERVER    │
               └───────┬────────┘
                       │
                       ▼
               ┌────────────────┐
               │    VÉRIFIER    │
               └───────┬────────┘
                       │
                ┌──────┴──────┐
                │             │
              RÉUSSI       ÉCHOUÉ
                │             │
                │             ▼
                │        ┌───────────┐
                │        │ RÉCUPÉRER │
                │        └─────┬─────┘
                │              │
                │              ▼
                │         REPLANIFIER
                │              │
                │              └───────┐
                │                      │
                └──────────────────────┘
                           │
                           ▼
                      TERMINAISON
                           │
                           ▼
                   RÉSULTAT VÉRIFIÉ
```

Cette boucle est le centre conceptuel de Leanna.

<br><img src="https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.png" alt="separator" width="100%"><br>

## 📄 Licence

Leanna est distribué sous la :

**Business Source License 1.1 (BUSL-1.1)**

Voir :

```text
LICENSE
```

pour les termes et conditions complets.

---

# Documentation du projet

| Document                                        | Objet                     |
| ----------------------------------------------- | ------------------------- |
| `ARCHITECTURE.md`                               | Architecture technique    |
| `AUTONOMY.md`                                   | Runtime autonome          |
| `API_DOCS.md`                                   | Référence de l'API        |
| `DB_SCHEMA.md`                                  | Schéma de base de données |
| `ROADMAP.md`                                    | Feuille de route et état  |
| `SELF_IDE.md`                                   | IDE intégré               |
| `docs/AGENTIC_RUNTIME.md`                       | Runtime agentique         |
| `docs/AUTONOMY_CONTRACT.md`                     | Contrat d'autonomie       |
| `docs/AUTONOMOUS_AGENT_AUDIT.md`                | Audit d'agent autonome    |
| `docs/LEANNA_AUTONOMY_MASTER_AUDIT.md`          | Audit maître d'autonomie  |
| `docs/LEANNA_AUTONOMY_IMPLEMENTATION_REPORT.md` | Rapport d'implémentation  |
| `docs/LEANNA_EXECUTION_REALITY_AUDIT.md`        | Audit de réalité d'exéc.  |

---

<br>

<div align="center">

<img src="https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.png" alt="separator" width="100%">

<br><br>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/images/logo.png">
  <source media="(prefers-color-scheme: light)" srcset="assets/images/logo.png">
  <img src="assets/images/logo.png" alt="Leanna" width="80">
</picture>

<br><br>

**Comprendre · Planifier · Agir · Vérifier · Récupérer · Terminer**

<sub>Un environnement d'exécution IA autonome pour le bureau</sub>

<br><br>

<img src="https://img.shields.io/badge/Made%20with-❤️-A78BFA?style=for-the-badge" alt="Made with love" />

<br><br>

<sub>© 2026 Maysson — Leanna</sub>

</div>
