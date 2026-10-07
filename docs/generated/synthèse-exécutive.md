# Synthèse exécutive — Leanna

## 1. 🎯 L’essentiel en 30 secondes

- **Leanna est un environnement d’exécution d’agent IA autonome natif pour le bureau**, conçu pour transformer un objectif en actions exécutables, observables et vérifiables — au-delà de la simple génération de réponses.
- Son architecture repose sur une **boucle fermée** : compréhension, planification, sélection d’outils ou d’agents, exécution, observation, vérification, récupération et replanification.
- La plateforme intègre un **runtime événementiel**, une orchestration multi-agents, des missions, une mémoire persistante, un graphe de connaissances Graphify, des outils d’exécution et des mécanismes d’estimation des coûts, délais et risques.
- La sécurité est structurante : permissions, modes d’autonomie, sandboxing, dry-run, idempotence, limitation de débit, disjonction, contrôles d’injection de prompt et **Safety Gate Jev**.
- **Risque critique immédiat :** la base de code exportée expose directement des secrets opérationnels — tokens API, clés Supabase, clé maître, token Telegram et code sandbox.

### Décision requise

**Révoquer et remplacer immédiatement tous les secrets exposés**, puis suspendre toute utilisation des identifiants concernés jusqu’à confirmation de leur rotation et de la vérification de l’absence de secrets résiduels dans les artefacts accessibles.

---

## 2. 📊 Contexte

### Situation actuelle

Leanna, en version **1.4.0**, est une application de bureau fondée sur Electron, React, TypeScript et Node.js, avec Supabase pour la persistance. Elle vise à fournir un environnement intégré dans lequel un agent IA comprend un objectif, planifie une séquence d’actions, utilise les outils appropriés, vérifie les résultats et récupère les erreurs éventuelles.

La base de code « sandbox », exportée le **05/10/2026 à 10:33:37**, comprend **148 fichiers** pour environ **1 953 Ko de texte**. Le projet affiche **855 tests réussis**, ce qui constitue un indicateur de couverture fonctionnelle, sans toutefois fournir dans les sources de mesure détaillée de la couverture ou de la robustesse en production.

### Enjeux clés

| Enjeu | Constat issu des sources | Priorité |
|---|---|---:|
| **Sécurité opérationnelle** | Plusieurs secrets directement exposés dans le contenu de la base de code | Critique |
| **Fiabilité de l’autonomie** | L’agent doit vérifier les résultats, détecter les échecs et replanifier | Élevée |
| **Contrôle des effets de bord** | Permissions, sandbox, dry-run et Safety Gate Jev intégrés à l’architecture | Élevée |
| **Compréhension du projet** | Graphify fournit des fonctions de requête, chemin, explication et analyse des impacts | Élevée |
| **Interopérabilité** | Intégrations mentionnées avec Gemini, OpenRouter, Supabase, Telegram, GitHub, Redis et Electron | À encadrer |
| **Gouvernance des changements** | Le graphe doit être mis à jour après modification des fichiers de code | Importante |

**Insight principal :** la valeur de Leanna ne réside pas uniquement dans l’utilisation d’un modèle IA, mais dans l’association entre **exécution instrumentée, vérification explicite, récupération bornée et contrôles de sécurité**. Cette proposition de valeur dépend directement de la maîtrise des secrets et de la fiabilité du runtime.

---

## 3. 💡 Conclusions et recommandations

### Recommandation principale

#### 1. Traiter immédiatement l’exposition des secrets

Les secrets mentionnés dans la base de code doivent être considérés comme compromis. Les actions prioritaires sont :

- révoquer les tokens API et clés exposés ;
- remplacer la clé maître ;
- régénérer le token Telegram ;
- remplacer le code sandbox exposé ;
- renouveler les clés Supabase concernées ;
- identifier les intégrations affectées, notamment Gemini, OpenRouter, Supabase, Telegram, GitHub et Redis ;
- vérifier les variables d’environnement et les artefacts associés ;
- confirmer qu’aucun secret équivalent ne demeure dans la base exportée ou dans les fichiers de configuration.

Les sources indiquent que la configuration repose largement sur des variables d’environnement. Cette approche doit être maintenue, mais elle ne suffit pas si les valeurs réelles sont également présentes dans le code, les exports ou les journaux.

#### 2. Préserver le modèle d’exécution vérifiable

Leanna doit continuer à considérer une mission comme terminée uniquement lorsque le résultat attendu a été **exécuté et vérifié selon des critères de succès explicites**. Pour les tâches d’ingénierie, le flux recommandé par les sources comprend notamment :

1. compréhension de l’objectif ;
2. inspection du projet ;
3. identification des fichiers et dépendances ;
4. planification ;
5. sélection de l’agent ;
6. modification ;
7. vérification des fichiers ;
8. exécution des contrôles ;
9. récupération en cas d’échec ;
10. nouvelle vérification ;
11. restitution du résultat réel.

#### 3. Utiliser Graphify comme point d’entrée architectural

Pour toute question de code ou d’architecture :

- exécuter d’abord `graphify query "<question>"` ;
- utiliser `graphify path` pour les relations entre composants ;
- utiliser `graphify explain` pour l’analyse ciblée d’un concept ;
- utiliser `graphify affected` pour identifier les éléments potentiellement impactés ;
- lancer `graphify update .` après toute modification de code.

Cette discipline réduit la dépendance à la lecture brute des fichiers et maintient le graphe de connaissances cohérent avec le code.

### Alternatives considérées

| Alternative | Appréciation |
|---|---|
| **Poursuivre le développement sans rotation des secrets** | À écarter : l’exposition documentée crée un risque opérationnel immédiat. |
| **Limiter la réponse à une analyse documentaire** | Insuffisant : les sources identifient une action de remédiation urgente et concrète. |
| **Désactiver l’autonomie** | Non recommandé comme solution permanente : cela réduirait la proposition de valeur de Leanna sans traiter l’exposition des identifiants. |
| **Maintenir l’autonomie sous contrôles renforcés** | Option recommandée : préserver la boucle d’exécution tout en appliquant permissions, dry-run, sandbox et Safety Gate Jev. |

### Risques de l’inaction

- utilisation non autorisée des comptes ou services associés aux secrets exposés ;
- compromission potentielle des intégrations et de la persistance ;
- exécution d’actions à effet de bord sans maîtrise suffisante ;
- perte de confiance dans l’autonomie et l’observabilité du système ;
- incohérence du graphe de connaissances après des modifications non suivies ;
- difficulté à distinguer un incident lié au code d’un incident lié aux identifiants compromis.

---

## 4. 📈 Impact attendu

### Bénéfices quantifiés disponibles

| Indicateur | Valeur source | Lecture |
|---|---:|---|
| Version | **1.4.0** | État de référence documenté |
| Tests réussis | **855** | Signal de validation automatisée |
| Fichiers exportés | **148** | Périmètre technique documenté |
| Volume de l’export | **1 953 Ko** | Taille du corpus analysé |
| Boucle d’exécution | **8 étapes principales** | Comprendre, planifier, agir, observer, vérifier, récupérer, replanifier, terminer |

Les sources ne fournissent pas de mesure chiffrée du gain de productivité, du taux de réussite des missions, du délai moyen d’exécution, du coût par mission ou de la réduction des incidents.

### Impact attendu

- **Réduction immédiate du risque de compromission**, sous réserve de la révocation effective et de la rotation complète des secrets.
- **Meilleure fiabilité des missions** grâce à la vérification, à la récupération bornée et à la replanification.
- **Meilleure traçabilité** grâce à l’observabilité de l’état d’exécution et au runtime événementiel.
- **Meilleure compréhension des dépendances** grâce à Graphify et à ses fonctions de requête, de chemin et d’analyse d’impact.
- **Contrôle accru des effets de bord** grâce aux permissions, au dry-run, au sandboxing et au Safety Gate Jev.

### Timeline de réalisation

| Horizon | Résultat attendu |
|---|---|
| **Immédiat** | Révocation et remplacement des secrets exposés ; suspension des identifiants concernés. |
| **Après rotation** | Vérification des variables d’environnement, intégrations et artefacts ; confirmation de l’absence de secrets résiduels. |
| **Après modification du code** | Exécution des contrôles pertinents et mise à jour de Graphify avec `graphify update .`. |
| **À définir** | Planning détaillé de déploiement, critères d’acceptation et mesures de performance. |

**Délais précis : [Information non disponible dans les sources].**

### Ressources nécessaires

- responsables techniques des intégrations API, Supabase, Telegram, GitHub et Redis ;
- responsables du runtime, de la sécurité et de l’orchestration multi-agents ;
- accès aux systèmes de gestion des secrets et aux environnements concernés ;
- environnement permettant d’exécuter les tests et les contrôles de validation ;
- outils Graphify pour interroger et mettre à jour le graphe architectural.

**Effectifs, budget et allocation détaillée : [Information non disponible dans les sources].**

---

## 5. ➡️ Prochaines étapes

### Actions immédiates

1. **Révoquer et régénérer tous les secrets exposés.**
2. **Identifier les services et environnements ayant utilisé ces identifiants.**
3. **Contrôler les variables d’environnement et les fichiers de configuration.**
4. **Vérifier les intégrations Gemini, OpenRouter, Supabase, Telegram, GitHub et Redis.**
5. **Exécuter les tests disponibles — 855 tests réussis sont indiqués dans le README.**
6. **Après toute correction, exécuter `graphify update .`.**
7. **Utiliser les contrôles d’autonomie existants : permissions, dry-run, sandbox et Safety Gate Jev.**
8. **Documenter le résultat réel : secrets remplacés, intégrations vérifiées, tests exécutés et anomalies restantes.**

### Responsables

| Action | Responsable |
|---|---|
| Rotation des clés et tokens | Responsable sécurité / administrateurs des services concernés |
| Vérification du code et des configurations | Équipe technique Leanna |
| Validation du runtime et des mécanismes d’autonomie | Responsable runtime / orchestration |
| Mise à jour de Graphify | Équipe de développement |
| Décision de remise en service | Responsable produit ou technique désigné |

**Noms et rôles formellement attribués : [Information non disponible dans les sources].**

### Points de décision

- Confirmer que **tous** les secrets exposés ont été révoqués et remplacés.
- Décider de la remise en service des intégrations après validation.
- Confirmer les critères de succès des missions et des contrôles de sécurité.
- Définir les indicateurs complémentaires : taux de réussite, délai, coût, échecs de vérification et incidents de sécurité.

**Conclusion :** Leanna dispose d’une architecture cohérente pour passer d’une IA orientée réponse à une IA orientée exécution vérifiable. La priorité absolue n’est pas l’ajout de nouvelles capacités, mais la sécurisation immédiate des identifiants exposés et la validation contrôlée du runtime autonome.