/**
 * WorkflowCompiler — "Natural Language → Automation" (task.md §15).
 *
 * Tu dis : « Tous les lundis matin, vérifie mes repositories, détecte les issues
 * critiques et prépare-moi un rapport. »
 *
 *   TRIGGER (Monday 08:00) → GitHub scan → Issue analysis → Priority classif.
 *   → Security check → Report generation → Notification
 *
 * …et Leanna construit le workflow correspondant.
 *
 * Design : l'app possède déjà WorkflowEngine + le skill workflow (création,
 * exécution, planification). Le manque identifié est le *compilateur langage
 * naturel → workflow agentique robuste*. Ce module est ce compilateur,
 * DÉTERMINISTE : il parse le déclencheur (planifié / événement / manuel),
 * découpe la demande en clauses, mappe chaque clause vers une ACTION réelle
 * (validée contre un catalogue d'actions disponibles), chaîne les étapes, et
 * retourne une WorkflowDefinition prête à être créée via `workflow_create`.
 * Les clauses non reconnues deviennent un avertissement + une étape générique
 * éditable — jamais une action inventée exécutée en silence. Aucun appel modèle.
 */

/** Compiled step (matches the workflow skill's WorkflowStep shape). */
export interface CompiledStep {
  id: string;
  action: string;
  args: Record<string, unknown>;
  label: string;
  onError: "stop" | "skip" | "retry";
  /** Logical predecessor (steps run sequentially unless the engine parallelizes). */
  dependsOn?: string[];
}

/** Compiled workflow (matches createWorkflowSchema). */
export interface CompiledWorkflow {
  name: string;
  description: string;
  steps: CompiledStep[];
  /** Interval/cron-ish schedule hint, e.g. "weekly:mon@08:00", "24h". */
  schedule?: string;
  /** Trigger classification for display. */
  trigger: { type: "schedule" | "event" | "manual"; detail: string };
}

export interface CompileResult {
  workflow: CompiledWorkflow;
  /** Clauses that mapped to a placeholder (need the user to pick a real action). */
  warnings: string[];
  summary: string;
}

export interface WorkflowCompilerOptions {
  /**
   * Catalog of available action/tool names to validate steps against. When
   * provided, a mapped action absent from the catalog is downgraded to a
   * warning + placeholder. Defaults to the built-in known actions only.
   */
  availableActions?: string[];
}

/** Phrase → action rules. First match wins per clause. */
interface StepRule {
  re: RegExp;
  action: string;
  label: string;
  args?: Record<string, unknown>;
}

const STEP_RULES: StepRule[] = [
  { re: /(scan|vérifi|verifi|check).*(repo|repositor|github|dépôt|depot|pr\b|pull request)/i, action: "github_list_prs", label: "Scanner les repositories GitHub" },
  { re: /(issue|ticket).*(github)|github.*(issue|ticket)/i, action: "github_list_issues", label: "Lister les issues GitHub" },
  { re: /(diagnostic|santé|sante|health|détecte.*problème|detecte.*probleme|project doctor)/i, action: "knowledge_project_doctor", label: "Diagnostiquer la santé du projet" },
  { re: /(issue|problème|probleme|bug).*(critique|critical|important)|détecte|detecte/i, action: "knowledge_project_doctor", label: "Détecter les problèmes critiques" },
  { re: /(sécurité|securite|security|vuln|audit)/i, action: "security_audit", label: "Audit de sécurité" },
  { re: /(rapport|report|briefing|résumé|resume|digest|synthèse|synthese)/i, action: "knowledge_daily_briefing", label: "Générer le rapport" },
  { re: /(opportunit|optimis|amélior|amelior)/i, action: "knowledge_opportunities", label: "Chercher des opportunités" },
  { re: /(recherche|search|web).*(web|internet|en ligne)|cherche.*sur le web/i, action: "browser_web_search", label: "Recherche web" },
  { re: /(analyse|analys|comprend|context).*(code|projet|project|module|dépendance|dependance)/i, action: "knowledge_build_context", label: "Analyser le contexte du projet" },
  { re: /(test|tests|vérifie.*test|verifie.*test)/i, action: "knowledge_project_doctor", label: "Vérifier l'état des tests" },
  { re: /(notifi|préviens|previens|alerte|envoie|notify|message|email|mail)/i, action: "notify", label: "Notifier le résultat", args: { channel: "default" } },
  { re: /(commit|push|git)/i, action: "github_create_pr", label: "Créer une PR / commit" },
  { re: /(mémoris|memoris|enregistr|sauvegard|store|retiens)/i, action: "knowledge_memory_add", label: "Enregistrer en mémoire" },
];

const DAYS: Record<string, string> = {
  lundi: "mon", monday: "mon", mardi: "tue", tuesday: "tue", mercredi: "wed", wednesday: "wed",
  jeudi: "thu", thursday: "thu", vendredi: "fri", friday: "fri", samedi: "sat", saturday: "sat",
  dimanche: "sun", sunday: "sun",
};

/** Deterministic NL → WorkflowDefinition compiler. */
export class WorkflowCompiler {
  private readonly catalog?: Set<string>;

  constructor(options: WorkflowCompilerOptions = {}) {
    this.catalog = options.availableActions ? new Set(options.availableActions) : undefined;
  }

  compile(nl: string, opts: { name?: string } = {}): CompileResult {
    const text = (nl ?? "").trim();
    const warnings: string[] = [];
    const trigger = this.parseTrigger(text);
    const clauses = this.splitClauses(this.stripTriggerPhrase(text));

    const steps: CompiledStep[] = [];
    let prevId: string | undefined;
    for (const clause of clauses) {
      const rule = STEP_RULES.find((r) => r.re.test(clause));
      const id = `step_${steps.length + 1}`;
      let action: string;
      let label: string;
      let args: Record<string, unknown>;
      if (rule) {
        action = rule.action;
        label = rule.label;
        args = { ...(rule.args ?? {}) };
        if (this.catalog && !this.catalog.has(action)) {
          warnings.push(`Action « ${action} » (pour « ${clause} ») absente du catalogue — étape à confirmer.`);
          action = "TODO_choose_action";
        }
      } else {
        action = "TODO_choose_action";
        label = clause.slice(0, 60);
        args = { note: clause };
        warnings.push(`Clause non reconnue : « ${clause} » — choisir une action manuellement.`);
      }
      steps.push({ id, action, args, label, onError: "stop", dependsOn: prevId ? [prevId] : undefined });
      prevId = id;
    }

    if (steps.length === 0) {
      steps.push({ id: "step_1", action: "TODO_choose_action", args: { note: text }, label: "Étape à définir", onError: "stop" });
      warnings.push("Aucune étape identifiée — décrire les actions à automatiser.");
    }

    const workflow: CompiledWorkflow = {
      name: opts.name?.trim() || this.deriveName(text, steps),
      description: text,
      steps,
      schedule: trigger.schedule,
      trigger: { type: trigger.type, detail: trigger.detail },
    };

    return { workflow, warnings, summary: buildSummary(workflow, warnings) };
  }

  // ─── Trigger parsing ───────────────────────────────────────────────────────

  private parseTrigger(text: string): { type: "schedule" | "event" | "manual"; detail: string; schedule?: string } {
    const t = text.toLowerCase();

    // Interval: "toutes les 30 minutes", "every 2 hours", "chaque heure".
    const interval = t.match(/(?:toutes?\s+les?|every|chaque)\s+(\d+)?\s*(minute|min|heure|hour|hr|jour|day)/);
    if (interval) {
      const n = Number(interval[1] || "1");
      const unit = interval[2];
      const suffix = /min/.test(unit) ? "m" : /jour|day/.test(unit) ? "d" : "h";
      return { type: "schedule", detail: `intervalle: ${n}${suffix}`, schedule: `${n}${suffix}` };
    }

    // Specific weekday + optional time: "tous les lundis 08:00", "every Monday 8am".
    const day = Object.keys(DAYS).find((d) => new RegExp(`\\b${d}s?\\b`, "i").test(t));
    const time = t.match(/\b(\d{1,2})\s*(?:h|:)\s*(\d{2})?\b|\b(\d{1,2})\s*(am|pm)\b/i);
    if (day) {
      const hhmm = normalizeTime(time);
      return { type: "schedule", detail: `${DAYS[day]}${hhmm ? `@${hhmm}` : ""}`, schedule: `weekly:${DAYS[day]}${hhmm ? `@${hhmm}` : "@09:00"}` };
    }

    // Daily: "chaque matin", "tous les jours", "every morning/day".
    if (/(chaque|tous les)\s+(matin|jour|soir)|every\s+(morning|day|night)|daily|quotidien/.test(t)) {
      const hhmm = normalizeTime(time) ?? (/matin|morning/.test(t) ? "08:00" : /soir|night/.test(t) ? "18:00" : "09:00");
      return { type: "schedule", detail: `daily@${hhmm}`, schedule: `daily:${hhmm}` };
    }

    // Event trigger: "quand/lorsque/when ... (push, commit, mission, erreur)".
    if (/(quand|lorsqu|dès que|des que|when|on)\s+.*(push|commit|mission|erreur|error|pr\b|déploie|deploy)/.test(t)) {
      return { type: "event", detail: "déclencheur événementiel" };
    }

    return { type: "manual", detail: "manuel" };
  }

  /** Remove the leading trigger phrase so it is not parsed as a step. */
  private stripTriggerPhrase(text: string): string {
    return text.replace(
      /^(tous?\s+les?\s+\w+[^,]*|chaque\s+\w+[^,]*|toutes?\s+les?\s+[^,]*|every\s+[^,]*|daily|quotidien\w*|quand\s+[^,]*|lorsqu\w*\s+[^,]*|when\s+[^,]*)(,|:|\s+)/i,
      "",
    ).trim();
  }

  /** Split a request into ordered step clauses on connectors. */
  private splitClauses(text: string): string[] {
    return text
      .split(/\s*(?:,|;|→|->|\bpuis\b|\bensuite\b|\bet ensuite\b|\bthen\b|\band then\b|\bet\b|\band\b)\s*/i)
      .map((c) => c.trim())
      .filter((c) => c.length > 2);
  }

  private deriveName(text: string, steps: CompiledStep[]): string {
    const verbs = steps.map((s) => s.label).slice(0, 2).join(" + ");
    return verbs || (text.slice(0, 40) || "Automatisation");
  }
}

function normalizeTime(m: RegExpMatchArray | null): string | undefined {
  if (!m) return undefined;
  if (m[3] && m[4]) {
    // 12h am/pm form
    let h = Number(m[3]);
    if (/pm/i.test(m[4]) && h < 12) h += 12;
    if (/am/i.test(m[4]) && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:00`;
  }
  if (m[1]) {
    const h = Number(m[1]);
    const mm = m[2] ?? "00";
    return `${String(h).padStart(2, "0")}:${mm}`;
  }
  return undefined;
}

function buildSummary(w: CompiledWorkflow, warnings: string[]): string {
  const lines: string[] = [];
  lines.push(`## 🧩 Workflow compilé — « ${w.name} »`);
  lines.push("");
  const trig = w.trigger.type === "schedule" ? `⏰ Planifié (${w.schedule})` : w.trigger.type === "event" ? `⚡ Événement (${w.trigger.detail})` : "👆 Manuel";
  lines.push(`Déclencheur : ${trig}`);
  lines.push("");
  w.steps.forEach((s, i) => {
    const todo = s.action === "TODO_choose_action" ? " ⚠️" : "";
    lines.push(`${i + 1}. ${s.label} → \`${s.action}\`${todo}`);
  });
  if (warnings.length) {
    lines.push("");
    lines.push(`⚠️ ${warnings.length} point(s) à confirmer :`);
    for (const w2 of warnings) lines.push(`  - ${w2}`);
  }
  lines.push("");
  lines.push(`Prêt à créer via workflow_create (après revue).`);
  return lines.join("\n");
}

/** Shared singleton. */
export const workflowCompiler = new WorkflowCompiler();
