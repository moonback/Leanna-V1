/**
 * useBrowserHistory — persistance et interrogation de l'historique de
 * navigation du navigateur intégré.
 *
 * L'historique est conservé dans localStorage (même approche que les
 * commandes favorites du TerminalPanel) afin de survivre aux redémarrages.
 * Chaque entrée agrège une URL avec son titre, le nombre de visites et la
 * date de dernière visite — ce qui permet de classer les suggestions
 * d'autocomplétion par pertinence.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface BrowserHistoryEntry {
  /** URL complète normalisée */
  url: string;
  /** Dernier titre connu de la page (peut être vide) */
  title: string;
  /** Nombre de fois que l'URL a été visitée */
  visitCount: number;
  /** Timestamp (ms) de la dernière visite */
  lastVisited: number;
}

const STORAGE_KEY = 'browser_navigation_history';
/** Nombre maximum d'entrées conservées pour borner la taille du stockage. */
const MAX_ENTRIES = 500;
/** Nombre maximum de suggestions renvoyées à la barre d'adresse. */
const MAX_SUGGESTIONS = 8;

/** Les URL internes (pages d'accueil, blank) ne polluent pas l'historique. */
function isTrackableUrl(url: string): boolean {
  if (!url) return false;
  if (url === 'about:blank') return false;
  return /^https?:\/\//i.test(url);
}

function loadHistory(): BrowserHistoryEntry[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is BrowserHistoryEntry =>
        e && typeof e.url === 'string' && typeof e.visitCount === 'number',
    );
  } catch {
    return [];
  }
}

function persistHistory(entries: BrowserHistoryEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Quota dépassé ou stockage indisponible — on ignore silencieusement.
  }
}

export function useBrowserHistory() {
  const [history, setHistory] = useState<BrowserHistoryEntry[]>(() => loadHistory());

  // Garder une référence courante pour éviter des closures périmées dans
  // les callbacks mémoïsés (recordVisit est appelé depuis des listeners).
  const historyRef = useRef(history);
  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  /** Enregistre (ou met à jour) une visite dans l'historique. */
  const recordVisit = useCallback((url: string, title = '') => {
    if (!isTrackableUrl(url)) return;

    setHistory(prev => {
      const now = Date.now();
      const existingIndex = prev.findIndex(e => e.url === url);
      let next: BrowserHistoryEntry[];

      if (existingIndex >= 0) {
        const existing = prev[existingIndex];
        const updated: BrowserHistoryEntry = {
          ...existing,
          title: title || existing.title,
          visitCount: existing.visitCount + 1,
          lastVisited: now,
        };
        next = [...prev];
        next[existingIndex] = updated;
      } else {
        next = [{ url, title, visitCount: 1, lastVisited: now }, ...prev];
      }

      // Trier par récence puis borner la taille.
      next.sort((a, b) => b.lastVisited - a.lastVisited);
      if (next.length > MAX_ENTRIES) next = next.slice(0, MAX_ENTRIES);

      persistHistory(next);
      return next;
    });
  }, []);

  /** Met à jour le titre d'une URL déjà présente (sans créer de visite). */
  const updateTitle = useCallback((url: string, title: string) => {
    if (!isTrackableUrl(url) || !title) return;
    setHistory(prev => {
      const index = prev.findIndex(e => e.url === url);
      if (index < 0 || prev[index].title === title) return prev;
      const next = [...prev];
      next[index] = { ...next[index], title };
      persistHistory(next);
      return next;
    });
  }, []);

  /**
   * Renvoie les suggestions d'autocomplétion pour une saisie donnée.
   * Classement : correspondances en préfixe d'abord, puis par score
   * combinant fréquence de visite et récence.
   */
  const getSuggestions = useCallback((query: string): BrowserHistoryEntry[] => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const all = historyRef.current;

    const matches = all.filter(e => {
      const url = e.url.toLowerCase();
      const title = e.title.toLowerCase();
      return url.includes(q) || title.includes(q);
    });

    const score = (e: BrowserHistoryEntry): number => {
      const url = e.url.toLowerCase();
      // Un préfixe (hors protocole) est fortement privilégié.
      const stripped = url.replace(/^https?:\/\/(www\.)?/, '');
      const prefixBonus = stripped.startsWith(q) || url.startsWith(q) ? 1000 : 0;
      const recencyDays = (Date.now() - e.lastVisited) / 86_400_000;
      const recencyBonus = Math.max(0, 30 - recencyDays);
      return prefixBonus + e.visitCount * 5 + recencyBonus;
    };

    return matches
      .sort((a, b) => score(b) - score(a))
      .slice(0, MAX_SUGGESTIONS);
  }, []);

  /** Efface l'intégralité de l'historique de navigation. */
  const clearHistory = useCallback(() => {
    setHistory([]);
    persistHistory([]);
  }, []);

  return { history, recordVisit, updateTitle, getSuggestions, clearHistory };
}
