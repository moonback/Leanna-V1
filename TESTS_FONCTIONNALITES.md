# 🧪 Questions de test — Leanna

> Fichier de test manuel. Pose chaque question/commande à Leanna, compare la
> réponse réelle au **résultat attendu**, puis note le statut.
>
> Statut : `⬜` à tester · `✅` OK · `⚠️` partiel · `❌` bug

---

## 🧠 1. Interaction IA de base

| Question / commande à poser | Résultat attendu | Statut |
|---|---|---|
| Bonjour Leanna, présente-toi en une phrase. | Présentation courte et cohérente de l'assistant | ⬜ |
| Quel modèle utilises-tu actuellement ? | Nom du modèle actif affiché | ⬜ |
| Change de modèle pour un modèle plus rapide. | Confirmation du changement de modèle | ⬜ |
| Combien de tokens cette conversation a-t-elle consommés ? | Compteur de tokens affiché | ⬜ |
| Active le mode raisonnement et explique une closure JS. | Mode raisonnement activé + explication correcte | ⬜ |
| Résume notre conversation jusqu'ici. | Résumé fidèle des échanges | ⬜ |

---

## 🎯 2. Système de missions

| Question / commande à poser | Résultat attendu | Statut |
|---|---|---|
| Crée une mission : « Ajouter un fichier LICENSE au projet ». | Mission créée avec un id | ⬜ |
| Liste toutes mes missions actives et terminées. | Liste des missions avec statut | ⬜ |
| Montre l'estimation (coût, durée, risque) avant exécution. | Bannière coût $ / durée / niveau de risque + confiance | ⬜ |
| Mets la mission en cours en pause. | Statut `paused` | ⬜ |
| Reprends la mission en pause. | Statut `in_progress` | ⬜ |
| Annule la mission en cours. | Statut `cancelled` | ⬜ |
| Supprime la mission annulée. | Mission retirée de la liste | ⬜ |
| Y a-t-il des approbations en attente ? | Liste des approbations (ou vide) | ⬜ |

### Modes d'autonomie

| Question / commande à poser | Résultat attendu | Statut |
|---|---|---|
| Quel est mon mode d'autonomie actuel ? | Mode courant (`suggest`/`ask`/`auto`) | ⬜ |
| Passe en mode `suggest`. | Confirmation `mode: suggest` | ⬜ |
| Passe en mode `ask`. | Confirmation `mode: ask` | ⬜ |
| Passe en mode `auto`. | Confirmation `mode: auto` | ⬜ |

---

## 🤖 3. Agents multi-rôles

| Question / commande à poser | Résultat attendu | Statut |
|---|---|---|
| Quel est le statut de l'orchestrateur d'agents ? | Statut + liste des outils agents | ⬜ |
| Liste tous les rôles d'agents disponibles. | 15 rôles statiques (+ dynamiques éventuels) | ⬜ |
| Montre les 10 dernières tâches des agents. | Liste de tâches avec rôle et statut | ⬜ |
| Délègue à `coder` : « fonction qui additionne deux nombres ». | Tâche déléguée + code produit | ⬜ |
| Délègue à `reviewer` une revue de `server.ts`. | Tâche de revue créée + retour | ⬜ |
| Lance une collaboration `code-review` sur `server.ts`. | Orchestration démarrée (plusieurs tâches) | ⬜ |
| Montre les métriques du bus de messages inter-agents. | Compteurs envoyés/reçus/erreurs | ⬜ |
| Quels outils sont disponibles pour le rôle `coder` ? | Liste d'outils + count | ⬜ |
| Montre le mapping outil → agent principal. | Table outil → agent | ⬜ |

### Agents dynamiques / personnalisés

| Question / commande à poser | Résultat attendu | Statut |
|---|---|---|
| Génère un agent dynamique « traduit en espagnol ». | Définition d'agent générée | ⬜ |
| Liste tous les agents dynamiques enregistrés. | Liste des agents dynamiques | ⬜ |
| Le rôle `translator` existe-t-il ? | Oui (rôle statique) | ⬜ |
| Crée un agent personnalisé puis supprime-le. | Création puis suppression confirmées | ⬜ |

---

## 📁 4. IDE — Système de fichiers

| Question / commande à poser | Résultat attendu | Statut |
|---|---|---|
| Affiche l'arborescence du workspace. | Arbre des fichiers (hors node_modules/.git) | ⬜ |
| Lis le contenu de `package.json`. | Contenu du fichier affiché | ⬜ |
| Crée `test/hello.txt` avec le texte « bonjour ». | Fichier créé avec le contenu | ⬜ |
| Crée un dossier `test/demo`. | Dossier créé | ⬜ |
| Renomme `test/hello.txt` en `test/salut.txt`. | Fichier renommé | ⬜ |
| Copie `test/salut.txt` vers `test/salut_copie.txt`. | Copie créée | ⬜ |
| Recherche le mot « Leanna » dans tout le projet. | Résultats avec fichier + ligne | ⬜ |
| Recherche regex `function\s+\w+` dans les `.ts`. | Correspondances regex trouvées | ⬜ |
| Supprime le dossier `test`. | Dossier supprimé | ⬜ |

---

## 📦 5. Sandbox (bac à sable)

| Question / commande à poser | Résultat attendu | Statut |
|---|---|---|
| Quel est l'état actuel du sandbox ? | `active`, chemin, fichiers modifiés | ⬜ |
| Initialise le sandbox. | Copie miroir créée (filesCopied) | ⬜ |
| Active le mode sandbox. | `active: true` | ⬜ |
| Modifie un fichier et montre le diff du sandbox. | Liste des fichiers modifiés | ⬜ |
| Montre le diff avant/après d'un fichier précis. | Contenu original vs modifié | ⬜ |
| Lance la validation TypeScript du sandbox. | `valid` + nb erreurs/warnings | ⬜ |
| Accepte un fichier modifié vers le workspace. | `applied: true` + post-validation | ⬜ |
| Rejette (restaure) un fichier modifié. | `reverted: true` | ⬜ |
| Abandonne toutes les modifications du sandbox. | Restore complet | ⬜ |
| Désactive le sandbox (code de sécurité requis). | Demande de code 6 chiffres puis désactivation | ⬜ |

---

## 📚 6. Connaissance & compréhension du projet

| Question / commande à poser | Résultat attendu | Statut |
|---|---|---|
| Quel est le statut d'indexation du Knowledge Graph ? | État de l'indexation | ⬜ |
| Lance une re-indexation complète du workspace. | Scan lancé | ⬜ |
| Analyse l'impact d'une modification de `server.ts`. | Dépendances impactées listées | ⬜ |
| Donne ta compréhension contextuelle de `server.ts`. | Résumé sémantique du fichier | ⬜ |
| Analyse la structure globale du projet. | Vue d'ensemble de l'architecture | ⬜ |
| Montre le graphe de dépendances d'un module. | Dépendances entrantes/sortantes | ⬜ |

---

## 🧠 7. Mémoire

| Question / commande à poser | Résultat attendu | Statut |
|---|---|---|
| Liste mes mémoires long-terme. | Liste des mémoires (Supabase requis) | ⬜ |
| Mémorise que je préfère TypeScript au JavaScript. | Mémoire enregistrée | ⬜ |
| Supprime une mémoire précise. | Mémoire supprimée | ⬜ |

### Mémoire hiérarchique

| Question / commande à poser | Résultat attendu | Statut |
|---|---|---|
| Montre les statistiques de la mémoire hiérarchique. | Stats par tier | ⬜ |
| Stocke une entrée dans le tier `session`. | Entrée stockée | ⬜ |
| Recherche « TypeScript » dans la mémoire hiérarchique. | Résultats correspondants | ⬜ |
| Liste les entrées du tier `session`. | Liste du tier | ⬜ |
| Promeus une entrée vers un tier supérieur. | Entrée promue | ⬜ |

---

## 💬 8. Conversations

| Question / commande à poser | Résultat attendu | Statut |
|---|---|---|
| Liste mes conversations récentes. | Liste paginée | ⬜ |
| Recherche « sandbox » dans l'historique des messages. | Résultats full-text classés | ⬜ |
| Renomme la conversation en « Tests fonctionnalités ». | Titre mis à jour | ⬜ |
| Supprime une conversation précise. | Conversation supprimée | ⬜ |

---

## 🔧 9. Compétences (Skills)

| Question / commande à poser | Résultat attendu | Statut |
|---|---|---|
| Liste tous les skills natifs avec leur statut. | Liste + statut (active/authenticated/requires_auth) | ⬜ |
| Liste mes custom skills. | Liste des custom skills | ⬜ |
| Crée un custom skill « saluer » (dit bonjour avec mon nom). | Skill créé | ⬜ |
| Supprime le custom skill « saluer ». | Skill supprimé | ⬜ |

---

## 🔀 10. Git & GitHub

| Question / commande à poser | Résultat attendu | Statut |
|---|---|---|
| Quel est le statut Git du workspace ? | Branche + fichiers modifiés | ⬜ |
| Montre les 5 derniers commits. | Liste de commits (hash, auteur, message) | ⬜ |
| Montre le détail du dernier commit. | Infos + fichiers modifiés | ⬜ |
| Crée un commit « test: vérification Leanna ». | Commit créé | ⬜ |
| Quel est le repo distant courant (owner/repo) ? | owner/repo + URL remote | ⬜ |
| Liste mes repos GitHub. | Liste (GITHUB_TOKEN requis) | ⬜ |
| Liste les issues ouvertes d'un repo. | Liste d'issues | ⬜ |
| Liste les pull requests ouvertes. | Liste de PRs | ⬜ |
| Montre mes notifications GitHub non lues. | Liste de notifications | ⬜ |
| Recherche le repo « react » sur GitHub. | Résultats de recherche | ⬜ |

---

## ⚙️ 11. Profil, tokens & environnement

| Question / commande à poser | Résultat attendu | Statut |
|---|---|---|
| Montre mon profil IA (nom, voix, langue, style). | Profil complet | ⬜ |
| Change mon style de réponse en « concis ». | Profil mis à jour | ⬜ |
| Liste mes clés API et leur validité. | Clés + configured/valid + preview masqué | ⬜ |
| Montre le pool de clés Gemini. | Liste des clés du pool | ⬜ |
| Liste les variables d'environnement par section. | Sections + variables (secrets masqués) | ⬜ |
| Révèle la valeur de `PORT`. | Valeur en clair | ⬜ |
| Montre l'estimation d'optimisation des tokens. | Budget par modèle | ⬜ |

---

## 📓 12. Notebooks & RAG

| Question / commande à poser | Résultat attendu | Statut |
|---|---|---|
| Liste mes notebooks. | Liste des notebooks | ⬜ |
| Crée un notebook « Recherche IA ». | Notebook créé | ⬜ |
| Upload un document PDF dans ce notebook. | Source ingérée | ⬜ |
| Pose une question sur le contenu (RAG). | Réponse + sources citées | ⬜ |
| Relance l'indexation vectorielle des sources. | Reindex lancé | ⬜ |
| Supprime le notebook « Recherche IA ». | Notebook supprimé | ⬜ |
| Interroge le notebook à la voix. | Réponse vocale au query | ⬜ |
| Génère un résumé vocal des points clés. | Audio généré | ⬜ |

---

## 📄 13. Documents

| Question / commande à poser | Résultat attendu | Statut |
|---|---|---|
| Upload un document et indexe-le. | Document indexé | ⬜ |
| Liste les documents indexés. | Liste des documents | ⬜ |
| Supprime un document indexé. | Document supprimé | ⬜ |
| Génère un document PDF à partir d'un texte. | PDF généré | ⬜ |
| Exporte un document en DOCX. | DOCX généré | ⬜ |
| Exporte un contenu en HTML. | HTML généré | ⬜ |

---

## 🖼️ 14. Génération d'images

| Question / commande à poser | Résultat attendu | Statut |
|---|---|---|
| Génère une image d'un chat astronaute. | Image produite | ⬜ |
| Génère un logo minimaliste pour « Nova ». | Image/logo produit | ⬜ |

---

## 🗺️ 15. Workflows & automatisation

| Question / commande à poser | Résultat attendu | Statut |
|---|---|---|
| Liste tous mes workflows. | Liste avec enabled/schedule | ⬜ |
| Crée un workflow « lint quotidien » toutes les 24h. | Workflow créé | ⬜ |
| Exécute immédiatement un workflow. | Résultat d'exécution | ⬜ |
| Active/désactive un workflow. | Toggle appliqué | ⬜ |
| Montre les workflows en cours d'exécution. | Liste des runs actifs | ⬜ |
| Supprime un workflow. | Workflow supprimé | ⬜ |
| Liste les tâches d'automatisation planifiées. | Liste des tâches | ⬜ |
| Crée une tâche planifiée toutes les 10 minutes. | Tâche créée | ⬜ |
| Désactive une tâche planifiée. | Tâche désactivée | ⬜ |

---

## 💻 16. Terminal & commandes projet

| Question / commande à poser | Résultat attendu | Statut |
|---|---|---|
| Exécute `npm ls` (lecture seule). | Sortie sans confirmation | ⬜ |
| Lance les tests du projet (`npm test`). | Tests exécutés | ⬜ |
| Lance le build (`npm run build`). | Build exécuté | ⬜ |
| Lance le typecheck (`npm run typecheck`). | Typecheck exécuté | ⬜ |
| Tente une commande dangereuse (ex: `rm`). | Commande **bloquée** / refus sûr | ⬜ |

---

## 🌐 17. Navigateur intégré & recherche web

| Question / commande à poser | Résultat attendu | Statut |
|---|---|---|
| Ouvre `https://example.com` dans le navigateur intégré. | Page ouverte | ⬜ |
| Recherche « dernières versions de Node.js » sur le web. | Résultats web | ⬜ |
| Extrais les liens de la page actuelle. | Liens normalisés/filtrés | ⬜ |
| Recherche multi-sources (fiabilité + consensus). | Sources, fiabilité, consensus, confiance | ⬜ |
| localhost autorisé mais IP privée refusée. | localhost OK, RFC1918 refusé | ⬜ |

---

## 🎙️ 18. TTS (synthèse vocale)

| Question / commande à poser | Résultat attendu | Statut |
|---|---|---|
| Lis à voix haute « Bonjour, je suis Leanna ». | Audio synthétisé | ⬜ |
| Montre les statistiques du cache TTS. | Métriques cache/file/provider | ⬜ |
| Vide le cache TTS. | Cache vidé | ⬜ |

---

## 🔐 19. Sécurité, audit & sauvegardes

| Question / commande à poser | Résultat attendu | Statut |
|---|---|---|
| Montre le log d'audit des opérations fichiers. | Liste d'événements (action, cible, acteur) | ⬜ |
| Crée un checkpoint. | Checkpoint créé | ⬜ |
| Liste les checkpoints disponibles. | Liste des checkpoints | ⬜ |
| Valide le build courant. | Résultat de validation | ⬜ |
| Restaure le workspace à un checkpoint. | Rollback effectué | ⬜ |
| Montre la configuration des garde-fous. | Config safeguards.json | ⬜ |
| Fais un audit de sécurité du projet. | Rapport d'audit | ⬜ |

---

## 🖥️ 20. Workspace & projets

| Question / commande à poser | Résultat attendu | Statut |
|---|---|---|
| Quel est le workspace racine courant ? | Chemin du workspace actif | ⬜ |
| Liste tous les workspaces enregistrés. | Historique des dépôts | ⬜ |
| Valide un chemin avant ouverture. | Validation OK/KO | ⬜ |
| Crée un nouveau projet vierge. | Projet créé et activé | ⬜ |
| Échafaude un projet avec un framework. | Scaffold streamé (SSE) | ⬜ |
| Clone un dépôt distant. | Clone streamé (SSE) | ⬜ |
| Change le workspace actif. | Workspace changé | ⬜ |

---

## 📋 21. Listes

| Question / commande à poser | Résultat attendu | Statut |
|---|---|---|
| Crée une liste « courses » : lait, pain, œufs. | Liste créée | ⬜ |
| Montre la liste « courses ». | Items affichés | ⬜ |
| Ajoute « beurre » à « courses ». | Item ajouté | ⬜ |
| Retire « pain » de « courses ». | Item retiré | ⬜ |
| Supprime la liste « courses ». | Liste supprimée | ⬜ |

---

## 📊 22. Observabilité & coûts

| Question / commande à poser | Résultat attendu | Statut |
|---|---|---|
| Montre le tableau de bord d'observabilité. | Stats agrégées (jour) | ⬜ |
| Montre l'usage détaillé tokens/coûts. | Détail par mission/agent/provider | ⬜ |
| Montre les stats des dernières 24h. | Agrégats 24h | ⬜ |
| Montre les stats de la dernière heure. | Agrégats 1h | ⬜ |
| Définis un budget max de 10000 tokens pour une mission. | Budget enregistré | ⬜ |
| Montre l'état du service de télémétrie. | Health OK | ⬜ |

---

## 🔌 23. Intégrations

### Telegram

| Question / commande à poser | Résultat attendu | Statut |
|---|---|---|
| Quel est le statut du bot Telegram ? | Statut du bot | ⬜ |
| Montre la configuration Telegram. | Config (token masqué, users…) | ⬜ |
| Démarre le bot Telegram. | Bot démarré | ⬜ |
| Envoie un message de test. | Message reçu | ⬜ |
| Envoie un fichier du workspace vers Telegram. | Fichier envoyé | ⬜ |
| Diffuse un message à tous les utilisateurs autorisés. | Broadcast envoyé | ⬜ |
| Arrête le bot Telegram. | Bot arrêté | ⬜ |

### MCP

| Question / commande à poser | Résultat attendu | Statut |
|---|---|---|
| Quel est le statut des serveurs MCP connectés ? | Liste des serveurs + état | ⬜ |
| Recherche des serveurs MCP dans l'annuaire. | Résultats annuaire Harbor | ⬜ |
| Installe un serveur MCP depuis l'annuaire. | Serveur installé + connecté | ⬜ |
| Appelle un outil sur un serveur MCP. | Résultat de l'outil | ⬜ |

### OpenRouter

| Question / commande à poser | Résultat attendu | Statut |
|---|---|---|
| Teste la validité de ma clé OpenRouter. | Clé valide/invalide | ⬜ |
| Liste les modèles OpenRouter disponibles. | Liste de modèles | ⬜ |
| Fais une complétion de chat via OpenRouter. | Réponse du modèle | ⬜ |

### PM2

| Question / commande à poser | Résultat attendu | Statut |
|---|---|---|
| Montre l'état des processus PM2. | Liste des processus | ⬜ |
| Montre les logs d'un processus PM2. | Logs affichés | ⬜ |
| Redémarre un processus PM2. | Processus redémarré | ⬜ |

### FTP

| Question / commande à poser | Résultat attendu | Statut |
|---|---|---|
| Connecte-toi à un serveur FTP. | Connexion établie | ⬜ |
| Liste les fichiers d'un répertoire FTP. | Liste des fichiers | ⬜ |

---

## 🛒 24. Marketplace

| Question / commande à poser | Résultat attendu | Statut |
|---|---|---|
| Liste les agents et skills du marketplace. | Catalogue affiché | ⬜ |
| Installe un item du marketplace. | Item installé | ⬜ |

---

## 🔄 25. Runtime autonome

| Question / commande à poser | Résultat attendu | Statut |
|---|---|---|
| Montre l'état du runtime autonome + tâches récentes. | État + ≤100 tâches | ⬜ |
| Montre la timeline des événements d'autonomie. | Événements `autonomy:*` | ⬜ |

---

## 🧰 26. Tools Registry (diagnostic)

| Question / commande à poser | Résultat attendu | Statut |
|---|---|---|
| Montre l'inventaire complet des outils enregistrés. | Outils + source | ⬜ |
| Combien d'outils enregistrés par source ? | Compteur par source | ⬜ |

---

## 📤 27. Export global

| Question / commande à poser | Résultat attendu | Statut |
|---|---|---|
| Exporte mes conversations. | Fichier d'export produit | ⬜ |
| Exporte mes mémoires. | Fichier d'export produit | ⬜ |

---

## ✅ 28. Boucle complète (test end-to-end)

| Scénario à tester | Résultat attendu | Statut |
|---|---|---|
| « Corrige un bug fictif dans un fichier de test ». | Comprend → planifie → agit → observe → vérifie → termine | ⬜ |
| Donne un objectif ambigu. | Leanna demande une clarification | ⬜ |
| Objectif à risque élevé (suppression massive). | Approbation / garde-fou déclenché | ⬜ |
| Interromps (kill-switch) une mission en cours. | Mission arrêtée proprement | ⬜ |
