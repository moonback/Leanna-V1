/**
 * useBrowserProfiles — gestion de profils de navigation isolés.
 *
 * Chaque profil correspond à une « partition » de session Electron
 * (`persist:browser-<id>`) : cookies, cache et stockage local sont donc
 * cloisonnés d'un profil à l'autre. La liste des profils et le profil actif
 * sont persistés dans localStorage (même approche que l'historique).
 *
 * Important : l'attribut `partition` d'un <webview> Electron est immuable une
 * fois l'élément attaché. Changer de profil impose donc de remonter le
 * <webview> — ce que BrowserPanel fait via une `key` React dérivée de la
 * partition active.
 */

import { useCallback, useEffect, useState } from 'react';

export interface BrowserProfile {
  /** Identifiant stable (sert à construire la partition). */
  id: string;
  /** Nom affiché dans le sélecteur. */
  name: string;
  /** Partition de session Electron, ex. `persist:browser-default`. */
  partition: string;
  /** Timestamp (ms) de création. */
  createdAt: number;
}

const PROFILES_KEY = 'browser_profiles';
const ACTIVE_KEY = 'browser_active_profile';

const DEFAULT_PROFILE: BrowserProfile = {
  id: 'default',
  name: 'Profil par défaut',
  partition: 'persist:browser-default',
  createdAt: 0,
};

function partitionFor(id: string): string {
  return `persist:browser-${id}`;
}

function loadProfiles(): BrowserProfile[] {
  try {
    const saved = localStorage.getItem(PROFILES_KEY);
    if (!saved) return [DEFAULT_PROFILE];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed) || parsed.length === 0) return [DEFAULT_PROFILE];
    const valid = parsed.filter(
      (p): p is BrowserProfile =>
        p && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.partition === 'string',
    );
    if (valid.length === 0) return [DEFAULT_PROFILE];
    // Toujours garantir la présence du profil par défaut.
    if (!valid.some(p => p.id === 'default')) valid.unshift(DEFAULT_PROFILE);
    return valid;
  } catch {
    return [DEFAULT_PROFILE];
  }
}

function persist(profiles: BrowserProfile[], activeId: string) {
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
    localStorage.setItem(ACTIVE_KEY, activeId);
  } catch {
    // Stockage indisponible — on ignore.
  }
}

function loadActiveId(profiles: BrowserProfile[]): string {
  try {
    const saved = localStorage.getItem(ACTIVE_KEY);
    if (saved && profiles.some(p => p.id === saved)) return saved;
  } catch {
    /* noop */
  }
  return profiles[0]?.id ?? 'default';
}

export function useBrowserProfiles() {
  const [profiles, setProfiles] = useState<BrowserProfile[]>(() => loadProfiles());
  const [activeId, setActiveId] = useState<string>(() => loadActiveId(loadProfiles()));

  // Persister à chaque changement.
  useEffect(() => {
    persist(profiles, activeId);
  }, [profiles, activeId]);

  const activeProfile = profiles.find(p => p.id === activeId) ?? profiles[0] ?? DEFAULT_PROFILE;

  /** Crée un nouveau profil isolé et le retourne. */
  const createProfile = useCallback((name: string): BrowserProfile => {
    const trimmed = name.trim() || 'Nouveau profil';
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const profile: BrowserProfile = {
      id,
      name: trimmed,
      partition: partitionFor(id),
      createdAt: Date.now(),
    };
    setProfiles(prev => [...prev, profile]);
    return profile;
  }, []);

  /** Renomme un profil existant. */
  const renameProfile = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setProfiles(prev => prev.map(p => (p.id === id ? { ...p, name: trimmed } : p)));
  }, []);

  /**
   * Supprime un profil. Le profil par défaut ne peut pas être supprimé.
   * Si le profil actif est supprimé, on bascule sur le profil par défaut.
   */
  const deleteProfile = useCallback((id: string) => {
    if (id === 'default') return;
    setProfiles(prev => {
      const next = prev.filter(p => p.id !== id);
      return next.length ? next : [DEFAULT_PROFILE];
    });
    setActiveId(prev => (prev === id ? 'default' : prev));
  }, []);

  /** Active un profil (déclenche le remontage du webview côté BrowserPanel). */
  const switchProfile = useCallback((id: string) => {
    setActiveId(prev => {
      // Évite un remontage inutile si déjà actif.
      return prev === id ? prev : id;
    });
  }, []);

  return {
    profiles,
    activeProfile,
    createProfile,
    renameProfile,
    deleteProfile,
    switchProfile,
  };
}
