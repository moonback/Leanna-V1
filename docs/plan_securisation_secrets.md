# Plan d'Action : Sécurisation et Gestion des Secrets

Ce plan détaille les étapes pour sécuriser les variables sensibles détectées lors de l'audit et mettre en place une gestion robuste des secrets.

## Phase 1 : Identification et Nettoyage
- [ ] Lister précisément toutes les variables stockées en clair dans le fichier `.env`.
- [ ] Supprimer les clés et secrets codés en dur dans le code source (`server/security.ts`, etc.).
- [ ] Remplacer les valeurs supprimées par des références à des variables d'environnement.

## Phase 2 : Mise en Place d'un Gestionnaire de Secrets
- [ ] Intégrer une solution de gestion des secrets ou chiffrer les fichiers de configuration contenant des données sensibles.
- [ ] Créer un fichier `.env.example` sans valeurs sensibles servant de modèle pour le projet.

## Phase 3 : Validation et Typage
- [ ] Implémenter une validation stricte des variables d'environnement avec la bibliothèque `zod`.
- [ ] Remplacer chaque accès direct à `process.env` par une fonction d'accès typée.