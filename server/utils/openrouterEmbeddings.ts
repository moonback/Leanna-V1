/**
 * openrouterEmbeddings — Génération d'embeddings via l'API OpenRouter.
 *
 * OpenRouter expose un endpoint d'embeddings compatible OpenAI :
 *   POST https://openrouter.ai/api/v1/embeddings
 *   body: { model, input: string | string[], dimensions? }
 *   réponse: { data: [{ embedding: number[], index }], model, usage }
 *
 * Ce module remplace l'ancien appel Gemini (gemini-embedding-001) qui saturait
 * son quota (429 RESOURCE_EXHAUSTED). Il réutilise la même résolution de clé et
 * les mêmes en-têtes que le reste de l'app (voir imageGeneration.ts).
 *
 * Réf : https://openrouter.ai/docs/api/api-reference/embeddings/create-embeddings
 */

import { createLogger } from "./logger.js";

const log = createLogger("openrouterEmbeddings");

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * Modèle d'embedding par défaut. text-embedding-3-small supporte le paramètre
 * `dimensions` (réduction native), est rapide et peu coûteux. Surchargeable via
 * la variable d'environnement OPENROUTER_EMBEDDING_MODEL.
 */
export const DEFAULT_EMBEDDING_MODEL =
  process.env.OPENROUTER_EMBEDDING_MODEL?.trim() || "openai/text-embedding-3-small";

/** Résout la clé OpenRouter comme le reste de l'app (principale → gratuite). */
function resolveKey(): string | null {
  const key = process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_FREE_API_KEY;
  return key && key.trim() ? key.trim() : null;
}

interface EmbeddingResponse {
  data?: Array<{ embedding: number[]; index: number }>;
  model?: string;
  usage?: { prompt_tokens?: number; total_tokens?: number };
}

/**
 * Génère les embeddings d'un lot de textes via OpenRouter.
 *
 * @param inputs       Textes à vectoriser (ordre préservé dans la sortie).
 * @param model        Modèle d'embedding (défaut : DEFAULT_EMBEDDING_MODEL).
 * @param dimensions   Dimensionnalité souhaitée (si le modèle la supporte).
 * @param maxRetries   Nombre de tentatives sur erreurs 429/5xx (défaut : 3).
 * @returns            Un tableau de vecteurs, aligné sur `inputs`. En cas
 *                     d'échec irrécupérable, lève l'erreur à l'appelant.
 */
export async function embedTextsOpenRouter(
  inputs: string[],
  options: { model?: string; dimensions?: number; maxRetries?: number; timeoutMs?: number } = {}
): Promise<number[][]> {
  if (inputs.length === 0) return [];

  const apiKey = resolveKey();
  if (!apiKey) {
    throw new Error(
      "Aucune clé OpenRouter disponible (OPENROUTER_API_KEY / OPENROUTER_FREE_API_KEY)."
    );
  }

  const model = options.model || DEFAULT_EMBEDDING_MODEL;
  const maxRetries = options.maxRetries ?? 3;
  const timeoutMs = options.timeoutMs ?? 120_000;

  const body: Record<string, unknown> = { model, input: inputs };
  if (options.dimensions && options.dimensions > 0) {
    body.dimensions = options.dimensions;
  }

  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${OPENROUTER_BASE_URL}/embeddings`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.OPENROUTER_REFERER || "https://Leanna.local",
          "X-Title": process.env.OPENROUTER_TITLE || "Leanna",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        const status = response.status;

        // 429 (rate limit) / 5xx (provider overloaded) → retry avec backoff.
        if ((status === 429 || status >= 500) && attempt < maxRetries - 1) {
          const delay = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s…
          log.warn(
            `OpenRouter embeddings HTTP ${status}, nouvelle tentative dans ${delay}ms ` +
              `(${attempt + 1}/${maxRetries})`
          );
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        throw new Error(`OpenRouter embeddings HTTP ${status} — ${errText.slice(0, 300)}`);
      }

      const data = (await response.json()) as EmbeddingResponse;
      const rows = data.data ?? [];

      // Réordonner par `index` pour garantir l'alignement avec `inputs`.
      const vectors: number[][] = new Array(inputs.length).fill(null).map(() => [] as number[]);
      for (const row of rows) {
        const idx = typeof row.index === "number" ? row.index : rows.indexOf(row);
        if (idx >= 0 && idx < vectors.length) {
          vectors[idx] = row.embedding || [];
        }
      }

      return vectors;
    } catch (e: unknown) {
      lastError = e;
      const message = e instanceof Error ? e.message : String(e);

      // Abort (timeout) ou erreur réseau → retry si des tentatives restent.
      if (attempt < maxRetries - 1) {
        const delay = 1000 * Math.pow(2, attempt);
        log.warn(`OpenRouter embeddings erreur réseau (${message}), retry dans ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("OpenRouter embeddings : échec après plusieurs tentatives.");
}
