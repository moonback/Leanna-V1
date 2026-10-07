# TOOL OWNERSHIP MATRIX — Leanna v1.4.0

Attribution, niveau de risque et permissions de chaque outil enregistré dans le ToolRegistry.

## Légende

| Colonne | Signification |
|---------|--------------|
| **Outil** | Nom exact dans le ToolRegistry |
| **Priorité** | 1=explicite (SENSITIVE_TOOL_ATTRIBUTION), 2=capability (roles.ts), 3=sémantique (heuristique) |
| **Risque** | low / medium / high / critical |
| **Permissions** | read / write / network / exec / dangerous |
| **Effets de bord** | Modifie l''état du système hors mémoire process |

---

## 1. Outils Explicites (Priorité 1 — SENSITIVE_TOOL_ATTRIBUTION)

| Outil | Agent préféré | Agents autorisés | Risque | Permissions | Effets de bord |
|-------|--------------|-----------------|--------|-------------|----------------|
| `security_audit` | security | security, reviewer | high | exec | non |
| `run_tests` | tester | tester, debugger, coder | high | exec | non |
| `verify_full` | tester | tester, reviewer, debugger | medium | exec | non |
| `verify_typecheck` | tester | tester, coder, debugger | medium | exec | non |
| `verify_lint` | tester | tester, reviewer, coder | low | exec | non |
| `verify_file` | tester | tester, coder, debugger | low | read | non |
| `run_project_command` | coder | coder, tester, debugger | high | exec | **oui** |
| `system_execute_command` | coder | coder, tester | critical | exec | **oui** |
| `delete_project_file` | coder | coder, refactor | high | dangerous | **oui** |
| `delete_project_folder` | coder | coder, refactor | high | dangerous | **oui** |
| `git_push` | coder | coder | critical | dangerous | **oui** |

---

## 2. Lecture / Exploration (Priorité 2)

| Outil | Agent(s) | Risque | Permissions | Sandbox |
|-------|---------|--------|-------------|---------|
| `read_project_file` | coder, refactor, debugger, reviewer, tester, architect, writer, researcher | low | read | oui |
| `list_project_files` | coder, refactor, debugger, reviewer, tester, architect, researcher | low | read | oui |
| `read_file_outline` | coder, refactor, debugger, reviewer, researcher | low | read | oui |
| `analyze_project_file` | coder, refactor, debugger, reviewer, researcher | low | read | oui |
| `search_in_files` | coder, refactor, debugger, reviewer, tester, security, architect, researcher | low | read | oui |
| `open_project_file` | coder, writer | low | read | oui |

---

## 3. Écriture / Modification (Priorité 2 — sandbox obligatoire)

| Outil | Agent(s) | Risque | Permissions | Effets de bord |
|-------|---------|--------|-------------|----------------|
| `write_project_file` | coder, refactor, tester, writer | high | write | **oui** |
| `modify_project_file` | coder, refactor, debugger, tester | high | write | **oui** |
| `patch_project_file` | coder, refactor, debugger, tester | high | write | **oui** |
| `apply_patch` | coder, refactor, debugger | high | write | **oui** |
| `rename_project_file` | coder, refactor | medium | write | **oui** |
| `create_project_directory` | coder, refactor | low | write | **oui** |

---

## 4. Vérification / Qualité

| Outil | Agent(s) | Risque | Permissions | Effets de bord |
|-------|---------|--------|-------------|----------------|
| `verify_typecheck` | tester, coder, debugger | medium | exec | non |
| `verify_lint` | tester, reviewer, coder | low | exec | non |
| `verify_full` | tester, reviewer, debugger | high | exec | non |
| `verify_file` | tester, coder, debugger | low | read | non |
| `verify_format` | formatter, tester | low | exec | non |
| `verify_syntax` | coder, tester | low | exec | non |
| `verify_security` | security, reviewer | high | exec | non |
| `verify_run_script` | tester | high | exec | **oui** |
| `quality_loop` | tester, coder | high | exec | **oui** |

---

## 5. Contrôle de Version — Git

| Outil | Priorité | Agent(s) | Risque | Permissions | Effets de bord |
|-------|---------|---------|--------|-------------|----------------|
| `git_status` | 3 | coder | low | read | non |
| `git_diff` | 3 | coder, reviewer, debugger | low | read | non |
| `git_log` | 3 | coder, researcher | low | read | non |
| `git_branches` | 3 | coder | low | read | non |
| `git_stage` | 3 | coder | medium | write | **oui** |
| `git_unstage` | 3 | coder | medium | write | **oui** |
| `git_commit` | 3 | coder | high | write | **oui** |
| `git_pull` | 3 | coder | high | write | **oui** |
| `git_switch_branch` | 3 | coder | high | write | **oui** |
| `git_push` | **1** | coder | critical | dangerous | **oui** |

---

## 6. Connaissance & Mémoire

| Outil | P | Agent(s) | Risque | Permissions | Effets de bord |
|-------|---|---------|--------|-------------|----------------|
| `knowledge_build_context` | 2 | coder, refactor, debugger, reviewer, tester, architect, researcher | low | read | non |
| `knowledge_semantic_search` | 2 | coder, researcher, architect | low | read | non |
| `knowledge_search_entities` | 2 | researcher, architect | low | read | non |
| `knowledge_impact_analyze` | 2 | reviewer, architect, refactor | low | read | non |
| `knowledge_memory_add` | 2 | coder (1x/tâche) | medium | write | **oui** |
| `knowledge_memory_search` | 2 | coder, refactor, debugger, researcher | low | read | non |
| `knowledge_memory_list` | 2 | researcher | low | read | non |
| `knowledge_reindex` | 3 | architect | medium | exec | **oui** |
| `knowledge_status` | 3 | researcher, architect | low | read | non |
| `knowledge_ast_callers` | 2 | debugger, architect, researcher | low | read | non |
| `knowledge_ast_callees` | 2 | debugger, architect, researcher | low | read | non |
| `knowledge_ast_call_chain` | 2 | debugger, architect | low | read | non |
| `knowledge_ast_file_inspect` | 2 | debugger, reviewer, architect | low | read | non |
| `save_memory` | 2 | planner, researcher | medium | write | **oui** |
| `search_memory` | 2 | planner, researcher, coder | low | read | non |
| `delete_memory` | 3 | planner | medium | dangerous | **oui** |
| `list_memories` | 3 | researcher | low | read | non |
| `search_history` | 3 | researcher, planner | low | read | non |

---

## 7. Mission & Planification

| Outil | P | Agent(s) | Risque | Permissions | Effets de bord |
|-------|---|---------|--------|-------------|----------------|
| `mission_create` | 2 | planner | medium | write | **oui** |
| `mission_status` | 2 | planner, researcher | low | read | non |
| `mission_list` | 2 | planner, researcher | low | read | non |
| `mission_cancel` | 2 | planner | high | write | **oui** |
| `mission_reflect` | 2 | planner | low | read | non |
| `mission_dryrun_report` | 2 | planner | low | read | non |
| `agent_delegate` | 3 | planner | medium | write | **oui** |
| `agent_orchestrate` | 3 | planner | medium | write | **oui** |
| `agent_create` | 3 | planner | medium | write | **oui** |
| `agent_cancel` | 3 | planner | medium | write | **oui** |
| `agent_status` | 3 | planner, researcher | low | read | non |
| `agent_list_tasks` | 3 | planner, researcher | low | read | non |
| `agent_fleet_status` | 3 | planner | low | read | non |
| `agent_brain` | 3 | planner | high | exec | **oui** |
| `reasoning_think` | 2 | planner, coder, architect | low | read | non |
| `reasoning_delegate_task` | 2 | planner | medium | exec | **oui** |
| `reasoning_list_strategies` | 2 | planner | low | read | non |

---

## 8. Workflows

| Outil | P | Agent(s) | Risque | Permissions | Effets de bord |
|-------|---|---------|--------|-------------|----------------|
| `workflow_create` | 3 | planner | medium | write | **oui** |
| `workflow_run` | 3 | planner | high | exec | **oui** |
| `workflow_list` | 3 | planner | low | read | non |
| `workflow_delete` | 3 | planner | medium | dangerous | **oui** |
| `workflow_toggle` | 3 | planner | medium | write | **oui** |

---

## 9. Système

| Outil | P | Agent(s) | Risque | Permissions | Effets de bord |
|-------|---|---------|--------|-------------|----------------|
| `system_execute_command` | **1** | coder, tester | critical | exec | **oui** |
| `system_info` | 3 | researcher, coder | low | read | non |
| `system_notify` | 3 | coder, writer | low | network | non |
| `system_open` | 3 | coder, writer | medium | exec | **oui** |

---

## 10. Browser & Automation

| Outil | P | Agent(s) | Risque | Permissions | Effets de bord |
|-------|---|---------|--------|-------------|----------------|
| `browser_navigate` | 3 | researcher, vision | high | network | **oui** |
| `browser_click` | 3 | researcher, vision | medium | network | **oui** |
| `browser_read_content` | 3 | researcher | low | network | non |
| `browser_snapshot` | 3 | vision | low | network | non |
| `browser_search` | 3 | researcher | medium | network | **oui** |
| `browser_fill_form` | 3 | researcher | high | network | **oui** |
| `browser_research` | 3 | researcher | medium | network | **oui** |
| `automation_navigate` | 3 | researcher, vision | high | network | **oui** |
| `automation_click` | 3 | researcher, vision | medium | network | **oui** |
| `automation_screenshot` | 3 | vision | low | exec | non |
| `automation_extract` | 3 | researcher | low | network | non |
| `automation_search` | 3 | researcher | medium | network | **oui** |
| `automation_schedule_task` | 3 | planner | high | exec | **oui** |

---

## 11. GitHub, Telegram, Graphify, Mémoire Hiérarchique, Custom Skills

### GitHub
| Outil | P | Agent(s) | Risque | Permissions | Effets de bord |
|-------|---|---------|--------|-------------|----------------|
| `list_github_repos` | 3 | researcher, coder | low | network | non |
| `list_github_issues` | 3 | researcher, planner | low | network | non |
| `list_github_pull_requests` | 3 | reviewer, researcher | low | network | non |
| `create_github_issue` | 3 | planner, writer | medium | network | **oui** |

### Telegram (tous priorité 3 — devraient être P0)
| Outil | Agent(s) | Risque | Permissions | Effets de bord |
|-------|---------|--------|-------------|----------------|
| `telegram_notify` | system | medium | network | **oui** |
| `telegram_send_message` | system | medium | network | **oui** |
| `telegram_broadcast` | system | high | network | **oui** |
| `telegram_send_document` | system | medium | network | **oui** |
| `telegram_send_photo` | system | medium | network | **oui** |
| `telegram_send_from_workspace` | system | high | network, read | **oui** |
| `telegram_get_status` | system | low | network | non |
| `telegram_get_chat_info` | system | low | network | non |

### Graphify
| Outil | P | Agent(s) | Risque | Permissions |
|-------|---|---------|--------|-------------|
| `graphify_query` | 3 | architect, researcher | low | read |
| `graphify_path` | 3 | architect, researcher | low | read |
| `graphify_explain` | 3 | architect, researcher | low | read |
| `graphify_god_nodes` | 3 | architect | low | read |
| `graphify_affected` | 3 | architect, reviewer | low | read |
| `graphify_update` | 3 | architect | medium | exec |

### Custom Skills (risque élevé)
| Outil | P | Agent(s) | Risque | Permissions | Effets de bord |
|-------|---|---------|--------|-------------|----------------|
| `create_custom_skill` | 3 | coder, architect | high | write | **oui** |
| `update_custom_skill` | 3 | coder | high | write | **oui** |
| `delete_custom_skill` | 3 | coder | high | dangerous | **oui** |
| `list_custom_skills` | 3 | researcher | low | read | non |

### Projet & Scaffold
| Outil | P | Agent(s) | Risque | Permissions | Effets de bord |
|-------|---|---------|--------|-------------|----------------|
| `project_scaffold` | 3 | architect, coder | high | write | **oui** |
| `project_list_frameworks` | 3 | architect | low | read | non |
| `assistant_logs` | 3 | system | low | read | non |

---

## 12. Résumé par niveau de risque

```text
CRITICAL  (3)  : system_execute_command, git_push, delete_project_folder
HIGH     (18)  : write/modify/patch_project_file, apply_patch, delete_project_file,
                 run_project_command, run_tests, verify_full, security_audit,
                 git_commit/pull/switch_branch, project_scaffold,
                 create_custom_skill, update_custom_skill, agent_brain,
                 workflow_run, browser_navigate/fill_form, mission_cancel
MEDIUM   (35+) : git_stage/unstage, mission_create, telegram_send_*,
                 knowledge_memory_add, automation_navigate, workflow_create, …
LOW     (155+) : lecture, exploration, recherche, mémoire en lecture
```

---

## 13. Analyse des 5 outils spécifiés (task.md Phase 3)

### assistant_logs
- **Attribution** : 3-sémantique → system
- **Verdict** : OK. Lecture de logs serveur uniquement, aucun effet de bord. Risque : low.

### generate_codebase_markdown
- **Attribution** : ABSENT du registry actuel
- **Verdict** : Absent. Peut être un outil custom ou renommé.

### project_scaffold
- **Attribution actuelle** : 3-sémantique → architect, coder
- **Verdict** : DOIT ETRE EXPLICITE (P0). Crée une arborescence complète, risque write.
- **Action** : Ajouter à SENSITIVE_TOOL_ATTRIBUTION avec preferred: architect, risk: write.

### quality_loop
- **Attribution actuelle** : 3-sémantique → tester, coder
- **Verdict** : DOIT ETRE EXPLICITE (P0). Exécute patch+typecheck+tests en chaîne, risque exec.
- **Action** : Ajouter à SENSITIVE_TOOL_ATTRIBUTION avec preferred: tester, risk: exec.

### update_custom_skill
- **Attribution actuelle** : 3-sémantique → coder
- **Verdict** : CRITIQUE. Modifie du code exécutable dynamiquement. Risque dangerous.
- **Action** : Ajouter à SENSITIVE_TOOL_ATTRIBUTION avec preferred: coder, risk: dangerous.

---

## 14. Actions requises (P0 → P3)

| P | Action | Outils |
|---|--------|--------|
| P0 | Ajouter à SENSITIVE_TOOL_ATTRIBUTION | project_scaffold, quality_loop, update_custom_skill, create_custom_skill, delete_custom_skill, workflow_run |
| P1 | Attribution explicite ToolRegistry | Tous les outils telegram_* (réseau + effets de bord) |
| P2 | Documenter les outils système non rattachés | assistant_logs, system_info, open_ide |
| P3 | Supprimer ou documenter les outils de test résiduel | test, Test Task, test_action, Submit, Complex Args Task |
