/**
 * useResource — petit hook de lecture de données (GET) basé sur le client API.
 *
 * Alternative légère et sans dépendance à TanStack Query : il couvre le besoin
 * récurrent du module (charger une ressource, exposer loading/error, et pouvoir
 * la recharger) afin de réduire les cascades de `onRefresh` manuelles, sans
 * introduire de cache global ni de provider.
 *
 * Fonctionnalités :
 *  - chargement initial automatique (sauf si `enabled` est false) ;
 *  - `loading` / `error` / `data` ;
 *  - `refetch()` manuel ;
 *  - annulation via AbortController au démontage et entre deux requêtes ;
 *  - re-chargement quand `path` ou une clé de `deps` change.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './client.js';

export interface UseResourceOptions<T> {
  /** Désactive le chargement (ex. identifiant manquant). Défaut : true. */
  enabled?: boolean;
  /** Valeur de `data` avant le premier chargement réussi. */
  initialData?: T;
  /** Dépendances supplémentaires qui déclenchent un rechargement. */
  deps?: ReadonlyArray<unknown>;
}

export interface UseResourceResult<T> {
  data: T | undefined;
  loading: boolean;
  error: ApiError | Error | null;
  /** Relance la requête. Résout avec les données ou undefined en cas d'erreur. */
  refetch: () => Promise<T | undefined>;
  /** Remplace les données en mémoire (mise à jour optimiste locale). */
  setData: (updater: T | ((prev: T | undefined) => T)) => void;
}

export function useResource<T>(
  path: string,
  options: UseResourceOptions<T> = {},
): UseResourceResult<T> {
  const { enabled = true, initialData, deps = [] } = options;

  const [data, setDataState] = useState<T | undefined>(initialData);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<ApiError | Error | null>(null);

  // Permet d'ignorer les réponses d'une requête obsolète (course entre refetch).
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (): Promise<T | undefined> => {
    if (!enabled) return undefined;

    // Annule une éventuelle requête précédente encore en vol.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const result = await api<T>(path, { signal: controller.signal });
      if (!controller.signal.aborted) {
        setDataState(result);
        return result;
      }
      return undefined;
    } catch (e) {
      // Une annulation n'est pas une erreur à exposer.
      if (controller.signal.aborted) return undefined;
      setError(e instanceof Error ? e : new Error(String(e)));
      return undefined;
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
    // path + deps pilotent le rechargement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, enabled, ...deps]);

  useEffect(() => {
    void run();
    return () => abortRef.current?.abort();
  }, [run]);

  const setData = useCallback((updater: T | ((prev: T | undefined) => T)) => {
    setDataState((prev) =>
      typeof updater === 'function'
        ? (updater as (p: T | undefined) => T)(prev)
        : updater,
    );
  }, []);

  return { data, loading, error, refetch: run, setData };
}
