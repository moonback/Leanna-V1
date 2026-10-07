# Rapport technique — Leanna

> **Périmètre documentaire**  
> Ce rapport est fondé exclusivement sur les extraits fournis du `README.md` et de la description de la codebase « sandbox ». Les sources décrivent l’architecture fonctionnelle, les principales technologies, les mécanismes de sécurité et les outils Graphify, mais ne fournissent pas l’intégralité des interfaces, schémas de données, contrats API ni paramètres opérationnels. Les éléments non documentés sont explicitement signalés par la mention **[Information non disponible dans les sources]**.

---

## 1. 📋 Résumé technique

### 1.1 Objectif du document

Leanna est un environnement d’exécution d’agents IA autonomes, natif pour le bureau, destiné à transformer un objectif utilisateur en une suite d’actions :

1. compréhensibles ;
2. planifiées ;
3. exécutables ;
4. observables ;
5. vérifiables ;
6. récupérables en cas d’échec ;
7. replanifiables lorsque le contexte évolue.

Le système ne se limite donc pas à produire une réponse textuelle. Sa finalité est de mener une mission jusqu’à un résultat vérifié selon des critères de succès explicites. Cette orientation distingue Leanna d’un assistant conversationnel classique, dont le cycle se résume généralement à :

```text
Question → Génération → Réponse
```

Leanna adopte au contraire une logique d’exécution fermée :

```text
Objectif
  ↓
Compréhension
  ↓
Planification
  ↓
Sélection d’outils et d’agents
  ↓
Exécution
  ↓
Observation
  ↓
Vérification
  ↓
Récupération / Replanification
  ↓
Résultat final
```

Le système cible notamment les tâches d’ingénierie logicielle, l’automatisation de bureau, l’utilisation d’outils externes, la gestion de projets, la manipulation de dépôts Git, l’automatisation du navigateur, les workflows, les notebooks, le RAG et l’exploitation de graphes de connaissances.

### 1.2 Décisions techniques clés

Les décisions structurantes identifiables dans les sources sont les suivantes :

| Domaine | Décision retenue |
|---|---|
| Expérience utilisateur | Application de bureau native fondée sur Electron |
| Interface | Frontend React |
| Runtime | TypeScript et Node.js |
| Persistance | Supabase |
| Intelligence artificielle | Intégration de Gemini et OpenRouter |
| Orchestration | Runtime événementiel, système de missions et architecture multi-agents |
| Exécution | Registre d’outils, outils d’exécution, mécanismes d’observation et de vérification |
| Connaissance | Graphe de connaissances Graphify |
| Intégrations | GitHub, Telegram, MCP, fournisseurs d’IA et automatisation du navigateur |
| Robustesse | Réparation, idempotence, limitation de débit, disjonction et validation |
| Sécurité | Permissions, sandboxing, dry-run, protection contre l’injection de prompt et Safety Gate Jev |
| Qualité | 855 tests passants selon le badge du README |
| Licence | BUSL 1.1, selon le badge du README |

### 1.3 Stack et architecture retenue

La stack déclarée est la suivante :

```text
┌─────────────────────────────────────────┐
│ Application de bureau Electron          │
│ ┌─────────────────────────────────────┐ │
│ │ Interface React                     │ │
│ └─────────────────────────────────────┘ │
│                  │                      │
│                  ▼                      │
│ ┌─────────────────────────────────────┐ │
│ │ Runtime TypeScript / Node.js        │ │
│ │ - Agent Brain                       │ │
│ │ - Missions                          │ │
│ │ - Multi-agents                      │ │
│ │ - Outils                            │ │
│ │ - Vérification / récupération       │ │
│ │ - Sécurité                          │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
          │          │           │
          ▼          ▼           ▼
       Supabase   Fournisseurs   Services
       mémoire    IA             externes
                  Gemini /       GitHub,
                  OpenRouter     Telegram,
                                 MCP
```

À cette architecture s’ajoutent Redis, Graphify, les systèmes de sandboxing des plugins et les mécanismes de contrôle d’exécution décrits dans la codebase.

---

## 2. 🏗️ Architecture

### 2.1 Architecture globale

L’architecture de Leanna peut être comprise comme une chaîne de composants coopérants autour d’un runtime centralisé et événementiel.

```text
                                      ┌──────────────────────┐
                                      │ Utilisateur          │
                                      │ Objectif / mission   │
                                      └──────────┬───────────┘
                                                 │
                                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ Application de bureau Electron                                 │
│                                                                 │
│  ┌───────────────┐       ┌──────────────────────────────────┐  │
│  │ Interface     │──────▶│ Runtime centralisé événementiel │  │
│  │ React         │       └───────────────┬──────────────────┘  │
│  └───────────────┘                       │                     │
│                                          ▼                     │
│  ┌──────────────┐  ┌───────────────┐  ┌─────────────────────┐ │
│  │ Agent Brain  │  │ Missions      │  │ Orchestration       │ │
│  │ Compréhension│  │ Planification │  │ multi-agents       │ │
│  └──────┬───────┘  └──────┬────────┘  └──────────┬──────────┘ │
│         │                 │                      │            │
│         └─────────────────┴──────────────────────┘            │
│                              │                                 │
│                              ▼                                 │
│             ┌────────────────────────────────┐                 │
│             │ Registre d’outils et skills    │                 │
│             └───────────────┬────────────────┘                 │
│                             │                                  │
│                             ▼                                  │
│       ┌─────────────────────────────────────────────────────┐  │
│       │ Contrôles d’exécution                               │  │
│       │ Permissions · Safety Gate Jev · Dry-run · Sandbox   │  │
│       │ Validation · Idempotence · Rate limiting · Circuit  │  │
│       │ breaker · Protection contre l’injection             │  │
│       └─────────────────────┬───────────────────────────────┘  │
└─────────────────────────────┼───────────────────────────────────┘
                              │
       ┌──────────────────────┼─────────────────────────┐
       ▼                      ▼                         ▼
┌──────────────┐      ┌───────────────┐       ┌────────────────┐
│ Services IA  │      │ Persistance    │       │ Intégrations   │
│ Gemini       │      │ Supabase       │       │ GitHub         │
│ OpenRouter   │      │ Redis          │       │ Telegram       │
└──────────────┘      │ Mémoire        │       │ MCP            │
                      └───────────────┘       │ Navigateur     │
                                              └────────────────┘
                              │
                              ▼
                    ┌──────────────────────┐
                    │ Graphify             │
                    │ Graphe de code et    │
                    │ de connaissances     │
                    └──────────────────────┘
```

Ce schéma représente les relations fonctionnelles décrites par les sources. Le détail des protocoles de communication entre composants est **[Information non disponible dans les sources]**.

### 2.2 Composants principaux et responsabilités

#### Application de bureau Electron

Electron constitue le conteneur d’exécution natif pour le bureau. Il fournit l’environnement dans lequel sont intégrés l’interface utilisateur, le runtime agentique et les fonctions d’interaction avec l’environnement local.

Les sources ne précisent pas :

- les systèmes d’exploitation supportés ;
- la séparation exacte entre processus principal et processus renderer ;
- les politiques de communication IPC ;
- les mécanismes de mise à jour de l’application.

Ces éléments sont **[Information non disponible dans les sources]**.

#### Interface React

React constitue la couche frontend. Elle expose vraisemblablement l’état des missions, les contrôles d’autonomie, les résultats et les éléments d’observabilité, mais les écrans et contrats d’interface détaillés ne sont pas fournis.

Le README mentionne également l’édition des variables d’environnement dans l’interface et un IDE/espace de travail. La responsabilité précise de React dans ces fonctions est **[Information non disponible dans les sources]**.

#### Runtime TypeScript / Node.js

Le runtime est le cœur opérationnel du système. Il coordonne :

- la réception d’un objectif ;
- la compréhension du contexte ;
- la construction d’un plan ;
- la sélection des outils ou agents ;
- l’exécution des actions ;
- l’observation des résultats ;
- la vérification ;
- la récupération ;
- la replanification ;
- la persistance de la mémoire et du contexte ;
- l’application des politiques de permissions et d’autonomie.

La codebase est décrite comme reposant sur un runtime événementiel. Cette caractéristique est cohérente avec la nécessité de suivre des événements d’exécution, des transitions d’état, des échecs et des actions de récupération.

#### Agent Brain

Le « cerveau de l’agent » prend en charge les capacités de compréhension et de décision. Il est associé à la compréhension de l’objectif, à l’identification du contexte pertinent et à la détermination des outils ou agents adaptés.

La séparation exacte entre le Brain, le planificateur et l’orchestrateur n’est pas documentée avec suffisamment de précision : **[Information non disponible dans les sources]**.

#### Système de missions

Une mission représente l’unité d’exécution orientée objectif. Elle permet de structurer le travail autour d’un but, d’un plan, d’actions et de critères de réussite.

La mission est compatible avec le principe central de Leanna : une tâche n’est considérée comme terminée que lorsque le résultat est effectivement vérifié, et non lorsque le modèle a simplement généré une proposition.

#### Architecture multi-agents

Leanna peut déterminer quels agents sont pertinents et les orchestrer au sein d’une même mission. Le contenu fourni ne précise pas :

- les rôles standards des agents ;
- la stratégie de répartition des tâches ;
- les mécanismes de communication entre agents ;
- la gestion des conflits entre agents ;
- les règles de terminaison d’une orchestration multi-agents.

Ces détails sont **[Information non disponible dans les sources]**.

#### Registre d’outils et compétences

Les outils permettent d’agir sur l’environnement. Ils incluent notamment les capacités d’IDE, de navigateur, Git/GitHub, notebooks, RAG, génération d’images, workflows, MCP et Telegram.

Le registre sert à sélectionner les capacités adaptées à une mission. Il est associé à des contrôles de permissions, de validation et de sécurité.

#### Mémoire persistante et connaissance

Leanna intègre une mémoire persistante et des graphes de connaissances. Graphify fournit en particulier un graphe navigable de la base de code, construit à partir d’une extraction AST, avec :

- requêtes ciblées ;
- chemins entre nœuds ;
- explication d’un concept ;
- analyse des dépendances impactées ;
- identification des « god nodes » ;
- mise à jour du graphe.

Les règles du projet imposent de consulter Graphify en premier pour les questions relatives à la codebase ou à l’architecture lorsque `graphify-out/graph.json` existe.

### 2.3 Flux de données et cycle d’exécution

Le flux fonctionnel principal est le suivant :

1. L’utilisateur soumet un objectif.
2. Le système acquiert le contexte nécessaire.
3. L’Agent Brain comprend l’objectif et les contraintes.
4. Le runtime construit un plan.
5. Les outils et agents pertinents sont sélectionnés.
6. Les contrôles de permissions et de sécurité sont appliqués.
7. Une estimation des coûts, délais et risques est réalisée avant exécution.
8. Les actions sont exécutées, éventuellement en mode dry-run.
9. Les résultats sont observés.
10. Les critères de succès sont vérifiés.
11. En cas d’échec, une récupération bornée est tentée.
12. Le système replanifie si nécessaire.
13. La mémoire et le contexte sont mis à jour.
14. L’état et le résultat sont exposés à l’utilisateur.

Cette boucle établit une connexion directe entre les missions, l’observabilité, la sécurité et la vérification : chacune de ces capacités est nécessaire pour éviter qu’une génération IA soit considérée à tort comme une exécution réussie.

### 2.4 Intégrations

Les intégrations mentionnées sont :

| Intégration | Fonction décrite |
|---|---|
| Gemini | Fournisseur d’intelligence artificielle |
| OpenRouter | Fournisseur ou routeur de modèles IA |
| Supabase | Persistance |
| Redis | Composant d’infrastructure utilisé par la codebase |
| GitHub | Gestion de code et intégration de dépôt |
| Telegram | Intégration de communication |
| MCP | Intégration de serveurs ou outils externes |
| Navigateur | Automatisation du navigateur |
| Graphify | Graphe de connaissances de la codebase |
| Electron | Environnement desktop |
| React | Interface utilisateur |
| Node.js / TypeScript | Runtime applicatif |

Les protocoles, modalités d’authentification, formats de messages et règles de reprise propres à chaque intégration sont **[Information non disponible dans les sources]**.

---

## 3. ⚙️ Choix techniques

### 3.1 Technologies retenues et justification

#### Electron

Electron est cohérent avec l’objectif de fournir un environnement IA natif pour le bureau. Il permet de réunir une interface graphique, un runtime applicatif et des fonctions d’automatisation locales dans un même produit.

Le choix implique toutefois une dépendance à un environnement desktop spécifique et une surface de sécurité importante, notamment lorsque l’agent peut exécuter des actions locales. Les détails de durcissement ne sont pas fournis.

#### React

React est utilisé pour le frontend. Ce choix fournit une base adaptée à une interface riche, interactive et orientée état, ce qui est pertinent pour visualiser les missions, les événements d’exécution et les résultats de vérification.

#### TypeScript et Node.js

TypeScript est identifié comme technologie du runtime et Node.js comme backend. Cette combinaison est adaptée à un runtime événementiel et à l’intégration de nombreux outils et services externes.

Le typage statique peut contribuer à fiabiliser les interfaces entre outils, missions et composants de sécurité, mais la stratégie de typage effectivement appliquée n’est pas documentée.

#### Supabase

Supabase est retenu pour la persistance. Cette décision est cohérente avec les besoins de mémoire persistante, de stockage de contexte et de conservation des informations de mission.

Le modèle de données, les politiques d’accès et la stratégie de sauvegarde sont **[Information non disponible dans les sources]**.

#### Gemini et OpenRouter

La présence de Gemini et OpenRouter indique une architecture capable d’utiliser plusieurs fournisseurs ou chemins d’accès à des modèles IA. Cette configuration peut faciliter l’adaptation du système aux besoins de qualité, de disponibilité ou de spécialisation.

Les règles de sélection, de bascule et de comparaison entre fournisseurs ne sont pas spécifiées.

#### Redis

Redis est mentionné parmi les technologies utilisées par la codebase. Son rôle exact — cache, coordination, files, verrouillage ou stockage temporaire — n’est pas décrit : **[Information non disponible dans les sources]**.

#### Graphify

Graphify répond au besoin de compréhension structurelle de la codebase. L’utilisation d’une extraction AST et de parcours ciblés réduit la nécessité de lire l’ensemble des fichiers pour une question locale. Les règles demandent également de mettre à jour le graphe après modification du code, sans coût API puisque la mise à jour est AST-only.

### 3.2 Alternatives évaluées et raisons du rejet

Les sources ne documentent aucune comparaison formelle avec des technologies alternatives. Il n’est donc pas possible d’établir factuellement une liste d’alternatives rejetées.

- Alternative à Electron : **[Information non disponible dans les sources]**
- Alternative à React : **[Information non disponible dans les sources]**
- Alternative à Supabase : **[Information non disponible dans les sources]**
- Alternative à Gemini/OpenRouter : **[Information non disponible dans les sources]**
- Alternative à Redis : **[Information non disponible dans les sources]**
- Alternative à Graphify : **[Information non disponible dans les sources]**

### 3.3 Trade-offs acceptés

Les trade-offs déductibles des sources sont les suivants :

1. **Autonomie contre contrôle**  
   L’autonomie est recherchée, mais elle est limitée par les permissions, les modes d’autonomie, le Safety Gate Jev, le dry-run et le sandboxing. Cette contrainte réduit potentiellement la fluidité d’exécution, mais diminue le risque associé aux actions à effet de bord.

2. **Richesse fonctionnelle contre complexité**  
   La combinaison d’un Brain, d’un runtime, de missions, d’agents multiples, d’outils, de mémoire, de graphes et d’intégrations produit une architecture riche. Elle augmente nécessairement la complexité d’orchestration et de diagnostic.

3. **Flexibilité multi-fournisseurs contre variabilité**  
   L’utilisation de Gemini et OpenRouter permet une certaine souplesse, mais introduit potentiellement des différences de comportement entre modèles. La stratégie de normalisation n’est pas documentée.

4. **Automatisation contre surface d’attaque**  
   L’accès à GitHub, Telegram, au navigateur, aux plugins et à l’environnement de bureau augmente la valeur opérationnelle de Leanna, mais aussi la surface d’attaque. Les contrôles de sécurité constituent donc un élément architectural central, et non une fonction périphérique.

---

## 4. 📐 Spécifications

### 4.1 Modèle de données

Les entités fonctionnelles suivantes sont identifiables :

| Entité | Rôle |
|---|---|
| Objectif | Demande initiale exprimée par l’utilisateur |
| Mission | Conteneur d’exécution orienté résultat |
| Plan | Décomposition de l’objectif en étapes |
| Agent | Composant spécialisé participant à l’exécution |
| Outil | Capacité d’action exposée au runtime |
| Événement | Trace d’une transition ou d’une action du runtime |
| Observation | Résultat constaté après une action |
| Vérification | Évaluation du respect des critères de succès |
| Mémoire | Contexte persistant et informations réutilisables |
| Permission | Autorisation applicable à une action |
| Estimation | Coût, délai et risque anticipés |
| Graphe | Relations entre fichiers, symboles, concepts ou composants |

La structure exacte des tables Supabase, des documents Redis, des identifiants, des statuts et des relations est **[Information non disponible dans les sources]**.

### 4.2 APIs et interfaces

Le README comporte une section « API », ainsi que des références à MCP, Graphify et aux intégrations externes. Toutefois, aucun contrat d’API n’est fourni dans les extraits.

Les éléments suivants sont donc **[Information non disponible dans les sources]** :

- endpoints HTTP ;
- méthodes et paramètres ;
- schémas de requête et de réponse ;
- événements émis par le runtime ;
- interfaces TypeScript publiques ;
- mécanismes d’authentification ;
- codes d’erreur ;
- versionnement des API ;
- contrats MCP détaillés.

Concernant Graphify, les commandes déclarées sont :

```bash
graphify query "<question>"
graphify path "<A>" "<B>"
graphify explain "<concept>"
graphify affected "<concept>"
graphify god-nodes
graphify update .
```

Elles fournissent respectivement une requête de graphe, un chemin entre deux nœuds, une explication de concept, une analyse des éléments affectés, la liste des nœuds centraux et une mise à jour du graphe.

### 4.3 Contraintes de performance

Les sources établissent un besoin d’estimation des coûts, délais et risques avant exécution, ainsi que de limitation de débit. Elles mentionnent également des mécanismes de récupération et de disjonction.

En revanche, aucun objectif chiffré n’est fourni concernant :

- la latence maximale ;
- le débit d’exécution ;
- le nombre maximal d’agents concurrents ;
- la durée maximale d’une mission ;
- le volume de mémoire ;
- les quotas d’API ;
- les temps de réponse attendus ;
- les seuils de circuit breaker.

Ces paramètres sont **[Information non disponible dans les sources]**.

### 4.4 Exigences de sécurité

Les exigences de sécurité explicitement identifiables comprennent :

- gestion des permissions ;
- contrôle des actions à effet de bord ;
- Safety Gate Jev avant exécution ;
- sandboxing ;
- dry-run ;
- protection contre l’injection de prompt ;
- sandboxing des plugins ;
- validation ;
- idempotence ;
- limitation de débit ;
- disjonction ;
- modes d’autonomie ;
- contrôle des variables d’environnement.

Le Safety Gate Jev est particulièrement important : il évalue les actions à effet de bord avant leur exécution. Il matérialise la décision de ne pas laisser un modèle déclencher directement une action sensible sans contrôle intermédiaire.

#### Incident critique de gestion des secrets

La description de la codebase indique que de nombreux secrets opérationnels sont exposés directement, notamment des tokens API, des clés Supabase, une clé maître, un token Telegram et un code de sandbox.

Cette situation doit être traitée comme un incident de sécurité prioritaire. Les actions explicitement recommandées par la source sont :

1. révoquer immédiatement les secrets exposés ;
2. les remplacer par de nouvelles valeurs ;
3. ne pas reproduire les valeurs compromises dans la documentation ;
4. vérifier les emplacements de stockage et d’exposition ;
5. contrôler les historiques ou artefacts susceptibles de conserver ces secrets.

Les modalités précises de rotation, de stockage sécurisé et d’audit sont **[Information non disponible dans les sources]**.

---

## 5. 🚀 Plan d’implémentation

### 5.1 Phases de développement

Le plan suivant est aligné sur les composants et priorités documentés.

#### Phase 0 — Remédiation de sécurité

- Révoquer et remplacer tous les secrets exposés.
- Identifier les emplacements de fuite.
- Vérifier les variables d’environnement et les interfaces d’édition.
- Contrôler le fonctionnement des permissions, du sandboxing et du Safety Gate Jev.

Cette phase est prioritaire avant toute nouvelle exposition fonctionnelle.

#### Phase 1 — Socle applicatif

- Stabiliser l’application Electron.
- Mettre en place le frontend React.
- Établir les interfaces entre frontend et runtime Node.js/TypeScript.
- Définir le cycle de vie d’une mission.
- Centraliser les événements d’exécution.

#### Phase 2 — Runtime agentique

- Implémenter ou stabiliser l’Agent Brain.
- Ajouter la compréhension d’objectif et l’acquisition de contexte.
- Construire la planification.
- Ajouter la sélection d’agents et d’outils.
- Formaliser l’observation et la vérification.
- Mettre en œuvre la récupération et la replanification.

#### Phase 3 — Outils et intégrations

- Intégrer les fournisseurs IA Gemini et OpenRouter.
- Connecter Supabase et Redis.
- Ajouter les outils GitHub, Telegram, MCP et navigateur.
- Encadrer les plugins par sandboxing.
- Appliquer les limites de débit et les disjoncteurs.

#### Phase 4 — Mémoire et connaissance

- Structurer la mémoire persistante.
- Intégrer Graphify au flux de compréhension de la codebase.
- Utiliser `graphify query`, `path` et `explain` pour les analyses ciblées.
- Exécuter `graphify update .` après les modifications de code.

#### Phase 5 — Validation et qualité

- Étendre les tests autour des missions, des échecs et des reprises.
- Vérifier les scénarios dry-run.
- Valider l’idempotence des outils.
- Tester les permissions et les injections de prompt.
- Mesurer l’autonomie réelle sur des missions complètes.

Le README signale 855 tests passants, mais leur répartition et leur couverture ne sont pas fournies.

### 5.2 Dépendances techniques

Les dépendances critiques sont :

- Electron pour l’environnement desktop ;
- React pour l’interface ;
- TypeScript et Node.js pour le runtime ;
- Gemini et OpenRouter pour les modèles IA ;
- Supabase pour la persistance ;
- Redis pour le composant d’infrastructure correspondant ;
- GitHub, Telegram et MCP pour les intégrations ;
- Graphify pour la connaissance de la codebase.

Les versions détaillées, les compatibilités et l’ordre exact d’installation sont **[Information non disponible dans les sources]**.

### 5.3 Risques techniques et mesures de mitigation

| Risque | Impact potentiel | Mesure de mitigation documentée ou déductible |
|---|---|---|
| Exposition de secrets | Compromission de services et de données | Révocation et remplacement immédiats |
| Injection de prompt | Action non autorisée ou détournement de l’agent | Protection contre l’injection, Safety Gate Jev, permissions |
| Action à effet de bord incorrecte | Modification ou transmission non souhaitée | Dry-run, validation, permissions, disjonction |
| Échec d’un outil externe | Mission incomplète ou incohérente | Observation, récupération bornée, replanification |
| Réexécution d’une action | Doublon ou dommage supplémentaire | Idempotence |
| Défaillance d’un fournisseur IA | Interruption ou dégradation de l’exécution | Présence de plusieurs fournisseurs, stratégie exacte non documentée |
| Complexité multi-agents | Conflits ou difficulté de diagnostic | Runtime centralisé et observabilité |
| Graphe obsolète | Analyse incorrecte de la codebase | `graphify update .` après modification |
| Plugin non fiable | Exécution de code ou accès excessif | Sandboxing des plugins |
| Dépassement de quota | Dégradation ou blocage | Limitation de débit et estimation préalable |

---

## 6. 📊 Métriques et monitoring

### 6.1 KPIs techniques

Les sources ne définissent pas de tableau de bord chiffré, mais les indicateurs suivants sont directement cohérents avec l’architecture :

| KPI | Définition |
|---|---|
| Taux de missions terminées | Proportion de missions atteignant leurs critères de succès |
| Taux de vérification réussie | Proportion d’actions ou missions validées après exécution |
| Taux de récupération | Part des échecs résolus par récupération |
| Taux de replanification | Fréquence des missions nécessitant un nouveau plan |
| Taux d’échec par outil | Nombre d’échecs rapporté à l’utilisation d’un outil |
| Taux de blocage sécurité | Actions refusées par permissions ou Safety Gate Jev |
| Utilisation du dry-run | Nombre de missions ou actions simulées avant exécution |
| Coût estimé contre coût observé | Comparaison de l’estimation et de l’exécution réelle |
| Délai estimé contre délai observé | Écart entre planification et réalisation |
| Fraîcheur Graphify | Délai depuis la dernière mise à jour du graphe |
| Couverture de tests | Proportion de composants et scénarios couverts |
| État des intégrations | Disponibilité de GitHub, Telegram, MCP et fournisseurs IA |

Les formules, sources exactes et objectifs cibles sont **[Information non disponible dans les sources]**.

### 6.2 Stratégie de monitoring

Le monitoring doit suivre le cycle complet de la mission et non uniquement la réponse du modèle. Les événements importants à observer sont :

1. création de mission ;
2. compréhension de l’objectif ;
3. acquisition du contexte ;
4. création et modification du plan ;
5. sélection d’un agent ou d’un outil ;
6. décision du Safety Gate Jev ;
7. exécution réelle ou dry-run ;
8. résultat de l’action ;
9. observation ;
10. vérification ;
11. récupération ;
12. replanification ;
13. terminaison.

L’observabilité doit aussi permettre de distinguer :

- une réponse générée ;
- une action réellement exécutée ;
- une action exécutée mais non vérifiée ;
- une action vérifiée avec succès ;
- une action refusée par la sécurité ;
- une action échouée puis récupérée.

Cette distinction est essentielle au regard du principe fondateur de Leanna : la performance est mesurée par l’atteinte vérifiée de l’objectif, et non par la qualité apparente du texte produit.

### 6.3 Seuils d’alerte

Aucun seuil numérique n’est fourni dans les sources. Les seuils exacts sont donc :

- latence maximale : **[Information non disponible dans les sources]** ;
- taux d’échec acceptable : **[Information non disponible dans les sources]** ;
- nombre de tentatives de récupération : **[Information non disponible dans les sources]** ;
- taux de blocage du Safety Gate Jev : **[Information non disponible dans les sources]** ;
- seuil de limitation de débit : **[Information non disponible dans les sources]** ;
- seuil d’ouverture du disjoncteur : **[Information non disponible dans les sources]** ;
- âge maximal acceptable du graphe Graphify : **[Information non disponible dans les sources]**.

Les alertes prioritaires à prévoir, sur la base des risques documentés, sont néanmoins :

- détection d’un nouveau secret exposé ;
- hausse des refus du Safety Gate Jev ;
- répétition d’échecs sur un même outil ;
- déclenchement fréquent des mécanismes de disjonction ;
- augmentation des replanifications ;
- divergence importante entre résultats attendus et résultats vérifiés ;
- échec d’un fournisseur IA ou d’une intégration externe ;
- absence de mise à jour de Graphify après des modifications de code.

---

## Conclusion

Leanna propose une architecture agentique orientée exécution, fondée sur une boucle fermée de compréhension, planification, action, observation, vérification et récupération. Sa valeur technique repose sur la combinaison de plusieurs capacités : runtime événementiel, orchestration multi-agents, registre d’outils, mémoire persistante, graphe de connaissances, estimation préalable et contrôles de sécurité.

Les connexions les plus importantes entre les sources sont les suivantes :

- le runtime centralisé fournit le cadre d’exécution ;
- les missions structurent les objectifs ;
- les outils et agents rendent l’action possible ;
- l’observabilité et la vérification déterminent si l’objectif est réellement atteint ;
- les permissions, le dry-run et le Safety Gate Jev empêchent qu’une génération IA soit transformée sans contrôle en action à effet de bord ;
- Graphify améliore la compréhension de la codebase et doit rester synchronisé avec le code ;
- l’idempotence, la récupération, la replanification, la limitation de débit et les disjoncteurs rendent l’exécution plus résiliente.

Le principal risque immédiat n’est pas architectural mais opérationnel : l’exposition de secrets signalée dans la codebase. Leur révocation et leur remplacement doivent précéder toute poursuite normale du déploiement ou de l’exploitation.