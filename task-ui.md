# 📊 État d'implémentation UI

> Démarrage de la couche interface. Construite sur la stack existante
> (React 19 + Vite + Tailwind 4 + react-router v7, tokens du design system).

| Priorité | Écran UI | Statut |
| --- | --- | --- |
| 🔴 P0 | **Mission Control** (dashboard : état agent, santé projet, insights, opportunités, plan d'amélioration) | ✅ `src/views/MissionControlView.tsx` + route `/mission-control` + entrée nav |
| 🔴 P0 | **Insights / Anticipation** (panneau live des propositions) | ✅ intégré au Mission Control (via `useAutonomyTimeline` étendu aux `proposals`) |
| 🔴 P0 | **Project Intelligence** (gauges de santé par dimension) | ✅ intégré au Mission Control (via `/api/knowledge/doctor`) |
| 🔴 P0 | **Mission Timeline** (UI) — timeline cliquable + panneau de détail d'étape (rewind) | ✅ `src/views/MissionTimelineView.tsx` + route `/mission-timeline` + nav |
| 🔴 P0 | **Agent State / Progress** (barre d'état permanente : état + pourquoi) | ✅ `src/components/AgentStatusBar.tsx` + `src/hooks/useAgentStatus.ts`, montée dans le shell global |
| 🔴 P0 | Autonomy Center | ✅ déjà existant (`/autonomy`) |
| 🟠 P1 | **Simulation / Dry-Run UI** — objectif → simulation → fichiers/commandes/agents/coût/risque + [Modifier/Exécuter/Annuler] | ✅ `src/views/MissionSimulationView.tsx` + route `/mission-simulation` + nav |
| 🟠 P1 | **Agent Swarm** — composition dynamique de l'équipe en pipeline (rôle · étape · raison) | ✅ `src/views/AgentSwarmView.tsx` + route `/agent-swarm` + nav |
| 🟠 P1 | **Explainability — « Pourquoi ? »** — facteurs décisionnels (probabilité, playbook, approche, risques, étape fragile) | ✅ `src/views/ExplainabilityView.tsx` + route `/explainability` + nav |

**UI terminée : P0 (6/6) + P1 (4/4).** Mission Control · Insights · Project Intelligence · Mission Timeline · Agent State bar · Autonomy Center · Simulation/Dry-Run · Agent Swarm · Explainability.

**Navigation** : nouvelle `GlobalSidebar` (`src/components/GlobalSidebar.tsx`) — barre verticale repliable, étiquettes, pastille d'état agent en tête. Deux variantes :
- `variant="global"` (par défaut) : navigation par route, groupée par capacité (Pilotage · Intelligence · Travail · Mémoire · Observabilité) — remplace l'ancienne `UnifiedSidebar` globale.
- `variant="ide"` (dans `IdeView`) : rend les outils-panneaux IDE (Explorateur, Recherche, Terminal, GitHub, CI/CD, Données, Outils, IA) à partir de `ideSidebarConfig`, en pilotant les toggles existants `showX`/`onToggleX` ; items `requiresAssistant` grisés hors connexion. Même look étiqueté/repliable. **Bloc assistant compact en tête (parité 100 %)** : CTA « Connecter l'IA » hors ligne ; une fois connecté, contrôles Chat · Micro · Mode (Full/Ask) · Déconnecter (replié = Chat + Micro).

L'ancienne `UnifiedSidebar` n'est plus montée (conservée dans le repo pour compat).

**Enchaînements fonctionnels** : bouton « Diagnostiquer & créer » sur Mission Control (`POST /api/missions/doctor/create` → crée les missions d'amélioration du Doctor via `mission_create`, puis lien vers la timeline) · bannière « point du jour » (Daily Briefing) affichée automatiquement au chargement · bouton « Automatiser » par opportunité (`POST /api/knowledge/automate` → compile un workflow puis le crée) · bouton « Lancer » par proposition d'anticipation (`POST /api/missions` → crée la mission suggérée, puis timeline).

Backend exposé pour l'UI : `GET /api/knowledge/doctor · /daily-briefing · /opportunities · /profile` (nouveau `insightsRouter`), `GET /api/missions/:id/timeline` et `/timeline/:step` (Mission Time Travel), `POST /api/missions/simulate` (Mission Simulator dry-run), `POST /api/agents/compose-swarm` (SwarmComposer), `POST /api/knowledge/explain` (Predictive Agent + Mission Evolution), et les `proposals` d'anticipation via le WebSocket `/autonomy` existant.

---

Oui. **Au niveau UI**, je pense que Leanna doit évoluer beaucoup plus que simplement ajouter des écrans.

Le changement principal serait de passer d'une **interface d'IDE avec des fonctionnalités IA** à une **interface de centre de contrôle d'un agent autonome**.

### 1. Nouveau centre de commande

L'écran d'accueil devrait être un **Mission Control**.

```text
┌──────────────────────────────────────────────────────────────┐
│ LEANNA                         ● Autonome     Projet: Leanna │
├────────────┬─────────────────────────────────────────────────┤
│            │                                                 │
│  ACCUEIL   │       Que voulez-vous accomplir ?               │
│            │                                                 │
│  MISSIONS  │  ┌───────────────────────────────────────────┐  │
│            │  │ Corrige les erreurs TypeScript et          │  │
│  PROJETS   │  │ vérifie que les tests passent             │  │
│            │  └───────────────────────────────────────────┘  │
│  AGENTS    │                                                 │
│            │  [ ▶ Lancer ]    [ Simuler ]                    │
│  WORKFLOWS │                                                 │
│            │                                                 │
│  MÉMOIRE   │  ─────────── ACTIVITÉ ───────────────────────  │
│            │                                                 │
│  INSIGHTS  │  ● Analyse du projet                            │
│            │  ● 3 problèmes détectés                         │
│  OUTILS    │  ● Mission #128 terminée                        │
│            │                                                 │
│  ────────  │  ─────────── SANTÉ ──────────────────────────  │
│  PARAMÈTRES│                                                 │
│            │  Code       ████████░░  82%                     │
│            │  Tests      █████████░  91%                     │
│            │  Sécurité   ███████░░░  74%                     │
└────────────┴─────────────────────────────────────────────────┘
```

### 2. Une vraie **Mission UI**

C'est probablement le composant le plus important.

Une mission ne devrait plus apparaître comme un simple chat.

Elle devrait être représentée comme une **opération en cours** :

```text
MISSION #128
Corriger les erreurs TypeScript
────────────────────────────────────────

OBJECTIF
Corriger toutes les erreurs bloquantes
sans modifier l'API publique.

PROGRESSION
● Compréhension       ✓
● Analyse             ✓
● Planification       ✓
● Modification        ●
○ Vérification
○ Validation

AGENTS
🧠 Architecte
💻 Coder
🧪 Tester
🔍 Reviewer

ACTIVITÉ
12:04  Analyse de 42 fichiers
12:05  7 erreurs détectées
12:06  Plan généré
12:07  Modification de 3 fichiers

────────────────────────────────────────
Fichiers : 3      Outils : 14
Temps : 02:31     Confiance : 91%

             [Pause] [Voir détails]
```

Leanna doit donner à l'utilisateur **la sensation de suivre un processus vivant**, pas de regarder un terminal.

---

# 3. Le chat ne doit plus être l'interface principale

Je ferais du chat une **interface secondaire**.

Aujourd'hui beaucoup d'applications IA font :

> utilisateur → chat → réponse

Leanna devrait faire :

> **objectif → mission → raisonnement → exécution → preuve → résultat**

Le chat devient alors un moyen de dialoguer avec la mission.

Par exemple :

> **Pourquoi as-tu choisi cette solution ?**

Leanna répond dans le contexte de la mission.

---

# 4. Une barre d'état permanente de l'agent

En haut de l'application :

```text
● LEANNA
────────────────────────────────────────

🧠 Réflexion     ⚙ Exécution     🔍 Vérification
                         ↓
                    Mission #128
```

Avec un état clair :

* 🟢 **Idle**
* 🔵 **Thinking**
* 🟡 **Planning**
* 🟠 **Executing**
* 🟣 **Verifying**
* 🔴 **Blocked**
* ⚪ **Waiting**
* ✅ **Completed**

Et surtout :

### **Pourquoi Leanna est dans cet état ?**

Exemple :

> 🟠 Exécution
> Modification de `AgentRuntime.ts`
> 3/7 actions terminées

C'est beaucoup plus rassurant qu'un simple spinner.

---

# 5. Une UI "Autonomy"

Je créerais un écran dédié :

## Autonomy Center

```text
AUTONOMIE
────────────────────────────────────

Mode actuel
        🟢 AUTONOME

Niveau d'autorisation
        ████████░░  80%

Lecture             ✓
Écriture            ✓
Terminal            ✓
Internet             ✓
Git                  ✓
Actions dangereuses  ⚠ Confirmation

────────────────────────────────────

MISSIONS AUTORISÉES

✓ Corriger les erreurs
✓ Lancer les tests
✓ Refactorer
✓ Analyser les dépendances
⚠ Modifier infrastructure
⚠ Supprimer fichiers

────────────────────────────────────

APPRENTISSAGE

Playbooks appris             47
Stratégies fiables           31
Échecs mémorisés             12
Améliorations détectées       8
```

Cela permettrait de rendre **l'autonomie visible et contrôlable**.

---

# 6. Une Timeline de mission

Très importante pour Leanna.

```text
12:01  OBJECTIF
       ↓
12:02  PERCEPTION
       42 fichiers analysés
       ↓
12:03  PLAN
       7 actions prévues
       ↓
12:05  ACTION
       Agent Coder
       ↓
12:07  ÉCHEC
       TypeScript error TS2345
       ↓
12:08  RECOVERY
       Nouveau plan généré
       ↓
12:10  VÉRIFICATION
       848 tests
       ↓
12:12  SUCCESS
```

Chaque étape doit être **cliquable**.

On pourrait ouvrir :

* prompt utilisé
* contexte
* outils appelés
* fichiers modifiés
* résultat
* erreur
* décision de Leanna
* coût
* durée
* preuve de réussite

C'est là que Leanna peut devenir très intéressante pour le debugging d'agents.

---

# 7. "Pourquoi ?" partout

Une caractéristique UI que je mettrais fortement en avant :

### Explainability native

À côté des décisions :

> Pourquoi ?

Exemple :

```text
Leanna a choisi AgentDebugger

Pourquoi ?

• 3 erreurs TypeScript
• historique similaire : 87% réussite
• ce playbook a déjà corrigé 14 missions
• coût estimé inférieur de 32%

[Voir raisonnement décisionnel]
```

Pas le raisonnement interne privé du modèle, évidemment, mais **les facteurs décisionnels et preuves exploitables**.

---

# 8. Project Intelligence

Dans chaque projet :

```text
LEANNA PROJECT INTELLIGENCE

Architecture
██████████████████░░

Compréhension
████████████████░░░░

Tests
███████████████████░

Sécurité
██████████████░░░░░░

Dette technique
████████░░░░░░░░░░░░

────────────────────

⚠ 4 problèmes critiques

1. 3 dépendances vulnérables
2. 17 fichiers sans tests
3. Architecture circulaire détectée
4. 2 workflows fragiles

[Diagnostiquer] [Créer missions]
```

Leanna devient ainsi une **interface de compréhension du projet**, pas simplement un éditeur.

---

# 9. Une zone "Insights"

C'est là que je mettrais l'**Anticipation Engine**.

```text
INSIGHTS DE LEANNA
────────────────────────────────────

🔴 IMPORTANT

Votre dernier changement a augmenté
le temps des tests de 31%.

[Analyser]

🟡 OPPORTUNITÉ

Cette opération est répétée 8 fois
par semaine.

Je peux créer une automatisation.

[Automatiser]

🔵 RECOMMANDATION

Leanna a détecté une stratégie plus
efficace pour les erreurs TS2345.

[Créer un Playbook]
```

Ça donne enfin une sensation de **proactivité**.

---

# 10. Agent Swarm visuel

Si plusieurs agents travaillent ensemble :

```text
                 🧠 LEANNA
                     │
          ┌──────────┼──────────┐
          │          │          │
       🏗️ ARCH      💻 CODER   🧪 TESTER
          │          │          │
          └──────────┼──────────┘
                     │
                  🔍 REVIEW
                     │
                   RESULT
```

Chaque agent peut afficher :

* mission
* état
* fichiers
* outils
* progression
* résultat

Cela rendrait le système de délégation beaucoup plus compréhensible.

---

# 11. Une UI "Simulation"

Avant une grosse mission :

```text
SIMULATION
────────────────────────────────────

Objectif :
Refactorer AgentRuntime

ESTIMATION

Fichiers touchés       14
Agents utilisés         4
Outils                  37
Durée estimée       4m 20s
Risque                 Moyen
Confiance               88%

Actions dangereuses     0
Modifications API       1

────────────────────────────────────

⚠ Risque détecté

AgentRuntime est utilisé par
6 composants critiques.

[Modifier le plan]

[Annuler]             [Exécuter]
```

Ça serait particulièrement cohérent avec ton `DryRun`.

---

# 12. UI "Time Travel"

Je pousserais même plus loin :

```text
MISSION #128

● Plan
│
● Analyse
│
● Modification 1
│
● Modification 2
│
● Échec
│
● Recovery
│
● Modification 3
│
● Tests
│
● SUCCESS
```

L'utilisateur peut sélectionner :

> **État avant modification 2**

et voir :

```text
État du workspace
Contexte agent
Plan
Fichiers
Git diff
Logs
Mémoire
```

Puis :

**[Reprendre depuis ici]**

Ça serait une fonctionnalité très différenciante.

---

# 13. Je changerais également la navigation

Je partirais sur quelque chose de beaucoup plus simple :

```text
┌──────────────────────────┐
│ 🧠 LEANNA                │
│                          │
│ ACCUEIL                  │
│                          │
│ 🎯 Missions              │
│ 📁 Projets               │
│ 🤖 Agents                │
│ 🧠 Intelligence          │
│                          │
│ ⚙ Automatisations        │
│ 🧰 Outils                │
│                          │
│ 📊 Observabilité         │
│ 🔐 Sécurité              │
│                          │
│ ⚙ Paramètres             │
└──────────────────────────┘
```

Et **pas** :

> Agents / Skills / Tools / Plugins / Workflows / Memory / Knowledge / Runtime / Mission / Brain...

Ça expose trop l'architecture interne.

L'utilisateur doit voir **des capacités**, pas tes classes TypeScript.

---

# 14. Le vrai changement UX

Je ferais évoluer Leanna de :

**IDE + Chat + outils**

vers :

**Mission Control + Agent Workspace**

avec cette hiérarchie :

```text
                    LEANNA
                       │
              ┌────────┴────────┐
              │                 │
          PROJETS             MISSIONS
              │                 │
        Intelligence         Exécution
              │                 │
              └────────┬────────┘
                       │
                    AGENTS
                       │
             ┌─────────┼─────────┐
             │         │         │
           Tools    Memory    Workflows
```

Les outils, skills, runtime, mémoire, agents, etc. deviennent **l'infrastructure invisible** derrière cette expérience.

### Priorité UI que je recommande

| Priorité | Fonction UI                 | Impact |
| -------- | --------------------------- | ------ |
| 🔴 P0    | **Mission Control**         | ⭐⭐⭐⭐⭐  |
| 🔴 P0    | **Mission Timeline**        | ⭐⭐⭐⭐⭐  |
| 🔴 P0    | **Agent State / Progress**  | ⭐⭐⭐⭐⭐  |
| 🔴 P0    | **Project Intelligence**    | ⭐⭐⭐⭐⭐  |
| 🔴 P0    | **Insights / Anticipation** | ⭐⭐⭐⭐⭐  |
| 🔴 P0    | **Autonomy Center**         | ⭐⭐⭐⭐⭐  |
| 🟠 P1    | Simulation / Dry Run UI     | ⭐⭐⭐⭐⭐  |
| 🟠 P1    | Agent Swarm visualisation   | ⭐⭐⭐⭐   |
| 🟠 P1    | Time Travel                 | ⭐⭐⭐⭐⭐  |
| 🟠 P1    | Explainability              | ⭐⭐⭐⭐⭐  |
| 🟡 P2    | Voice control               | ⭐⭐⭐⭐   |
| 🟡 P2    | Computer-use visualisation  | ⭐⭐⭐⭐   |

**Le point essentiel :** ne construis pas 30 nouveaux écrans. Construis **une UI cohérente autour de la mission autonome**.

Si on fait ça correctement, l'utilisateur ouvre Leanna et comprend immédiatement :

> **ce que Leanna sait, ce qu'elle fait, pourquoi elle le fait, ce qu'elle a découvert et ce qu'elle propose de faire ensuite.**

C'est, à mon avis, le vrai saut UI/UX qui ferait passer Leanna d'un **AI IDE très riche** à un **véritable poste de pilotage d'agent autonome**.
