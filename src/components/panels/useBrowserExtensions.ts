/**
 * useBrowserExtensions — gestion des extensions Chromium du navigateur intégré,
 * côté renderer.
 *
 * Les opérations réelles (charger / lister / retirer) ont lieu dans le process
 * principal Electron via `window.electronAPI`. Hors Electron (mode dev web),
 * le hook se comporte en no-op : `supported` vaut false et la liste reste vide.
 *
 * Les extensions sont rattachées à la *partition* de session du profil actif,
 * ce qui respecte l'isolation inter-profils.
 */

import { useCallback, useEffect, useState } from 'react';
import type { BrowserExtensionInfo } from '../../types/electron.js';

interface UseBrowserExtensionsResult {
  /** true si l'API Electron des extensions est disponible. */
  supported: boolean;
  /** Extensions actuellement chargées pour la partition. */
  extensions: BrowserExtensionInfo[];
  /** Chargement/opération en cours. */
  loading: boolean;
  /** Dernière erreur rencontrée (ou null). */
  error: string | null;
  /** Recharge la liste depuis le process principal. */
  refresh: () => Promise<void>;
  /** Charge une extension décompressée (ouvre un sélecteur de dossier). */
  loadExtension: () => Promise<void>;
  /** Retire une extension par identifiant. */
  removeExtension: (id: string) => Promise<void>;
}

export function useBrowserExtensions(partition: string): UseBrowserExtensionsResult {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
  const supported = Boolean(
    api?.browserExtensionsList && api?.browserExtensionsLoad && api?.browserExtensionsRemove,
  );

  const [extensions, setExtensions] = useState<BrowserExtensionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!supported || !api?.browserExtensionsList) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.browserExtensionsList(partition);
      if (res.success) {
        setExtensions(res.extensions ?? []);
      } else {
        setError(res.error ?? 'Impossible de lister les extensions.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inattendue.');
    } finally {
      setLoading(false);
    }
  }, [supported, api, partition]);

  // Charger la liste à chaque changement de partition (profil).
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loadExtension = useCallback(async () => {
    if (!supported || !api?.browserExtensionsLoad) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.browserExtensionsLoad(partition);
      if (res.canceled) return;
      if (!res.success) {
        setError(res.error ?? 'Chargement de l\'extension échoué.');
        return;
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inattendue.');
    } finally {
      setLoading(false);
    }
  }, [supported, api, partition, refresh]);

  const removeExtension = useCallback(
    async (id: string) => {
      if (!supported || !api?.browserExtensionsRemove) return;
      setLoading(true);
      setError(null);
      try {
        const res = await api.browserExtensionsRemove(partition, id);
        if (!res.success) {
          setError(res.error ?? 'Suppression de l\'extension échouée.');
          return;
        }
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erreur inattendue.');
      } finally {
        setLoading(false);
      }
    },
    [supported, api, partition, refresh],
  );

  return { supported, extensions, loading, error, refresh, loadExtension, removeExtension };
}
