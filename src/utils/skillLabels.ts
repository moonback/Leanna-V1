/**
 * skillLabels — Convertit les noms techniques d'outils/skills (ex.
 * `read_project_file`) en libellés lisibles décrivant ce que fait l'action
 * (ex. « Lire un fichier »), pour l'affichage dans le panneau des missions.
 *
 * Les outils connus ont un libellé français dédié. Les outils inconnus tombent
 * sur un repli générique : `snake_case` → « Snake case ».
 */

const SKILL_LABELS: Record<string, string> = {
  // ── Codebase / fichiers ───────────────────────────────────────────────────
  list_project_files: 'Lister les fichiers',
  read_project_file: 'Lire un fichier',
  read_file_outline: 'Analyser la structure du fichier',
  analyze_project_file: 'Analyser un fichier',
  write_project_file: 'Écrire un fichier',
  modify_project_file: 'Modifier un fichier',
  patch_project_file: 'Modifier un fichier (par lignes)',
  apply_patch: 'Appliquer une modification',
  search_in_files: 'Rechercher dans les fichiers',
  rename_project_file: 'Renommer / déplacer un fichier',
  delete_project_file: 'Supprimer un fichier',
  delete_project_folder: 'Supprimer un dossier',
  create_project_directory: 'Créer un dossier',
  open_project_file: 'Ouvrir un fichier',
  open_ide: 'Ouvrir l\u2019IDE',
  get_workspace_info: 'Consulter les infos du workspace',
  generate_codebase_markdown: 'Générer la documentation du code',

  // ── Mémoire ───────────────────────────────────────────────────────────────
  search_memory: 'Rechercher dans la mémoire',
  save_memory: 'Enregistrer en mémoire',
  delete_memory: 'Supprimer un souvenir',
  list_memories: 'Lister les souvenirs',
  hierarchical_memory_store: 'Mémoriser (mémoire hiérarchique)',
  hierarchical_memory_search: 'Rechercher (mémoire hiérarchique)',
  hierarchical_memory_promote: 'Promouvoir un souvenir',
  hierarchical_memory_stats: 'Statistiques de la mémoire',
  knowledge_memory_add: 'Ajouter à la mémoire',
  knowledge_memory_search: 'Rechercher en mémoire',
  knowledge_memory_list: 'Lister les entrées de mémoire',

  // ── Terminal / système ────────────────────────────────────────────────────
  run_project_command: 'Exécuter une commande',
  system_execute_command: 'Exécuter une commande système',
  system_info: 'Consulter les infos système',
  system_notify: 'Envoyer une notification',
  system_open: 'Ouvrir avec l\u2019application par défaut',
  get_current_time: 'Obtenir l\u2019heure actuelle',
  get_weather: 'Consulter la météo',

  // ── Web / navigateur ──────────────────────────────────────────────────────
  browser_open: 'Ouvrir le navigateur',
  browser_navigate: 'Naviguer vers une page',
  browser_open_link: 'Ouvrir un lien',
  browser_back: 'Revenir en arrière',
  browser_forward: 'Aller en avant',
  browser_reload: 'Recharger la page',
  browser_close: 'Fermer le navigateur',
  browser_click: 'Cliquer sur un élément',
  browser_click_by_role: 'Cliquer sur un élément',
  browser_type: 'Saisir du texte',
  browser_type_by_label: 'Saisir du texte',
  browser_fill_form: 'Remplir un formulaire',
  browser_select_option: 'Sélectionner une option',
  browser_scroll: 'Faire défiler la page',
  browser_read_content: 'Lire le contenu de la page',
  browser_get_links: 'Récupérer les liens',
  browser_get_element_text: 'Lire le texte d\u2019un élément',
  browser_get_element_attribute: 'Lire un attribut d\u2019élément',
  browser_get_accessibility_snapshot: 'Analyser l\u2019accessibilité',
  browser_snapshot: 'Capturer la page',
  browser_inspect: 'Inspecter la page',
  browser_search: 'Rechercher sur le web',
  browser_research: 'Effectuer une recherche approfondie',
  browser_summarize_page: 'Résumer la page',
  browser_wait_for: 'Attendre un élément',

  // ── Automation (bureau / écran) ─────────────────────────────────────────────
  automation_navigate: 'Naviguer (automation)',
  automation_click: 'Cliquer (automation)',
  automation_double_click: 'Double-cliquer (automation)',
  automation_right_click: 'Clic droit (automation)',
  automation_hover: 'Survoler un élément',
  automation_type: 'Saisir du texte (automation)',
  automation_press_keys: 'Appuyer sur des touches',
  automation_scroll: 'Faire défiler (automation)',
  automation_screenshot: 'Prendre une capture d\u2019écran',
  automation_analyze_screenshot: 'Analyser une capture d\u2019écran',
  automation_extract: 'Extraire des données',
  automation_snapshot: 'Capturer l\u2019état de la page',
  automation_inspect: 'Inspecter (automation)',
  automation_search: 'Rechercher (automation)',
  automation_music_search: 'Rechercher de la musique',
  automation_download_file: 'Télécharger un fichier',
  automation_wait_for: 'Attendre (automation)',
  automation_schedule_task: 'Planifier une tâche',
  automation_cancel_scheduled_task: 'Annuler une tâche planifiée',
  automation_list_scheduled_tasks: 'Lister les tâches planifiées',
  automation_save_session: 'Enregistrer la session',
  automation_restore_session: 'Restaurer une session',
  automation_list_sessions: 'Lister les sessions',
  automation_delete_session: 'Supprimer une session',
  automation_close: 'Fermer l\u2019automation',

  // ── Git ─────────────────────────────────────────────────────────────────────
  git_status: 'Consulter l\u2019état Git',
  git_diff: 'Comparer les modifications Git',
  git_stage: 'Indexer des fichiers (git add)',
  git_unstage: 'Désindexer des fichiers',
  git_commit: 'Créer un commit',
  git_push: 'Pousser les commits',
  git_pull: 'Récupérer les modifications',
  git_log: 'Consulter l\u2019historique Git',
  git_branches: 'Lister les branches',
  git_switch_branch: 'Changer de branche',

  // ── GitHub ──────────────────────────────────────────────────────────────────
  get_github_user: 'Consulter un utilisateur GitHub',
  get_github_repo: 'Consulter un dépôt GitHub',
  list_github_repos: 'Lister les dépôts GitHub',
  list_github_repo_files: 'Lister les fichiers d\u2019un dépôt',
  get_github_file_content: 'Lire un fichier GitHub',
  list_github_issues: 'Lister les issues GitHub',
  create_github_issue: 'Créer une issue GitHub',
  list_github_pull_requests: 'Lister les pull requests',
  search_github_repos: 'Rechercher des dépôts GitHub',
  get_github_notifications: 'Consulter les notifications GitHub',

  // ── Graphe de code (Graphify) ─────────────────────────────────────────────
  graphify_query: 'Explorer l\u2019architecture du code',
  graphify_path: 'Tracer les dépendances',
  graphify_explain: 'Expliquer un symbole',
  graphify_affected: 'Analyser l\u2019impact d\u2019une modification',
  graphify_god_nodes: 'Identifier les points centraux du code',
  graphify_read_report: 'Lire le rapport d\u2019architecture',
  graphify_update: 'Mettre à jour le graphe du code',

  // ── Base de connaissances / AST ─────────────────────────────────────────────
  knowledge_search_entities: 'Rechercher des entités',
  knowledge_semantic_search: 'Recherche sémantique',
  knowledge_build_context: 'Construire le contexte',
  knowledge_impact_analyze: 'Analyser l\u2019impact',
  knowledge_reindex: 'Réindexer les connaissances',
  knowledge_status: 'État de la base de connaissances',
  knowledge_ast_callers: 'Trouver les appelants',
  knowledge_ast_callees: 'Trouver les fonctions appelées',
  knowledge_ast_call_chain: 'Tracer la chaîne d\u2019appels',
  knowledge_ast_file_inspect: 'Inspecter un fichier (AST)',

  // ── Documents ─────────────────────────────────────────────────────────────
  doc_search: 'Rechercher dans les documents',
  doc_get: 'Consulter un document',
  doc_list: 'Lister les documents',
  doc_stats: 'Statistiques des documents',
  doc_relations: 'Explorer les relations d\u2019un document',
  doc_synthesis: 'Synthétiser des documents',
  doc_get_context: 'Récupérer le contexte d\u2019un document',
  doc_memory_add: 'Ajouter un document en mémoire',
  doc_memory_search: 'Rechercher dans les documents',
  document_search: 'Rechercher dans les documents',
  document_list: 'Lister les documents',
  document_find_similar: 'Trouver des documents similaires',
  document_synthesize: 'Synthétiser des documents',
  document_analyze_links: 'Analyser les liens du document',
  document_add_tag: 'Ajouter un tag au document',
  document_remove: 'Supprimer un document',
  create_rich_document: 'Créer un document',

  // ── Raisonnement / réflexion ────────────────────────────────────────────────
  reasoning_think: 'Réfléchir',
  reasoning_delegate_task: 'Déléguer une tâche',
  reasoning_list_strategies: 'Lister les stratégies de raisonnement',
  agent_brain: 'Réfléchir en profondeur',

  // ── Agents (orchestration multi-agents) ──────────────────────────────────────
  agent_execute: 'Exécuter un agent',
  agent_delegate: 'Déléguer à un agent',
  agent_collaborate: 'Collaborer avec des agents',
  agent_orchestrate: 'Orchestrer des agents',
  agent_status: 'État d\u2019un agent',
  agent_stats: 'Statistiques des agents',
  agent_list_tasks: 'Lister les tâches des agents',
  agent_list_roles: 'Lister les rôles d\u2019agents',
  agent_cancel: 'Annuler un agent',
  agent_fleet_status: 'État de la flotte d\u2019agents',

  // ── Missions ──────────────────────────────────────────────────────────────
  mission_create: 'Créer une mission',
  mission_status: 'État de la mission',
  mission_list: 'Lister les missions',
  mission_cancel: 'Annuler la mission',
  mission_reflect: 'Réfléchir sur la mission',
  mission_dryrun_report: 'Rapport de simulation',

  // ── Vérification ────────────────────────────────────────────────────────────
  verify_file: 'Vérifier un fichier',
  verify_syntax: 'Vérifier la syntaxe',
  verify_lint: 'Analyser le code (lint)',
  verify_typecheck: 'Vérifier les types',
  verify_format: 'Vérifier le formatage',
  verify_security: 'Audit de sécurité',
  verify_run_script: 'Exécuter un script de vérification',
  verify_full: 'Vérification complète',
  security_audit: 'Audit de sécurité',

  // ── Listes / tâches ─────────────────────────────────────────────────────────
  list_create: 'Créer une liste',
  list_add_item: 'Ajouter un élément',
  list_remove_item: 'Retirer un élément',
  list_get: 'Consulter une liste',
  list_list_all: 'Lister toutes les listes',
  list_delete: 'Supprimer une liste',

  // ── Telegram ────────────────────────────────────────────────────────────────
  telegram_send_message: 'Envoyer un message Telegram',
  telegram_send_photo: 'Envoyer une photo Telegram',
  telegram_send_document: 'Envoyer un document Telegram',
  telegram_send_from_workspace: 'Envoyer un fichier du workspace',
  telegram_broadcast: 'Diffuser un message Telegram',
  telegram_notify: 'Notifier via Telegram',
  telegram_get_status: 'État du bot Telegram',
  telegram_list_users: 'Lister les utilisateurs Telegram',
  telegram_get_chat_info: 'Infos d\u2019un chat Telegram',

  // ── Projets / workflows / skills ──────────────────────────────────────────
  project_scaffold: 'Générer un projet',
  project_list_frameworks: 'Lister les frameworks',
  workflow_create: 'Créer un workflow',
  workflow_run: 'Exécuter un workflow',
  workflow_list: 'Lister les workflows',
  workflow_toggle: 'Activer / désactiver un workflow',
  workflow_delete: 'Supprimer un workflow',
  create_custom_skill: 'Créer un skill personnalisé',
  update_custom_skill: 'Mettre à jour un skill',
  delete_custom_skill: 'Supprimer un skill',
  list_custom_skills: 'Lister les skills personnalisés',
  search_history: 'Rechercher dans l\u2019historique',
};

/**
 * Retourne un libellé lisible pour un nom d'outil/skill.
 * @param skill Nom technique de l'outil (ex. `read_project_file`).
 */
export function skillLabel(skill: string | undefined | null): string {
  if (!skill) return 'Action';

  const known = SKILL_LABELS[skill];
  if (known) return known;

  // Skills personnalisés : `custom_<nom>` → « Nom »
  const custom = skill.startsWith('custom_') ? skill.slice('custom_'.length) : skill;

  // Repli générique : snake_case / kebab-case → « Phrase capitalisée ».
  const words = custom.replace(/[_-]+/g, ' ').trim();
  if (!words) return 'Action';
  return words.charAt(0).toUpperCase() + words.slice(1);
}
