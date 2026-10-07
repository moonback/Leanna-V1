/**
 * Lecteur SSE unique du module notebooks.
 *
 * Remplace les 7 boucles `res.body.getReader()` dupliquées, qui existaient en
 * deux variantes de framing :
 *   A) lignes `data:` seules, séparées par "\n" (chat, deep-dive, compare,
 *      insights, génération) ;
 *   B) événements complets `event:`/`data:` séparés par "\n\n" (TTS).
 *
 * Règle de parsing unifiée : on découpe le flux en lignes, on retient la
 * dernière ligne `event:` rencontrée, et on émet une frame par ligne `data:`
 * (avec l'event courant). Cela reproduit fidèlement les deux variantes.
 *
 * Le JSON mal formé d'une frame est ignoré (comme le faisait le code existant),
 * sauf si `parseData` est désactivé.
 */

import { ApiError } from './client.js';
import type { SseFrame } from './types.js';

export interface StreamSSEOptions {
  method?: string;
  /** Corps JSON sérialisé automatiquement. */
  json?: unknown;
  /** Corps brut (si `json` n'est pas fourni). */
  body?: BodyInit;
  headers?: HeadersInit;
  signal?: AbortSignal;
  /**
   * Callback appelé pour chaque frame `data:`. `event` porte la dernière ligne
   * `event:` vue, `data` est le JSON parsé (ou la chaîne brute si le parsing
   * échoue et que le JSON n'était pas attendu).
   */
  onFrame: (frame: SseFrame) => void;
}

/**
 * Ouvre une requête SSE et consomme le flux jusqu'à la fin (ou l'abort).
 * Lance `ApiError(status, body)` si la réponse n'est pas `ok`.
 *
 * L'annulation via `signal` fait remonter un `DOMException` "AbortError" que
 * l'appelant doit traiter silencieusement (comportement historique).
 */
export async function streamSSE(path: string, options: StreamSSEOptions): Promise<void> {
  const { method = 'POST', json, body, headers, signal, onFrame } = options;

  const finalHeaders = new Headers(headers);
  let finalBody = body;
  if (json !== undefined) {
    finalBody = JSON.stringify(json);
    if (!finalHeaders.has('Content-Type')) {
      finalHeaders.set('Content-Type', 'application/json');
    }
  }

  const res = await fetch(path, { method, headers: finalHeaders, body: finalBody, signal });

  if (!res.ok) {
    let errBody: unknown = null;
    try {
      errBody = await res.json();
    } catch {
      /* corps non JSON */
    }
    throw new ApiError(res.status, errBody);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('Pas de body stream');

  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent: string | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    // La dernière entrée peut être une ligne incomplète : on la garde en buffer.
    buffer = lines.pop() ?? '';

    for (const rawLine of lines) {
      const line = rawLine.replace(/\r$/, '');
      if (!line.trim()) {
        // Ligne vide : fin d'un événement SSE, on réinitialise l'event courant.
        currentEvent = undefined;
        continue;
      }
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
        continue;
      }
      if (line.startsWith('data: ')) {
        const raw = line.slice(6);
        let data: unknown = raw;
        try {
          data = JSON.parse(raw);
        } catch {
          // JSON mal formé : on transmet la chaîne brute (l'appelant filtre).
        }
        onFrame({ event: currentEvent, data });
      }
    }
  }
}
