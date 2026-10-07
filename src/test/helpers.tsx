/**
 * Utilitaires partagés pour les tests de caractérisation du module notebooks.
 *
 * - renderWithProviders : monte un composant dans les providers requis
 *   (Toast + UserProfile), nécessaires aux trois composants testés.
 * - sseResponse / jsonResponse : fabriquent des réponses fetch factices,
 *   dont un corps SSE lisible via body.getReader() comme le fait le code réel.
 * - mockFetchRouter : un stub de global.fetch qui route par URL.
 */

import type { ReactElement } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { ToastProvider } from '../components/ui/Toast.js';
import { UserProfileProvider } from '../context/UserProfileContext.js';
import { vi } from 'vitest';

// ─── Providers ───────────────────────────────────────────────────────────────

function AllProviders({ children }: { children: React.ReactNode }) {
  return (
    <UserProfileProvider>
      <ToastProvider>{children}</ToastProvider>
    </UserProfileProvider>
  );
}

export function renderWithProviders(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, { wrapper: AllProviders, ...options });
}

// ─── Réponses fetch factices ───────────────────────────────────────────────

/** Réponse JSON classique (res.ok, res.json()). */
export function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }): Response {
  const ok = init?.ok ?? true;
  const status = init?.status ?? (ok ? 200 : 500);
  return {
    ok,
    status,
    headers: new Headers(),
    json: async () => body,
    text: async () => JSON.stringify(body),
    blob: async () => new Blob([JSON.stringify(body)]),
  } as unknown as Response;
}

/**
 * Réponse SSE factice. `frames` est une liste de lignes déjà formatées
 * (ex: 'data: {"text":"a"}'). Chaque frame est émise comme un chunk séparé,
 * suivi de "\n\n", pour reproduire un flux Server-Sent Events réaliste.
 *
 * Le corps expose body.getReader() renvoyant des Uint8Array encodées, ce que
 * le code de production consomme via TextDecoder.
 */
export function sseResponse(frames: string[], init?: { ok?: boolean; status?: number }): Response {
  const ok = init?.ok ?? true;
  const status = init?.status ?? 200;
  const encoder = new TextEncoder();
  let i = 0;

  const reader = {
    read: async () => {
      if (i < frames.length) {
        const chunk = encoder.encode(frames[i] + '\n\n');
        i += 1;
        return { done: false, value: chunk };
      }
      return { done: true, value: undefined as unknown as Uint8Array };
    },
    releaseLock: () => {},
    cancel: async () => {},
  };

  return {
    ok,
    status,
    headers: new Headers(),
    body: { getReader: () => reader },
    json: async () => ({}),
  } as unknown as Response;
}

/** Raccourci : encode un objet en frame SSE "data: {json}". */
export function sseData(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}`;
}

// ─── Routeur de mock fetch ───────────────────────────────────────────────

type RouteHandler = (url: string, init?: RequestInit) => Response | Promise<Response>;

/**
 * Crée un stub de fetch qui choisit la réponse selon la première route dont
 * la sous-chaîne/regex correspond à l'URL. `fallback` sert pour toute URL non
 * explicitement routée (par défaut : {} JSON ok, utile pour les fetch de montage).
 *
 * Retourne le mock vitest pour pouvoir inspecter les appels (toHaveBeenCalled…).
 */
export function mockFetchRouter(
  routes: Array<{ match: string | RegExp; respond: RouteHandler }>,
  fallback?: RouteHandler,
) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    for (const route of routes) {
      const hit =
        typeof route.match === 'string' ? url.includes(route.match) : route.match.test(url);
      if (hit) return route.respond(url, init);
    }
    if (fallback) return fallback(url, init);
    return jsonResponse({});
  });

  // On remplace volontairement le fetch global dans les tests.
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
