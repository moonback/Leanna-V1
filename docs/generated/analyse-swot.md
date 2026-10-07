## 📊 Analyse SWOT — Leanna

**Sujet principal :** Leanna, environnement d’exécution d’agents IA autonomes natif pour le bureau, combinant un runtime agentique, un IDE, une orchestration multi-agents, des outils d’automatisation, une mémoire persistante, un graphe de connaissances et des mécanismes de sécurité.

### 💪 Forces (Strengths)

- **Une approche orientée exécution plutôt que génération de réponses**  
  Leanna transforme un objectif en séquence d’actions : compréhension, planification, exécution, observation, vérification, récupération et replanification. Cette approche dépasse le fonctionnement d’un assistant conversationnel classique.

- **Boucle d’exécution fermée et vérifiable**  
  Le système ne considère pas une tâche comme terminée lorsqu’une réponse est générée, mais lorsqu’un résultat est exécuté et vérifié selon des critères explicites. L’exemple du bug d’authentification illustre cette logique : inspection du projet, modification du code, exécution des tests, détection des échecs et corrections éventuelles.

- **Architecture fonctionnelle très riche et intégrée**  
  Leanna regroupe dans un même environnement le cerveau de l’agent, le runtime, les missions, les agents spécialisés, les outils, la mémoire, les graphes de connaissances, l’observabilité et la sécurité. Cette intégration peut réduire le besoin de combiner plusieurs produits indépendants.

- **Orchestration multi-agents et sélection d’outils**  
  Le runtime peut déterminer quels agents et outils sont pertinents pour une tâche. La documentation mentionne notamment les agents dynamiques, les workflows, le registre d’outils, MCP, GitHub, le navigateur intégré, les notebooks, le RAG, Telegram et l’automatisation.

- **Forte orientation développeur et ingénierie logicielle**  
  Leanna dispose d’un IDE, d’un accès au système de fichiers, d’outils Git/GitHub, d’un terminal, d’un navigateur, d’un graphe de connaissances et de capacités de validation. Le graphe Graphify permet notamment d’interroger les relations entre fichiers, modules et concepts.

- **Mécanismes de sécurité intégrés au cycle d’exécution**  
  Les permissions, le bac à sable, le dry-run, les approbations, la politique d’autonomie, la protection contre l’injection de prompt et le Safety Gate Jev sont intégrés à l’architecture. Les actions à effet de bord doivent être évaluées avant exécution.

- **Observabilité et contrôle opérationnel**  
  Les missions et tâches sont exposées via des statuts tels que `pending`, `running`, `completed`, `dead_letter` et `cancelled`. L’API fournit également des métriques d’autonomie, une timeline WebSocket, des événements et des mécanismes d’audit.

- **Base technique structurée et niveau de validation visible**  
  Le projet est construit avec Electron, React, TypeScript, Node.js et Supabase, et le README indique **855 tests réussis** ainsi qu’une version 1.4.0. L’API documente précisément les routes, les paramètres, les erreurs et les statuts HTTP.

### ⚠️ Faiblesses (Weaknesses)

- **Complexité élevée de l’architecture**  
  Leanna combine de nombreux sous-systèmes : runtime événementiel, missions, agents, outils, mémoire, Supabase, Redis, Graphify, sandbox, intégrations externes et WebSockets. Cette surface fonctionnelle augmente les difficultés de maintenance, de diagnostic et de montée en compétence des utilisateurs.

- **Dépendance à une configuration externe importante**  
  Le fonctionnement s’appuie notamment sur Gemini, OpenRouter, Supabase, Telegram, GitHub, Redis et plusieurs variables d’environnement. La documentation précise que certains services peuvent être indisponibles avant initialisation ou lorsque Supabase n’est pas configuré.

- **Disponibilité partielle liée à l’initialisation asynchrone**  
  L’Executor étant initialisé de manière asynchrone, certaines routes renvoient `503` tant qu’il n’est pas prêt. Le runtime autonome et la persistance durable dépendent également de composants injectés ou configurés séparément.

- **Persistance et reprise après incident non uniformément disponibles**  
  L’état retourné par `/api/v2/metrics/autonomy` est conservé en mémoire. La persistance durable des tâches et la reprise après crash nécessitent `AutonomyPersistence` avec Supabase configuré. Sans cette configuration, la résilience opérationnelle est limitée.

- **Surface de sécurité particulièrement large**  
  Leanna peut agir sur le système de fichiers, le terminal, le navigateur, GitHub, les workflows, les intégrations et des services externes. Même avec des garde-fous, chaque nouvel outil augmente le nombre de scénarios d’abus, d’erreur ou de mauvaise configuration.

- **Exposition directe de secrets opérationnels dans la base de code exportée**  
  La source `codebase` signale la présence de tokens API, clés Supabase, clé maître, token Telegram et code sandbox. Il s’agit d’une faiblesse critique de gestion des secrets, nécessitant une révocation et une rotation immédiates.

- **Risque de fragmentation de l’expérience utilisateur**  
  La multiplicité des modes d’autonomie — `suggest`, `ask`, `auto` —, des approbations, des permissions, des dry-runs et des statuts peut rendre le comportement du système difficile à comprendre pour un utilisateur non expert.

- **Dépendance à la qualité des modèles et des plans générés**  
  Même si le runtime vérifie les résultats, la compréhension de l’objectif, la sélection des outils et la planification restent liées aux capacités des modèles IA et à la qualité du contexte disponible. Une mauvaise interprétation peut entraîner des actions inutiles ou des échecs répétés.

### 🚀 Opportunités (Opportunities)

- **Se positionner sur l’automatisation agentique de tâches complexes**  
  Leanna peut cibler les tâches qui exigent plusieurs étapes, de la vérification et des reprises, notamment la correction de bugs, la maintenance de projets, les workflows techniques et l’automatisation de processus de bureau.

- **Développer une proposition de valeur différenciante autour de la fiabilité**  
  La combinaison exécution-vérification-récupération peut différencier Leanna des assistants qui produisent principalement du texte ou du code sans confirmer le résultat réel.

- **Cibler prioritairement les équipes de développement logiciel**  
  L’IDE, Git/GitHub, le terminal, le navigateur, les tests, Graphify, les workflows et le RAG forment une base cohérente pour les développeurs, les équipes QA, les mainteneurs de dépôts et les équipes DevOps.

- **Créer un écosystème d’outils, de compétences et d’agents spécialisés**  
  Le registre d’outils, les skills, les agents dynamiques, MCP et la marketplace peuvent permettre d’étendre progressivement les capacités du produit sans développer toutes les intégrations en interne.

- **Monétiser la gouvernance et l’observabilité de l’IA autonome**  
  Les permissions, les approbations, les audits, les métriques de coûts, les estimations de risque, les dry-runs et le Safety Gate peuvent répondre aux besoins d’entreprises souhaitant encadrer l’usage d’agents autonomes.

- **Exploiter les graphes de connaissances pour améliorer le contexte agentique**  
  Graphify peut accélérer la compréhension d’une base de code, identifier les nœuds architecturaux importants, analyser les dépendances et repérer les modules affectés par une modification.

- **Proposer plusieurs niveaux d’autonomie selon les profils de risque**  
  Les modes `suggest`, `ask` et `auto` permettent d’adapter Leanna à différents environnements : assistance supervisée, validation humaine obligatoire ou automatisation bornée.

- **Étendre l’usage au-delà du développement logiciel**  
  Les fonctions de navigateur, documents, notebooks, RAG, Telegram, FTP, workflows et automatisation ouvrent des cas d’usage dans la recherche, l’administration, la documentation, le support interne et les opérations.

### 🔴 Menaces (Threats)

- **Risque majeur de compromission lié aux secrets exposés**  
  Les tokens, clés et codes opérationnels présents dans l’export de la base de code peuvent permettre un accès non autorisé à des services, données ou environnements. Cette menace est immédiate tant que les secrets ne sont pas révoqués et remplacés.

- **Attaques par injection de prompt et détournement d’outils**  
  Un agent capable de lire des fichiers, d’utiliser un terminal, de naviguer sur le Web et d’appeler des services externes peut être ciblé par des instructions malveillantes dans des documents, pages Web, dépôts ou messages.

- **Exécution d’actions irréversibles ou à effet de bord**  
  Une mauvaise planification ou une erreur de contexte peut entraîner des modifications de fichiers, des opérations GitHub, l’envoi de messages, des transferts FTP ou des changements dans des systèmes externes. Le Safety Gate et les approbations réduisent ce risque sans l’annuler.

- **Dépendance aux fournisseurs d’IA et aux services cloud**  
  Les changements de prix, de quotas, de disponibilité, de modèles, de politiques ou d’API de Gemini, OpenRouter, Supabase et d’autres intégrations peuvent affecter les coûts et la continuité de service.

- **Concurrence intense sur les agents de code et l’automatisation de bureau**  
  Leanna évolue face aux assistants de programmation, IDE augmentés, plateformes d’automatisation, frameworks multi-agents et solutions de workflow disposant parfois d’une distribution ou d’une base d’utilisateurs plus importante.

- **Exigences croissantes en matière de conformité et de protection des données**  
  La mémoire persistante, les conversations, les dépôts, les documents et les identifiants d’intégration peuvent contenir des données sensibles. Les entreprises peuvent exiger une gouvernance stricte, un hébergement maîtrisé, une traçabilité et une limitation de la conservation.

- **Perte de confiance en cas d’échec autonome**  
  Une action incorrecte, un rapport de succès inexact ou une récupération incontrôlée pourrait dégrader fortement la confiance des utilisateurs, même si la majorité des exécutions sont réussies.

- **Risque de complexité opérationnelle et de coûts imprévisibles**  
  Les boucles de replanification, les retries, les appels multiples à des modèles, les agents spécialisés et les intégrations peuvent augmenter les coûts et les délais. Les mécanismes d’estimation des coûts et de limitation sont donc essentiels.

### 🎯 Recommandations stratégiques

1. **Traiter immédiatement l’incident de gestion des secrets**  
   - Révoquer et remplacer tous les tokens API, clés Supabase, tokens Telegram, clés maîtres et codes sandbox exposés.  
   - Rechercher les secrets dans l’historique Git et les exports.  
   - Utiliser un gestionnaire de secrets et empêcher les secrets en clair dans les dépôts.  
   - Ajouter une analyse automatisée des secrets dans la CI.

2. **Faire de la fiabilité vérifiable le positionnement central**  
   - Mettre en avant la chaîne complète : objectif, plan, action, observation, vérification et récupération.  
   - Publier des métriques telles que taux de réussite vérifiée, taux de récupération, nombre d’actions annulées et taux d’intervention humaine.  
   - Comparer Leanna non seulement sur la qualité des réponses, mais sur le taux de tâches réellement terminées.

3. **Prioriser un segment initial clairement défini**  
   - Commencer par les équipes de développement logiciel et de maintenance de dépôts.  
   - Concentrer l’expérience sur quelques scénarios à forte valeur : correction de bugs, exécution de tests, analyse d’impact, mise à jour documentaire et pull requests.  
   - Éviter de disperser trop tôt le produit sur toutes les intégrations et tous les métiers.

4. **Renforcer le modèle de sécurité “zéro confiance”**  
   - Isoler chaque outil dans un bac à sable avec permissions minimales.  
   - Exiger une approbation humaine pour les actions externes, destructives ou irréversibles.  
   - Séparer les credentials par workspace, utilisateur et intégration.  
   - Journaliser l’intention, l’outil utilisé, les paramètres, le résultat et la décision du Safety Gate.

5. **Améliorer la résilience et la gestion des dépendances**  
   - Garantir une expérience dégradée lorsque Supabase, le fournisseur IA ou un service d’intégration est indisponible.  
   - Formaliser les mécanismes de checkpoint, reprise après crash, idempotence, circuit breaker et dead-letter queue.  
   - Documenter précisément les dépendances obligatoires et optionnelles.

6. **Réduire la complexité perçue côté utilisateur**  
   - Fournir des profils préconfigurés : “assistant supervisé”, “développeur”, “automatisation contrôlée” et “autonomie avancée”.  
   - Expliquer clairement les modes `suggest`, `ask` et `auto`.  
   - Présenter les plans, risques, permissions et effets de bord dans une interface unifiée.

7. **Structurer un écosystème extensible mais contrôlé**  
   - Définir un SDK ou contrat stable pour les skills, agents et outils.  
   - Vérifier et signer les plugins ou compétences ajoutées.  
   - Fournir des limites de permissions et de ressources par extension.  
   - Utiliser la marketplace et MCP comme leviers d’extension, avec validation de sécurité.

8. **Mettre en place une gouvernance des coûts et des modèles**  
   - Exploiter les fonctions d’estimation des coûts, délais et risques avant exécution.  
   - Définir des budgets par mission et des plafonds de retries.  
   - Permettre le routage entre fournisseurs et modèles selon la criticité, le coût et la latence.  
   - Afficher le coût estimé et réel à l’utilisateur.

### 📌 Matrice de priorisation stratégique

| Priorité | Action | Impact attendu | Urgence | Justification |
|---|---|---:|---:|---|
| **P0 — Critique** | Révoquer et remplacer tous les secrets exposés | Très élevé | Immédiate | La base de code contient des tokens et clés opérationnels directement exploitables. |
| **P0 — Critique** | Auditer l’ensemble des permissions, sandbox et intégrations | Très élevé | Immédiate | Leanna peut agir sur fichiers, terminal, navigateur et services externes. |
| **P1 — Élevée** | Cibler les workflows de développement vérifiables | Élevé | Court terme | L’IDE, GitHub, Graphify, tests et terminal forment un cas d’usage cohérent. |
| **P1 — Élevée** | Renforcer checkpoint, reprise et mode dégradé | Élevé | Court terme | Plusieurs fonctions dépendent de l’initialisation et de Supabase ; certaines routes renvoient `503`. |
| **P1 — Élevée** | Mesurer la réussite réelle des missions | Élevé | Court terme | Le positionnement de Leanna repose sur l’exécution et la vérification, pas seulement sur la génération. |
| **P2 — Moyenne** | Simplifier les modes d’autonomie et l’interface | Moyen à élevé | Moyen terme | Les modes, permissions et approbations peuvent créer une forte complexité utilisateur. |
| **P2 — Moyenne** | Industrialiser le SDK d’agents, skills et plugins | Élevé | Moyen terme | Cela peut accélérer l’écosystème, tout en nécessitant un contrôle des extensions. |
| **P3 — Développement** | Étendre les cas d’usage hors développement logiciel | Potentiellement élevé | Long terme | Les fonctions RAG, navigateur, documents, Telegram et workflows permettent une diversification progressive. |

**Synthèse :** Leanna dispose d’un positionnement différenciant grâce à son approche d’exécution agentique vérifiable, à son architecture intégrée et à ses mécanismes de sécurité. Toutefois, la priorité absolue doit être la remédiation des secrets exposés, suivie de la réduction de la complexité opérationnelle et de la consolidation de la fiabilité avant une expansion massive des intégrations et des cas d’usage.