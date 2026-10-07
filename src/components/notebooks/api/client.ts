/**
 * Client API unique du module notebooks.
 *
 * Centralise les appels `fetch` JSON auparavant dupliqués dans les composants,
 * ainsi que le parsing d'erreur répété ~20 fois sous la forme
 * `res.json().catch(() => ({ error })); throw new Error(d.error || HTTP ...)`.
 *
 * N'introduit volontairement AUCUNE authentification par en-tête (le
 * `x-Leanna-token` existant reste localisé dans ImportToNotebookButton) : la
 * stratégie d'auth relève de la phase 6.
 */

/** Erreur HTTP structurée : conserve le statut et le corps d'erreur éventuel. */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown, message?: string) {
    super(message || extractErrorMessage(body) || `HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/** Extrait un message lisible d'un corps d'erreur JSON ({ error: string }). */
function extractErrorMessage(body: unknown): string | undefined {
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as { error?: unknown }).error;
    if (typeof err === 'string') return err;
  }
  return undefined;
}

/** Lit le corps en JSON de façon tolérante (null si le corps n'est pas du JSON). */
async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export interface ApiOptions extends Omit<RequestInit, 'body'> {
  /** Corps JSON : sérialisé automatiquement avec le bon Content-Type. */
  json?: unknown;
  /** Corps brut (FormData, string…) : passé tel quel, sans Content-Type imposé. */
  body?: BodyInit;
  signal?: AbortSignal;
}

/**
 * Effectue une requête et renvoie la réponse JSON typée `T`.
 * Lance `ApiError(status, body)` si la réponse n'est pas `ok`.
 *
 * Exemple :
 *   const { source } = await api<{ source: Source }>(
 *     `/api/notebooks/${id}/sources/url`,
 *     { method: 'POST', json: { url } },
 *   );
 */
export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { json, body, headers, ...rest } = options;

  const finalHeaders = new Headers(headers);
  let finalBody = body;
  if (json !== undefined) {
    finalBody = JSON.stringify(json);
    if (!finalHeaders.has('Content-Type')) {
      finalHeaders.set('Content-Type', 'application/json');
    }
  }

  const res = await fetch(path, { ...rest, headers: finalHeaders, body: finalBody });

  if (!res.ok) {
    throw new ApiError(res.status, await safeJson(res));
  }

  // 204 No Content ou corps vide : renvoyer undefined typé en T.
  if (res.status === 204) return undefined as T;
  return (await safeJson(res)) as T;
}

/** Variante sans corps de réponse attendu (DELETE, actions fire-and-forget). */
export async function apiVoid(path: string, options: ApiOptions = {}): Promise<void> {
  const { json, body, headers, ...rest } = options;

  const finalHeaders = new Headers(headers);
  let finalBody = body;
  if (json !== undefined) {
    finalBody = JSON.stringify(json);
    if (!finalHeaders.has('Content-Type')) {
      finalHeaders.set('Content-Type', 'application/json');
    }
  }

  const res = await fetch(path, { ...rest, headers: finalHeaders, body: finalBody });
  if (!res.ok) {
    throw new ApiError(res.status, await safeJson(res));
  }
}
