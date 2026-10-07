/**
 * useChatPersistence — persistance de l'état de génération du chat dans
 * localStorage, avec synchronisation inter-onglets (StorageEvent).
 *
 * Extrait de useChatStream pour alléger le moteur. Détient les initialiseurs
 * (load) et câble les trois effets (sauvegarde, nettoyage, écoute) sur les
 * atomes loading / streamingText / deepDiveProgress fournis par le moteur.
 */

import { useCallback, useEffect } from 'react';

export interface GenerationSnapshot {
  loading: boolean;
  streamingText: string;
  deepDiveProgress: string;
}

export function loadGenerationStateFor(key: string): GenerationSnapshot {
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      const state = JSON.parse(saved);
      if (state.timestamp && Date.now() - state.timestamp < 5 * 60 * 1000) {
        return state;
      }
    }
  } catch (e) {
    console.warn('[NotebookChat] Erreur chargement état génération:', e);
  }
  return { loading: false, streamingText: '', deepDiveProgress: '' };
}

interface UseChatPersistenceOptions {
  generationStateKey: string;
  loading: boolean;
  streamingText: string;
  deepDiveProgress: string;
  setLoading: (v: boolean) => void;
  setStreamingText: (v: string) => void;
  setDeepDiveProgress: (v: string) => void;
}

export function useChatPersistence({
  generationStateKey,
  loading, streamingText, deepDiveProgress,
  setLoading, setStreamingText, setDeepDiveProgress,
}: UseChatPersistenceOptions) {
  const saveGenerationState = useCallback((l: boolean, s: string, d: string) => {
    try {
      const payload = JSON.stringify({ loading: l, streamingText: s, deepDiveProgress: d, timestamp: Date.now() });
      localStorage.setItem(generationStateKey, payload);
      window.dispatchEvent(new StorageEvent('storage', {
        key: generationStateKey,
        newValue: payload,
        storageArea: localStorage,
      }));
    } catch (e) {
      console.warn('[NotebookChat] Erreur sauvegarde état génération:', e);
    }
  }, [generationStateKey]);

  // Persister à chaque changement
  useEffect(() => {
    saveGenerationState(loading, streamingText, deepDiveProgress);
  }, [loading, streamingText, deepDiveProgress, saveGenerationState]);

  // Nettoyer localStorage quand la génération est terminée
  useEffect(() => {
    if (!loading && !streamingText && !deepDiveProgress) {
      try {
        localStorage.removeItem(generationStateKey);
      } catch (e) {
        console.warn('[NotebookChat] Erreur suppression état génération:', e);
      }
    }
  }, [loading, streamingText, deepDiveProgress, generationStateKey]);

  // Synchroniser avec les autres onglets
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === generationStateKey && e.newValue) {
        try {
          const state = JSON.parse(e.newValue);
          if (state.timestamp && Date.now() - state.timestamp < 5 * 60 * 1000) {
            setLoading(state.loading || false);
            setStreamingText(state.streamingText || '');
            setDeepDiveProgress(state.deepDiveProgress || '');
          }
        } catch (err) {
          console.warn('[NotebookChat] Erreur parsing storage event:', err);
        }
      } else if (e.key === generationStateKey && !e.newValue) {
        setLoading(false);
        setStreamingText('');
        setDeepDiveProgress('');
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [generationStateKey, setLoading, setStreamingText, setDeepDiveProgress]);
}
