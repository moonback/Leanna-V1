# Plan d'Action Détaillé : Transformation de l'IA vers une Assistante Généraliste

Ce plan détaille les étapes pour faire évoluer l'IA d'un outil spécialisé dans le code/IDE vers une assistante généraliste dédiée au quotidien et à l'information.

## Phase 1 : Socle & Modèle

### 1.1. Redéfinition du Persona et du System Prompt
- **Objectif** : Adapter le ton, l'empathie et la pédagogie.
- **Actions** :
  - **Identité** : Réécrire le *System Prompt* pour définir une identité accueillante, neutre, polyvalente et axée sur l'aide au quotidien. Exclure toute référence à des rôles de développeur.
  - **Garde-fous** : Implémenter des garde-fous stricts interdisant de donner des conseils médicaux, juridiques ou financiers critiques sans clause de non-responsabilité.
  - **Style** : Ajuster la longueur des réponses pour privilégier la concision tout en restant informatif. Adopter un style chaleureux et encourageant.
  - **Paramètres** : Augmenter la température du modèle (ex: de 0.2 pour du code à 0.7 pour de la créativité et de la discussion).

### 1.2. Reconversion de la Stratégie de Données
- **Objectif** : Déconnecter les outils de code et connecter les outils utilitaires.
- **Actions** :
  - **Nettoyage** : Désactiver l'indexation de dépôts Git, les outils d'analyse statique (LSP) et les compétences spécifiques au refactoring.
  - **Recherche Web** : Implémenter un module de RAG (Retrieval-Augmented Generation) robuste interrogeant des moteurs de recherche généralistes et des sources d'actualités fiables.
  - **APIs Utilitaires** : Intégrer des APIs tierces pour le quotidien :
    - Météo (ex: OpenWeatherMap)
    - Actualités (ex: NewsAPI)
    - Géolocalisation et itinéraires (ex: Google Maps Platform)
    - Agendas et rappels (intégration utilisateur sécurisée)

## Phase 2 : Interface & Accessibilité

### 2.1. Restructuration de l'Expérience Utilisateur
- **Objectif** : Migrer de l'environnement IDE vers une interface multi-support.
- **Actions** :
  - **Décommissionnement** : Retirer progressivement le support des extensions VS Code et JetBrains.
  - **Interface Web/Mobile** : Concevoir une application Web et Mobile épurée, centrée sur le chat conversationnel, utilisant Tailwind CSS pour un design moderne et accessible (WCAG).
  - **Modularité** : Ajouter des widgets pour afficher la météo, les horaires ou les tâches en cours en plus de la conversation textuelle.
  - **Voralité** : Intégrer les technologies STT (Speech-to-Text) et TTS (Text-to-Speech) (ex: Web Speech API) pour permettre des interactions orales naturelles et fluides.

## Phase 3 : Validation & Lancement

### 3.1. Pivot des Métriques d'Évaluation
- **Objectif** : Valider la qualité des réponses généralistes et l'absence d'hallucinations.
- **Actions** :
  - **Benchmarks** : Remplacer les benchmarks de code (HumanEval, MBPP) par des benchmarks de connaissances générales, de logique quotidienne et de satisfaction utilisateur (ex: MMLU, Chatbot Arena).
  - **Fact-Checking** : Activer un pipeline de détection d'hallucinations croisant les réponses générées avec des sources Web en temps réel.
  - **RLHF** : Lancer des campagnes d'évaluation humaine axées sur la serviabilité (*helpfulness*) et l'innocuité (*harmlessness*).

### 3.2. Transition et Onboarding Utilisateur
- **Objectif** : Accompagner l'utilisateur actuel et attirer le nouveau public.
- **Actions** :
  - **Rebranding** : Mettre à jour la communication, le logo et le nom de l'assistant pour refléter sa nouvelle nature.
  - **Onboarding Interactif** : Déployer un tutoriel d'accueil proposant des exemples de requêtes quotidiennes (recettes, organisation de voyages, vulgarisation scientifique).
