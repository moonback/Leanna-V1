/**
 * VoiceCommandInterpreter — "Voice Agent" core (task.md §12).
 *
 * Pas seulement parler avec Leanna : PILOTER Leanna à la voix. Le socle Gemini
 * Live + partage d'écran existe déjà ; le manque est de faire de la voix une
 * *interface de commande agentique complète*. Cet interprète est ce cœur
 * déterministe : il transforme une transcription en une SÉQUENCE ORDONNÉE de
 * commandes agentiques exécutables —
 *
 *   « Leanna, regarde mon projet. Trouve les trois problèmes les plus importants.
 *     Corrige le premier. Lance les tests. Si tout est bon, commit. »
 *
 * …chaque commande portant un intent (mappé sur un skill réel), une cible
 * (« le premier », « les trois »), une condition (« si tout est bon »), et un
 * drapeau de confirmation pour les actions risquées (commit, suppression,
 * déploiement). L'exécution reste derrière le routage Live + la confirmation
 * existants ; cet interprète ne fait que planifier. Déterministe, aucun modèle.
 */

export type VoiceIntent =
  | "diagnose"      // "regarde/analyse/diagnostique mon projet"
  | "find_issues"   // "trouve les problèmes"
  | "fix"           // "corrige ..."
  | "test"          // "lance les tests"
  | "commit"        // "commit"
  | "run_mission"   // "lance une mission pour ..."
  | "simulate"      // "simule ..."
  | "open"          // "ouvre le fichier X"
  | "search"        // "cherche ..."
  | "briefing"      // "fais-moi le briefing / résumé"
  | "stop"          // "arrête / stop / annule"
  | "explain"       // "pourquoi / explique"
  | "unknown";

/** Mapping of each intent to the real skill/tool that fulfils it. */
export const INTENT_SKILL: Record<VoiceIntent, string | undefined> = {
  diagnose: "knowledge_project_doctor",
  find_issues: "knowledge_project_doctor",
  fix: "mission_create",
  test: "mission_create",
  commit: "github_create_pr",
  run_mission: "mission_create",
  simulate: "mission_simulate",
  open: "read_file",
  search: "browser_web_search",
  briefing: "knowledge_daily_briefing",
  stop: undefined,
  explain: undefined,
  unknown: undefined,
};

/** A target reference extracted from a clause ("le premier", "les trois"). */
export interface VoiceTarget {
  /** Ordinal reference, 1-based (e.g. "le premier" → 1). */
  ordinal?: number;
  /** Count reference (e.g. "les trois problèmes" → 3). */
  count?: number;
  /** Free-text target (e.g. a file name, a search query). */
  text?: string;
}

export interface VoiceCommand {
  index: number;
  intent: VoiceIntent;
  /** The real skill to invoke, when the intent maps to one. */
  skill?: string;
  /** Original clause text. */
  utterance: string;
  target?: VoiceTarget;
  /** Condition gating this command, e.g. "si tout est bon". */
  condition?: string;
  /** Risky action requiring confirmation before execution. */
  requiresConfirmation: boolean;
}

export interface VoiceInterpretation {
  /** Was the wake word present? */
  wakeWord: boolean;
  /** Ordered command plan. */
  commands: VoiceCommand[];
  /** Clauses that could not be classified. */
  unrecognized: string[];
  summary: string;
}

export interface VoiceInterpreterOptions {
  /** Accepted wake words (lowercased). Default: ["leanna", "léanna"]. */
  wakeWords?: string[];
}

/** Intent classification rules. First match wins per clause. */
const INTENT_RULES: Array<{ re: RegExp; intent: VoiceIntent }> = [
  { re: /\b(arrête|arrete|stop|annule|cancel|pause)\b/i, intent: "stop" },
  { re: /\b(pourquoi|explique|explain|raison|why)\b/i, intent: "explain" },
  { re: /\b(simule|simulation|simulate|aperçu|apercu|dry.?run)\b/i, intent: "simulate" },
  { re: /\b(briefing|résumé|resume|digest|point du jour|rapport du matin)\b/i, intent: "briefing" },
  { re: /\b(diagnosti\w*|inspecte|examine|audit)\b|\b(regarde|analyse|santé|sante)\b.*\b(projet|project|code|app|application|mon|le|mes)\b/i, intent: "diagnose" },
  { re: /\b(trouve|détecte|detecte|identifie|liste|find|detect)\b.*\b(problème|probleme|issue|bug|erreur|error)s?\b/i, intent: "find_issues" },
  { re: /\b(corrige|répare|repare|fix|résous|resous|règle|regle)\b/i, intent: "fix" },
  { re: /\b(test|tests|teste|lance les tests|run tests|vérifie.*test|verifie.*test)\b/i, intent: "test" },
  { re: /\b(commit|committe|pousse|push|enregistre les changements)\b/i, intent: "commit" },
  { re: /\b(ouvre|open|affiche|montre)\b.*\.(ts|tsx|js|jsx|json|md|css|html|py)|^(ouvre|open)\b/i, intent: "open" },
  { re: /\b(cherche|recherche|search|google|trouve.*sur)\b/i, intent: "search" },
  { re: /\b(lance|démarre|demarre|exécute|execute|start|run|crée une mission|cree une mission|mission)\b/i, intent: "run_mission" },
];

/** Intents whose execution has side effects and needs confirmation. */
const RISKY_INTENTS = new Set<VoiceIntent>(["commit", "fix", "run_mission"]);

const ORDINALS: Record<string, number> = {
  premier: 1, première: 1, "1er": 1, first: 1,
  deuxième: 2, second: 2, seconde: 2, "2e": 2, "2ème": 2, second_en: 2,
  troisième: 3, "3e": 3, "3ème": 3, third: 3,
};

const NUMBER_WORDS: Record<string, number> = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6,
  one: 1, two: 2, three: 3, four: 4, five: 5,
};

export class VoiceCommandInterpreter {
  private readonly wakeWords: string[];

  constructor(options: VoiceInterpreterOptions = {}) {
    this.wakeWords = (options.wakeWords ?? ["leanna", "léanna"]).map((w) => w.toLowerCase());
  }

  interpret(transcript: string): VoiceInterpretation {
    const raw = (transcript ?? "").trim();
    const wakeWord = this.hasWakeWord(raw);
    const body = this.stripWakeWord(raw);

    const commands: VoiceCommand[] = [];
    const unrecognized: string[] = [];
    let pendingCondition: string | undefined;

    for (const clause of this.splitClauses(body)) {
      const { condition, rest } = this.extractCondition(clause);
      // A condition stated alone ("si tout est bon") attaches to the next command.
      if (condition && !rest) { pendingCondition = condition; continue; }

      const intent = this.classify(rest);
      if (intent === "unknown") {
        unrecognized.push(clause);
        continue;
      }
      const command: VoiceCommand = {
        index: commands.length,
        intent,
        skill: INTENT_SKILL[intent],
        utterance: clause,
        target: this.extractTarget(rest, intent),
        condition: condition ?? pendingCondition,
        requiresConfirmation: RISKY_INTENTS.has(intent),
      };
      pendingCondition = undefined;
      commands.push(command);
    }

    return { wakeWord, commands, unrecognized, summary: buildSummary(wakeWord, commands, unrecognized) };
  }

  private hasWakeWord(text: string): boolean {
    const t = text.toLowerCase();
    return this.wakeWords.some((w) => t.startsWith(w) || t.includes(` ${w},`) || t.includes(`${w} `));
  }

  private stripWakeWord(text: string): string {
    let t = text;
    for (const w of this.wakeWords) {
      t = t.replace(new RegExp(`^\\s*${escapeRe(w)}[\\s,]+`, "i"), "");
    }
    return t.trim();
  }

  /** Split a multi-command utterance into ordered clauses. */
  private splitClauses(text: string): string[] {
    return text
      // Split on sentence punctuation only when followed by space/end (so a dot
      // inside a filename like "src/server.ts" is preserved), plus connectors.
      .split(/(?:[.!?]+(?=\s|$)|[,;]|\bpuis\b|\bensuite\b|\bet ensuite\b|\bet\b|\bthen\b|\band then\b|\band\b)/i)
      .map((c) => c.trim())
      .filter((c) => c.length > 1);
  }

  /** Pull a leading/trailing conditional ("si tout est bon, commit"). */
  private extractCondition(clause: string): { condition?: string; rest: string } {
    const m = clause.match(/\b(si|lorsque|quand|if|when)\b\s+(.+?)(?:,\s*(.*))?$/i);
    if (m) {
      const cond = `${m[1]} ${m[2]}`.trim();
      const rest = (m[3] ?? "").trim();
      // If nothing follows the condition in this clause, it gates the next one.
      return { condition: cond, rest };
    }
    return { rest: clause };
  }

  private classify(clause: string): VoiceIntent {
    for (const { re, intent } of INTENT_RULES) {
      if (re.test(clause)) return intent;
    }
    return "unknown";
  }

  private extractTarget(clause: string, intent: VoiceIntent): VoiceTarget | undefined {
    const t = clause.toLowerCase();
    const target: VoiceTarget = {};

    // Ordinal: "le premier", "the first".
    for (const [word, n] of Object.entries(ORDINALS)) {
      if (new RegExp(`\\b${escapeRe(word)}\\b`, "i").test(t)) { target.ordinal = n; break; }
    }
    // Count: "les trois (problèmes)", "top 3".
    const digit = t.match(/\b(\d+)\b/);
    if (digit) target.count = Number(digit[1]);
    else {
      for (const [word, n] of Object.entries(NUMBER_WORDS)) {
        if (new RegExp(`\\b${escapeRe(word)}\\s+(problème|probleme|issue|bug|erreur|fichier|chose)`, "i").test(t)) { target.count = n; break; }
      }
    }
    // File target for "open".
    if (intent === "open") {
      const file = clause.match(/[\w./\\-]+\.(?:ts|tsx|js|jsx|json|md|css|html|py)/i);
      if (file) target.text = file[0];
    }
    // Free-text query for "search".
    if (intent === "search") {
      const q = clause.replace(/^.*\b(cherche|recherche|search|google|trouve)\b\s*/i, "").trim();
      if (q) target.text = q;
    }

    return Object.keys(target).length > 0 ? target : undefined;
  }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSummary(wakeWord: boolean, commands: VoiceCommand[], unrecognized: string[]): string {
  const lines: string[] = [];
  lines.push(`## 🎙️ Commandes vocales${wakeWord ? " (mot d'activation détecté)" : ""}`);
  lines.push("");
  if (commands.length === 0) {
    lines.push("Aucune commande reconnue.");
  } else {
    commands.forEach((c) => {
      const parts: string[] = [`${c.index + 1}. ${c.intent}`];
      if (c.skill) parts.push(`→ \`${c.skill}\``);
      if (c.target?.ordinal) parts.push(`[cible: #${c.target.ordinal}]`);
      if (c.target?.count) parts.push(`[nombre: ${c.target.count}]`);
      if (c.target?.text) parts.push(`[« ${c.target.text} »]`);
      if (c.condition) parts.push(`(condition: ${c.condition})`);
      if (c.requiresConfirmation) parts.push("⚠️ confirmation requise");
      lines.push(parts.join(" "));
    });
  }
  if (unrecognized.length) {
    lines.push("");
    lines.push(`❓ Non reconnu : ${unrecognized.map((u) => `« ${u} »`).join(", ")}`);
  }
  return lines.join("\n");
}

/** Shared singleton. */
export const voiceCommandInterpreter = new VoiceCommandInterpreter();
