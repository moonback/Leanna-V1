/**
 * jevDecisions.ts — Client pour le modèle de décision Jev (TypeSafe) via l'API
 * Decisions d'OpenRouter.
 *
 * Jev n'est PAS un modèle de chat. Il prend un `state` (l'objet à évaluer) et
 * un ensemble de `questions` typées, puis renvoie des jugements typés avec des
 * probabilités calibrées. Le code appelant applique des seuils sur ces
 * probabilités pour décider d'une action.
 *
 * ⚠️ Endpoint dédié : POST https://openrouter.ai/api/alpha/decisions
 *    (différent de /chat/completions). N'importe quelle OPENROUTER_API_KEY
 *    fonctionne, aucun compte TypeSafe requis.
 *
 * Référence : https://openrouter.ai/docs/guides/community/jev
 */

import { telemetryService } from '../observability/TelemetryService.js';

const DECISIONS_URL = 'https://openrouter.ai/api/alpha/decisions';

/** Alias suivant toujours la dernière version publiée de Jev. */
export const JEV_LATEST = 'typesafe/jev-latest';
/** Version épinglée (recommandée en prod pour la reproductibilité). */
export const JEV_PINNED = 'typesafe/jev-1.13';

// ── Types de questions ───────────────────────────────────────────────────────

/** Choisir une option parmi un ensemble défini. `criteria` mappe option→description. */
export interface ChoiceQuestion {
  type: 'choice';
  instructions: string;
  criteria: Record<string, string>;
}

/** Proposition vraie/fausse. `criteria` (optionnel) décrit les deux côtés. */
export interface NoulQuestion {
  type: 'noul';
  instructions: string;
  criteria?: { true: string; false: string };
}

/** Échelle ordonnée (2 à 10 niveaux, du pire au meilleur). */
export interface ScoreQuestion {
  type: 'score';
  instructions: string;
  criteria: string[];
}

export type JevQuestion = ChoiceQuestion | NoulQuestion | ScoreQuestion;

// ── Types de réponses ────────────────────────────────────────────────────────

export interface ChoiceAnswer {
  type: 'choice';
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

export interface NoulAnswer {
  type: 'noul';
  /** Probabilité (0–1) que la proposition soit vraie. */
  noul: number;
}

export interface ScoreAnswer {
  type: 'score';
  /** Moyenne pondérée des indices de niveau. */
  score: number;
  probabilities: Record<string, number>;
  confidence: number;
  legend: Record<string, string>;
}

export type JevAnswer = ChoiceAnswer | NoulAnswer | ScoreAnswer;

export interface JevDecisionResult {
  model: string;
  answers: Record<string, JevAnswer>;
  usage: { input_tokens: number; output_tokens: number; cost: number };
  id: string;
  provider: string;
}

export interface JevDecideOptions {
  /** L'input à évaluer : string, objet JSON ou tableau. */
  state: unknown;
  /** Questions typées, indexées par un identifiant lisible par ton code. */
  questions: Record<string, JevQuestion>;
  /** Override du modèle (défaut : JEV_PINNED pour la reproductibilité). */
  model?: string;
  /** Clé API — sinon repli sur l'env OpenRouter. */
  apiKey?: string;
  /** Timeout en ms (défaut 30s). */
  timeoutMs?: number;
  /** Contexte télémétrie optionnel. */
  missionId?: string;
  taskId?: string;
}

/**
 * Résout la clé OpenRouter comme le reste de l'app (profil géré par
 * l'appelant → env principale → env "free").
 */
function resolveKey(explicit?: string): string | undefined {
  return (
    explicit?.trim() ||
    process.env.OPENROUTER_API_KEY ||
    process.env.OPENROUTER_FREE_API_KEY ||
    undefined
  );
}

/**
 * Appelle Jev sur un state avec des questions typées.
 *
 * @throws Error (avec `.status`) si la clé manque ou si l'API répond en erreur.
 */
export async function decide(options: JevDecideOptions): Promise<JevDecisionResult> {
  const key = resolveKey(options.apiKey);
  if (!key) {
    const err = new Error('Jev : aucune clé OpenRouter disponible (OPENROUTER_API_KEY).');
    (err as any).status = 401;
    throw err;
  }

  const model = options.model || JEV_PINNED;
  const span = telemetryService.startModelCallSpan('openrouter', model, options.taskId);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);

  try {
    const response = await fetch(DECISIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.OPENROUTER_REFERER || 'https://Leanna.local',
        'X-Title': process.env.OPENROUTER_TITLE || 'Leanna',
      },
      body: JSON.stringify({
        model,
        state: options.state,
        questions: options.questions,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      const err = new Error(`Jev/Decisions ${response.status}: ${errText.slice(0, 300)}`);
      (err as any).status = response.status;
      throw err;
    }

    const data = (await response.json()) as JevDecisionResult;

    // Télémétrie : Jev facture par tokens comme les autres appels OpenRouter.
    if (data.usage) {
      telemetryService.recordTokenUsage({
        missionId: options.missionId,
        taskId: options.taskId,
        provider: 'openrouter',
        model: data.model || model,
        inputTokens: data.usage.input_tokens || 0,
        outputTokens: data.usage.output_tokens || 0,
      });
      span.setAttribute('tokens.input', data.usage.input_tokens || 0);
      span.setAttribute('tokens.output', data.usage.output_tokens || 0);
      span.setAttribute('cost.usd', data.usage.cost || 0);
    }

    span.setStatus({ code: 0 });
    span.end();
    return data;
  } catch (e: any) {
    clearTimeout(timeoutId);
    span.recordException(e);
    span.setStatus({ code: 2, message: e.message });
    span.end();
    if (e.name === 'AbortError') {
      const err = new Error(`Jev : délai d'attente dépassé (${options.timeoutMs ?? 30_000}ms).`);
      (err as any).status = 504;
      throw err;
    }
    throw e;
  }
}

// ── Garde-typage pratiques pour la couche "policy" ───────────────────────────

export function isChoice(a: JevAnswer | undefined): a is ChoiceAnswer {
  return a?.type === 'choice';
}
export function isNoul(a: JevAnswer | undefined): a is NoulAnswer {
  return a?.type === 'noul';
}
export function isScore(a: JevAnswer | undefined): a is ScoreAnswer {
  return a?.type === 'score';
}
