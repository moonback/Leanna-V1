# Analyse et amélioration du module `mission`

J'ai lu l'ensemble des 13 fichiers. Voici une synthèse structurée : d'abord les problèmes identifiés (classés par sévérité), puis des patchs concrets pour les corriger, puis des recommandations structurelles.

---

## 1. Synthèse

**Points forts**
- Architecture claire : `Planner → Executor → Reflection` avec boucle de vérification.
- Bon découpage des responsabilités (`MissionStore`, `AutonomyPolicy`, `MissionSimulator`, `MissionTimeTravel`, `SelfEvaluation`).
- Tests présents sur chaque sous-module.
- Persistance défensive, dry-run, garde-fous d'exploration, auto-critique déterministe : très bien.

**Faiblesses majeures**
1. **Reprise après crash cassée** : les actions `in_progress` ne sont jamais rejouées → l'objectif ne peut jamais se terminer.
2. **Vérification structurelle des args absente** : le LLM peut produire un JSON invalide par rapport au schéma, qui sera exécuté tel quel.
3. **`Mission.addSubGoal` : check de profondeur non fonctionnel** (utilise `goalStack.length` au lieu de la profondeur structurelle).
4. **Détection de cycles `dependsOn` absente** : deadlock silencieux → tous les goals `blocked`.
5. **`PlanEstimator.computeConfidence`** utilise un proxy très faible (`a.score > 30`).
6. **`verifyGoalCriteria` heuristique trop permissive** (`anySuccess` sans critères).
7. **`Mission.recordActionResult` n'accumule pas `retriedActions`** dans `metrics` (champ déclaré mais jamais incrémenté → `SelfEvaluation` sous-évalue le retry).
8. **`Executor.detectSkillFailure`** ne gère pas les codes HTTP/`exitCode` explicites.
9. **`AutonomyPolicy.isIgnored`** : les motifs `**/*.log` ne matchent pas correctement un fichier à la racine (glob partiel).
10. **`createSubGoals`** : les dépendances non résolues sont silencieusement supprimées.
11. **Pas de timeout global de mission** : une mission peut tourner indéfiniment si les replans sont nombreux.
12. **`Executor.executeMission`** : la complétion ne considère pas les objectifs `cancelled` comme terminaux.
13. **`Mission.fromJSON`** : aucune sanitization, donc reprend un état incohérent.
14. **`Planner.replan`** : boucle d'apprentissage correcte mais ne remet pas en cause la décomposition racine.

---

## 2. Patchs prioritaires

### Patch 1 — Reprise après crash (critique)

**Fichier** : `Mission.ts`

```ts
static fromJSON(data: MissionState, config?: Partial<MissionConfig>): Mission {
  const mission = Object.create(Mission.prototype) as Mission;
  const sanitized = structuredClone(data);

  // ── Sanitization pour reprise après crash ──────────────────────────────
  // Une action "in_progress" signifie que le process a été interrompu pendant
  // son exécution : on la remet en "pending" pour qu'elle soit rejouée.
  // Sans ça, la boucle de l'Executor la saute (elle ne cherche que "pending")
  // et l'objectif ne peut plus jamais atteindre son état terminal.
  for (const goal of Object.values(sanitized.goals)) {
    for (const action of goal.plannedActions) {
      if (action.status === "in_progress") {
        action.status = "pending";
        action.result = undefined;
        action.reflection = undefined;
      }
    }
    if (goal.status === "in_progress") {
      // On garde "in_progress" pour que l'Executor reprenne ce goal,
      // mais on nettoie les timestamps pour ne pas fausser les métriques.
      goal.completedAt = undefined;
    }
  }
  // Idem pour la mission elle-même.
  if (sanitized.status === "in_progress") {
    sanitized.completedAt = undefined;
  }

  mission.state = sanitized;
  mission.config = { ...DEFAULT_MISSION_CONFIG, ...config };
  return mission;
}
```

### Patch 2 — Profondeur réelle dans `addSubGoal`

**Fichier** : `Mission.ts`

```ts
addSubGoal(params: {...}): string {
  const parent = this.state.goals[params.parentId];
  if (!parent) throw new Error(`Parent goal ${params.parentId} not found`);
  if (parent.children.length >= this.config.maxSubGoals) {
    throw new Error(`Max sub-goals (${this.config.maxSubGoals}) reached for "${parent.title}"`);
  }

  // Profondeur structurelle réelle (≠ longueur de la goalStack qui est
  // un chemin d'exécution et peut être tronquée/remise à zéro).
  const parentDepth = this.computeDepth(params.parentId);
  if (parentDepth + 1 > this.config.maxDepth) {
    throw new Error(`Max goal depth (${this.config.maxDepth}) reached`);
  }
  // ... reste inchangé
}

private computeDepth(goalId: string): number {
  let depth = 0;
  let current: string | null = goalId;
  const seen = new Set<string>();
  while (current) {
    if (seen.has(current)) break; // garde-fou anti-cycle
    seen.add(current);
    depth++;
    current = this.state.goals[current]?.parentId ?? null;
  }
  return depth;
}
```

### Patch 3 — Validation des args LLM contre le schéma

**Fichier** : `Executor.ts`

Ajouter une validation systématique **après** `generateArgs` et **avant** `skillHandler` :

```ts
private validateArgs(skillName: string, args: Record<string, unknown>): { valid: boolean; errors: string[] } {
  const schema = this.toolSchemas.get(skillName);
  const params = schema?.parameters as
    | { type?: string; properties?: Record<string, { type?: string }>; required?: string[] }
    | undefined;
  if (!params?.properties) return { valid: true, errors: [] };

  const errors: string[] = [];
  const required = Array.isArray(params.required) ? params.required : [];
  for (const req of required) {
    if (args[req] === undefined || args[req] === null || args[req] === "") {
      errors.push(`Champ requis manquant: "${req}"`);
    }
  }
  for (const [key, value] of Object.entries(args)) {
    if (!(key in params.properties)) {
      errors.push(`Champ inconnu: "${key}"`);
      continue;
    }
    const expected = params.properties[key].type;
    if (expected && !this.matchesJsonType(value, expected)) {
      errors.push(`Type invalide pour "${key}": attendu ${expected}, reçu ${typeof value}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

private matchesJsonType(value: unknown, expected: string): boolean {
  switch (expected) {
    case "string":  return typeof value === "string";
    case "number":  return typeof value === "number" && Number.isFinite(value);
    case "integer": return Number.isInteger(value);
    case "boolean": return typeof value === "boolean";
    case "array":   return Array.isArray(value);
    case "object":  return typeof value === "object" && value !== null && !Array.isArray(value);
    case "null":    return value === null;
    default:        return true;
  }
}
```

À brancher dans `executeAction`, juste après `generateArgs` :

```ts
if (this.needsArgs(action)) {
  // ... génération existante ...
  if (action.args && Object.keys(action.args).length > 0) {
    const check = this.validateArgs(action.skillName, action.args);
    if (!check.valid) {
      const reason = `Arguments invalides pour ${action.skillName}: ${check.errors.join(" ; ")}`;
      console.log(`[Executor]    ✗ ${reason}`);
      mission.recordActionResult(action.id, { error: reason }, false);
      this.scorer.recordUsage(action.skillName, false, Date.now() - startTime);
      this.emit("action_completed", {
        missionId: mission.id, goalId, actionId: action.id,
        skill: action.skillName, success: false, error: reason,
        durationMs: Date.now() - startTime,
      });
      return this.createDefaultReflection(action.id, false);
    }
  }
}
```

### Patch 4 — Détection de cycles `dependsOn`

**Fichier** : `Executor.ts`, à appeler au début de `executeGoalsScheduled` :

```ts
private detectDependencyCycles(mission: Mission, goalIds: string[]): Set<string> {
  const inCycle = new Set<string>();
  const state = new Map<string, 0 | 1 | 2>(); // 0=non vu, 1=en cours, 2=terminé

  const visit = (id: string, path: string[]): void => {
    const s = state.get(id) ?? 0;
    if (s === 2) return;
    if (s === 1) {
      const idx = path.indexOf(id);
      for (const pid of path.slice(idx)) inCycle.add(pid);
      return;
    }
    state.set(id, 1);
    path.push(id);
    const goal = mission.getGoal(id);
    for (const dep of goal?.dependsOn ?? []) {
      if (goalIds.includes(dep)) visit(dep, path);
    }
    path.pop();
    state.set(id, 2);
  };

  for (const id of goalIds) visit(id, []);
  return inCycle;
}
```

Puis dans `executeGoalsScheduled` :

```ts
const cycles = this.detectDependencyCycles(mission, goalIds);
if (cycles.size > 0) {
  console.warn(`[Executor] ⚠️ Cycle(s) de dépendances détecté(s): ${[...cycles].join(", ")}`);
  for (const id of cycles) {
    mission.blockGoal(id, "Dépendance circulaire détectée.");
  }
  for (const id of cycles) remaining.delete(id);
}
```

### Patch 5 — `computeConfidence` basé sur l'historique réel

**Fichier** : `SkillScorer.ts` (ajouter une méthode) + `PlanEstimator.ts`

```ts
// SkillScorer.ts
/** Vrai si le scorer possède un historique d'usage pour ce skill. */
hasUsageHistory(skillName: string): boolean {
  const stats = this.usageHistory.get(skillName);
  return !!stats && stats.totalCalls > 0;
}
```

```ts
// PlanEstimator.ts
private computeConfidence(actions: PlannedAction[], rawRiskScore: number): number {
  if (actions.length === 0) return 0.4;
  const withHistory = actions.filter((a) => this.scorer.hasUsageHistory(a.skillName)).length;
  const dataCoverage = withHistory / actions.length;
  const riskPenalty = (rawRiskScore / 100) * 0.3;
  return Math.max(0.1, Math.min(1.0, dataCoverage * 0.9 - riskPenalty + 0.1));
}
```

### Patch 6 — `retriedActions` jamais incrémenté

**Fichier** : `Mission.ts`

```ts
recordActionResult(actionId: string, result: unknown, success: boolean): void {
  const action = this.findAction(actionId);
  if (!action) throw new Error(`Action ${actionId} not found`);

  // Détecte une ré-exécution : l'action avait déjà un résultat.
  const wasRetry = action.status === "in_progress" && action.result !== undefined;

  action.status = success ? "completed" : "failed";
  action.result = result;

  if (success) this.state.metrics.successfulActions++;
  else         this.state.metrics.failedActions++;
  if (wasRetry) this.state.metrics.retriedActions++;

  this.state.updatedAt = new Date().toISOString();
}
```

### Patch 7 — Complétion de mission cohérente avec les statuts terminaux

**Fichier** : `Executor.ts`, `executeMission`

```ts
if (!mission.isCompleted()) {
  const allGoals = Object.values(mission.getState().goals);
  const subGoals = allGoals.filter((g) => g.parentId !== null);
  const isTerminal = (s: GoalStatus) => s === "completed" || s === "failed" || s === "cancelled";
  const allTerminal = subGoals.every((g) => isTerminal(g.status));
  const allCompleted = subGoals.length > 0 && subGoals.every((g) => g.status === "completed");
  const anyCriticalFailed = subGoals.some(
    (g) => (g.status === "failed" || g.status === "blocked") && g.priority === "critical"
  );
  const success = allCompleted || (allTerminal && !anyCriticalFailed);

  mission.completeActiveGoal({
    success,
    summary: success
      ? `Mission "${mission.getState().title}" complétée.`
      : `Mission terminée avec des objectifs échoués.`,
    lessonsLearned: this.extractLessons(mission),
  });
}
```

### Patch 8 — Dépendances non résolues : warning explicite

**Fichier** : `Executor.ts`, `createSubGoals`

```ts
plans.forEach((plan, index) => {
  const deps = plan.dependsOn ?? [];
  if (deps.length === 0) return;
  const goal = mission.getGoal(ids[index]);
  if (!goal) return;

  const resolved: string[] = [];
  const unresolved: string[] = [];
  for (const d of deps) {
    const id = titleToId.get(String(d).trim().toLowerCase());
    if (id && id !== ids[index]) resolved.push(id);
    else if (!id) unresolved.push(String(d));
  }
  goal.dependsOn = resolved;
  if (unresolved.length > 0) {
    console.warn(
      `[Executor] ⚠️ Dépendances non résolues pour "${plan.title}": ${unresolved.join(", ")}`
    );
  }
});
```

### Patch 9 — `detectSkillFailure` : codes de sortie

**Fichier** : `Executor.ts`

```ts
// 4. Codes d'échec process (exitCode non nul, status HTTP >= 400).
if (typeof r.exitCode === "number" && r.exitCode !== 0) {
  return `Le skill a terminé avec exitCode=${r.exitCode}.`;
}
if (typeof r.statusCode === "number" && r.statusCode >= 400) {
  return `Le skill a renvoyé un statut HTTP ${r.statusCode}.`;
}
```

### Patch 10 — Timeout global de mission

**Fichier** : `types.ts` + `Executor.ts`

Ajouter dans `MissionConfig` :

```ts
/** Durée maximale d'une mission avant arrêt (ms). 0 = illimité. */
missionTimeoutMs: number;
```

Dans `DEFAULT_MISSION_CONFIG` :
```ts
missionTimeoutMs: 30 * 60_000, // 30 min par défaut
```

Dans `Executor.startMission`, envelopper le run :

```ts
const run = this.executeMission(mission, params.availableSkills)
  .catch((err) => { /* ... */ });

const timeoutMs = missionConfig.missionTimeoutMs;
if (timeoutMs > 0) {
  const watchdog = setTimeout(() => {
    if (!mission.isCompleted()) {
      console.warn(`[Executor] ⏱️ Timeout global de mission atteint (${timeoutMs}ms). Arrêt.`);
      mission.completeActiveGoal({ success: false, summary: "Timeout global de mission." });
      this.finalizeMission(mission);
      this.emit("mission_timeout", { missionId: mission.id });
    }
  }, timeoutMs);
  run.finally(() => clearTimeout(watchdog));
}
```

---

## 3. Recommandations structurelles

### a) `verifyGoalCriteria` : raffiner l'heuristique sans LLM

Actuellement, sans critères explicites → `anySuccess`. Trop laxiste. Suggestion : exiger que **toutes les actions productives** (WRITE_TOOLS) aient réussi, et tolérer les échecs des actions d'exploration :

```ts
if (!goal.successCriteria?.length) {
  const productive = executed.filter((a) => Executor.WRITE_TOOLS.includes(a.skillName));
  const productiveOk = productive.length === 0 || productive.every((a) => a.status === "completed");
  return {
    passed: productiveOk && anySuccess,
    reasoning: productive.length === 0
      ? "Aucun critère explicite ; succès basé sur les actions d'exploration."
      : "Aucun critère explicite ; toutes les écritures ont réussi.",
  };
}
```

### b) Persister la `SelfEvaluation` et le `LearningResult`

`Executor.finalizeMission` les stocke en mémoire (`this.selfEvaluations`, `this.learningResults`), plafonnés implicitement par `MAX_COMPLETED = 50`. Suggestion : les déléguer au `MissionStore` (table dédiée `mission_evaluations`) pour analyse longitudinale.

### c) `AutonomyPolicy.matchPattern` — robustesse du glob

Le hack `regex.source.replace(/\$$/, "(/|$)")` est fragile. Remplacer par une compilation explicite :

```ts
private matchPattern(pattern: string, relPath: string): boolean {
  let p = pattern.trim();
  if (!p || p.startsWith("#")) return false;
  const dirOnly = p.endsWith("/");
  if (dirOnly) p = p.slice(0, -1);
  const anyLevel = !p.includes("/");
  const re = this.globToRegExp(p, anyLevel, dirOnly);
  return re.test(relPath);
}

private globToRegExp(glob: string, anyLevel: boolean, dirOnly: boolean): RegExp {
  let re = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  re = re.replace(/\*\*/g, "\u0000");
  re = re.replace(/\*/g, "[^/]*");
  re = re.replace(/\u0000/g, ".*");
  const prefix = anyLevel ? "(^|.*/)" : "^";
  const suffix = dirOnly ? "(/|$)" : "$";
  return new RegExp(`${prefix}${re}${suffix}`);
}
```

### d) Observabilité

`Executor.emit` ne pousse que vers un `eventEmitter`. Ajouter un système de log structuré (corrélation `missionId` / `goalId` / `actionId`) et l'exposition d'un `getSnapshot(missionId)` retournant l'état complet en lecture (utile pour le debug et l'UI). Un `AsyncLocalStorage` pour propager le contexte serait idéal.

### e) `Planner.replan` : escalade de la décomposition

Si un objectif échoue N fois malgré plusieurs replans d'actions, la **décomposition elle-même** est probablement fausse. Suggestion : après 2 replans sur le même goal, ajouter automatiquement un sous-objectif d'investigation (`knowledge_build_context`) et forcer un `blockGoal` sur le goal courant pour que la vague suivante reprenne sur des bases saines.

### f) Concurrence et états partagés

`executeGoalsScheduled` exécute des goals en parallèle via `Promise.all`. Deux goals partagent :
- `this.loopGuards` (Map) → OK car clé = goalId.
- `this.scorer` et `strategyMemory` → mutations concurrentes non atomiques. `SkillScorer.recordUsage` fait `get`/`set` non atomiques. Risque de perte d'écritures. Suggestion : soit un mutex léger par skill, soit une file d'enregistrement consommée séquentiellement.

### g) Sérialisation des `Set` et `Map`

`MissionState` ne contient pas de `Map`/`Set`, donc `structuredClone` fonctionne. Mais si on ajoute des `Map` à l'avenir, la persistance Supabase (JSON) les perdra silencieusement. Ajouter un test de round-trip `toJSON → fromJSON → toJSON` qui vérifie l'égalité profonde.

---

## 4. Ordre de mise en œuvre suggéré

| Priorité | Correctif | Impact |
|---|---|---|
| P0 | Patch 1 (reprise crash) | Débloque la reprise de missions interrompues |
| P0 | Patch 3 (validation args) | Évite les échecs silencieux + gaspillage LLM |
| P0 | Patch 4 (cycles) | Évite les deadlocks d'objectifs |
| P1 | Patch 2 (profondeur) | Respecte `maxDepth` |
| P1 | Patch 5 (confidence) | Améliore la fiabilité des estimations |
| P1 | Patch 7 (complétion) | Cohérence sémantique |
| P2 | Patch 6, 8, 9 | Qualité métriques / observabilité |
| P2 | Patch 10 (timeout) | Robustesse opérationnelle |

---

## 5. Tests à ajouter

1. **Reprise après crash** : créer une mission, la faire persister avec une action `in_progress`, `fromJSON`, vérifier que l'action est `pending`.
2. **Args invalides** : mocker un `llmArgGen` retournant un type incorrect, vérifier que l'action échoue explicitement sans appel au skill.
3. **Cycle `dependsOn`** : construire A → B → A, vérifier qu'aucun goal n'est exécuté et que tous sont `blocked` avec raison "circulaire".
4. **Timeout** : mission configurée avec `missionTimeoutMs: 100`, vérifier `mission_timeout` émis.
5. **Profondeur** : créer 6 niveaux avec `maxDepth: 5`, vérifier le throw au 6ᵉ.
6. **`retriedActions`** : enregistrer deux fois le même `actionId`, vérifier `metrics.retriedActions === 1`.

Si tu veux, je peux appliquer directement ces patchs sur un ou plusieurs fichiers en te fournissant le fichier complet réécrit. Dis-moi par lequel commencer.