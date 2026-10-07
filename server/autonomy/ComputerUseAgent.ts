/**
 * ComputerUseAgent — "Computer Use Agent" (task.md §11, P1).
 *
 * Transforme les briques existantes (vision, navigateur, capture, automation)
 * en véritable boucle d'usage de l'ordinateur :
 *
 *   observe écran → comprend l'UI → identifie le problème → planifie → clique
 *   → observe → corrige → vérifie
 *
 * …avec confirmation selon le niveau de risque.
 *
 * Design & sûreté : le contrôleur est DÉTERMINISTE et ne fait AUCUNE I/O
 * directement. Il orchestre la boucle et délègue :
 *   - `observe()`  : lecture seule (snapshot/capture/texte) — exécuté librement,
 *   - `act()`      : action à effet de bord (clic/saisie/navigation) — exécuté
 *     UNIQUEMENT après passage par la porte de confirmation selon le risque,
 *   - `confirm()`  : la porte d'approbation existante (UI / Telegram / policy),
 *   - `planNext()` : la « compréhension » (en prod, un planner LLM ; en test, un
 *     script) qui choisit la prochaine action depuis l'observation courante.
 *
 * Ainsi le contrôleur reste testable et sûr : aucun clic réel ne part sans
 * confirmation, et la boucle est bornée (budget d'étapes anti-boucle).
 */

/** Action classes the agent can take. `observe` is always read-only. */
export type ComputerActionType =
  | "observe"   // read-only: snapshot / capture / read text / console / a11y tree
  | "navigate"  // go to a URL
  | "click"     // click an element
  | "type"      // type into a field
  | "scroll"    // scroll the page
  | "wait"      // wait for a condition
  | "done";     // the goal is reached — stop

export type ComputerRisk = "none" | "low" | "medium" | "high";

/** A single step the planner proposes. */
export interface ComputerAction {
  type: ComputerActionType;
  /** Target selector / role / label, when applicable. */
  target?: string;
  /** Value to type / URL to navigate, when applicable. */
  value?: string;
  /** The underlying browser tool to invoke (e.g. "browser_click"). */
  tool?: string;
  /** Free-form args passed to the tool handler. */
  args?: Record<string, unknown>;
  /** Planner's short rationale for this step. */
  rationale?: string;
}

/** The result of running one action. */
export interface ActionOutcome {
  ok: boolean;
  /** Observation text/data produced (for observe) or result of an act. */
  observation?: string;
  error?: string;
}

export interface ComputerStepRecord {
  index: number;
  action: ComputerAction;
  risk: ComputerRisk;
  /** Was confirmation required and granted? (undefined = not required) */
  confirmed?: boolean;
  outcome?: ActionOutcome;
  /** Reason the step was blocked, if it was. */
  blocked?: string;
}

export interface ComputerUseResult {
  goal: string;
  status: "completed" | "stopped" | "blocked" | "budget_exhausted";
  steps: ComputerStepRecord[];
  summary: string;
}

/** Injected capabilities. Production wires these to the browser/vision skills. */
export interface ComputerUseHandlers {
  /** Produce the current observation (read-only). Must have no side effect. */
  observe(action: ComputerAction): Promise<ActionOutcome> | ActionOutcome;
  /** Perform a side-effecting action (click/type/navigate/scroll). */
  act(action: ComputerAction): Promise<ActionOutcome> | ActionOutcome;
  /**
   * Decide the next action from the goal + latest observation + history. In
   * production this is an LLM-backed planner; it must return a `done` action to
   * finish. Deterministic/scriptable for tests.
   */
  planNext(ctx: { goal: string; lastObservation?: string; history: ComputerStepRecord[] }): Promise<ComputerAction> | ComputerAction;
  /**
   * Confirmation gate for risky actions. Return true to proceed. Omitted →
   * medium/high-risk actions are blocked (fail-closed).
   */
  confirm?(action: ComputerAction, risk: ComputerRisk): Promise<boolean> | boolean;
}

export interface ComputerUseConfig {
  /** Max loop iterations (anti-loop bound). Default 20. */
  maxSteps: number;
  /**
   * Risk level at/above which confirmation is required before acting.
   * Default "low" → every side effect is confirmed. Set "high" to auto-run
   * low/medium side effects (not recommended for untrusted pages).
   */
  confirmAtOrAbove: ComputerRisk;
}

const RISK_ORDER: ComputerRisk[] = ["none", "low", "medium", "high"];
const atLeast = (a: ComputerRisk, b: ComputerRisk): boolean => RISK_ORDER.indexOf(a) >= RISK_ORDER.indexOf(b);

/** Default risk of each action type. */
function riskOf(action: ComputerAction): ComputerRisk {
  switch (action.type) {
    case "observe":
    case "wait":
    case "done":
      return "none";
    case "scroll":
      return "low";
    case "navigate":
      return "medium";
    case "type":
      return "medium";
    case "click": {
      // Clicks that look destructive are high risk.
      const hay = `${action.target ?? ""} ${action.value ?? ""} ${JSON.stringify(action.args ?? {})}`.toLowerCase();
      return /delete|supprim|remove|pay|achat|purchase|confirm|valider|submit|envoyer|logout|déconnect|deconnect/.test(hay) ? "high" : "medium";
    }
    default:
      return "medium";
  }
}

/** Map an action to the underlying browser tool when the planner didn't set one. */
function defaultTool(action: ComputerAction): string | undefined {
  switch (action.type) {
    case "navigate": return "browser_navigate";
    case "click": return action.target?.includes("role=") ? "browser_click_by_role" : "browser_click";
    case "type": return "browser_type";
    case "scroll": return "browser_scroll";
    case "wait": return "browser_wait_for";
    case "observe": return "browser_snapshot";
    default: return undefined;
  }
}

const DEFAULT_CONFIG: ComputerUseConfig = { maxSteps: 20, confirmAtOrAbove: "low" };

/**
 * Deterministic observe→plan→act→verify controller. All real I/O is delegated;
 * side effects are gated by the confirmation policy. Never loops unbounded.
 */
export class ComputerUseAgent {
  private readonly config: ComputerUseConfig;

  constructor(private readonly handlers: ComputerUseHandlers, config: Partial<ComputerUseConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Run the loop toward `goal`. Stops on done, block, or budget exhaustion. */
  async run(goal: string): Promise<ComputerUseResult> {
    const steps: ComputerStepRecord[] = [];
    let lastObservation: string | undefined;
    let status: ComputerUseResult["status"] = "budget_exhausted";

    for (let i = 0; i < this.config.maxSteps; i++) {
      const action = await this.handlers.planNext({ goal, lastObservation, history: steps });
      action.tool ??= defaultTool(action);
      const risk = riskOf(action);

      if (action.type === "done") {
        steps.push({ index: i, action, risk, outcome: { ok: true, observation: "Objectif atteint." } });
        status = "completed";
        break;
      }

      // Read-only observations run freely.
      if (action.type === "observe" || action.type === "wait") {
        const outcome = await this.handlers.observe(action);
        if (outcome.observation) lastObservation = outcome.observation;
        steps.push({ index: i, action, risk, outcome });
        continue;
      }

      // Side-effecting action: gate on risk.
      const needsConfirm = atLeast(risk, this.config.confirmAtOrAbove);
      if (needsConfirm) {
        const granted = this.handlers.confirm ? await this.handlers.confirm(action, risk) : false;
        if (!granted) {
          steps.push({ index: i, action, risk, confirmed: false, blocked: `Action ${action.type} (risque ${risk}) non confirmée — arrêt.` });
          status = "blocked";
          break;
        }
        const outcome = await this.handlers.act(action);
        steps.push({ index: i, action, risk, confirmed: true, outcome });
        // Verify by refreshing the observation after a side effect.
        lastObservation = await this.refreshObservation(lastObservation);
        if (!outcome.ok) { status = "stopped"; break; }
      } else {
        const outcome = await this.handlers.act(action);
        steps.push({ index: i, action, risk, outcome });
        lastObservation = await this.refreshObservation(lastObservation);
        if (!outcome.ok) { status = "stopped"; break; }
      }
    }

    return { goal, status, steps, summary: buildSummary(goal, status, steps) };
  }

  /** Re-observe after an action (verify step). Best-effort. */
  private async refreshObservation(previous?: string): Promise<string | undefined> {
    try {
      const outcome = await this.handlers.observe({ type: "observe", tool: "browser_snapshot" });
      return outcome.observation ?? previous;
    } catch {
      return previous;
    }
  }
}

function buildSummary(goal: string, status: ComputerUseResult["status"], steps: ComputerStepRecord[]): string {
  const label: Record<ComputerUseResult["status"], string> = {
    completed: "✅ Objectif atteint",
    stopped: "⏹️ Arrêté sur échec d'action",
    blocked: "🔒 Bloqué (confirmation refusée)",
    budget_exhausted: "⏱️ Budget d'étapes épuisé",
  };
  const lines: string[] = [];
  lines.push(`## 👁️ Computer Use — « ${goal} »`);
  lines.push("");
  lines.push(`Statut : ${label[status]} · ${steps.length} étape(s)`);
  lines.push("");
  for (const s of steps) {
    const icon = s.blocked ? "🔒" : s.outcome?.ok === false ? "❌" : s.action.type === "observe" ? "👁️" : s.action.type === "done" ? "🏁" : "⚙️";
    const risk = s.risk !== "none" ? ` [risque ${s.risk}${s.confirmed ? ", confirmé" : ""}]` : "";
    const detail = s.action.target || s.action.value || "";
    lines.push(`${icon} [${s.index}] ${s.action.type}${detail ? ` ${detail}` : ""}${risk}${s.blocked ? ` — ${s.blocked}` : ""}`);
  }
  return lines.join("\n");
}
