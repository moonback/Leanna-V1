import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TranscriptEntry } from './useTranscript.js';

const STORAGE_PREFIX = 'Leanna_chat_transcript';
const MAX_PERSISTED_MESSAGES = 200;

type PersistedTranscriptEntry = Omit<TranscriptEntry, 'timestamp'> & {
  timestamp: string;
};

function getStorageKey(sessionId: string): string {
  return `${STORAGE_PREFIX}:${sessionId}`;
}

/**
 * Remplace les images Markdown en data-URI (base64) par un placeholder léger
 * avant persistance. Une seule image encodée peut peser plusieurs centaines de
 * Ko et faire dépasser le quota localStorage, ce qui ferait échouer
 * l'enregistrement de toute la conversation.
 */
function stripInlineImages(text: string): string {
  return text.replace(
    /!\[([^\]]*)\]\(data:image\/[^)]+\)/g,
    (_match, alt) => `*[${alt || 'Image générée'}]*`,
  );
}

function parseTranscript(raw: string | null): TranscriptEntry[] {
  if (!raw) return [];
  const parsed = JSON.parse(raw) as PersistedTranscriptEntry[];
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter(entry =>
      entry &&
      (entry.role === 'user' || entry.role === 'assistant') &&
      typeof entry.id === 'string' &&
      typeof entry.text === 'string' &&
      typeof entry.timestamp === 'string'
    )
    .map(entry => ({
      ...entry,
      timestamp: new Date(entry.timestamp),
    }));
}

export function useChatPersistence(sessionId = 'default') {
  const [restored, setRestored] = useState(false);
  const [hasRestoredTranscript, setHasRestoredTranscript] = useState(false);
  const storageKey = useMemo(() => getStorageKey(sessionId), [sessionId]);

  const loadTranscript = useCallback(() => {
    if (typeof window === 'undefined') return [];
    try {
      const transcript = parseTranscript(window.localStorage.getItem(storageKey));
      setHasRestoredTranscript(transcript.length > 0);
      return transcript;
    } catch (error) {
      console.warn('[useChatPersistence] Failed to restore transcript:', error);
      setHasRestoredTranscript(false);
      return [];
    } finally {
      setRestored(true);
    }
  }, [storageKey]);

  const saveTranscript = useCallback((transcript: TranscriptEntry[]) => {
    if (typeof window === 'undefined') return;
    try {
      const persisted = transcript.slice(-MAX_PERSISTED_MESSAGES).map(entry => ({
        ...entry,
        // Les images inline en data-URI (générées par Leanna) sont trop
        // volumineuses pour localStorage et feraient échouer TOUT l'enregistrement
        // (dépassement de quota). On les remplace par un lien Markdown léger vers
        // le fichier sandbox ; l'image reste visible dans la session en cours.
        text: stripInlineImages(entry.text),
        timestamp: entry.timestamp.toISOString(),
      }));
      window.localStorage.setItem(storageKey, JSON.stringify(persisted));
    } catch (error) {
      console.warn('[useChatPersistence] Failed to persist transcript:', error);
    }
  }, [storageKey]);

  const clearPersistedTranscript = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(storageKey);
      setHasRestoredTranscript(false);
    } catch (error) {
      console.warn('[useChatPersistence] Failed to clear transcript:', error);
    }
  }, [storageKey]);

  useEffect(() => {
    setRestored(false);
    setHasRestoredTranscript(false);
  }, [storageKey]);

  return {
    restored,
    hasRestoredTranscript,
    storageKey,
    loadTranscript,
    saveTranscript,
    clearPersistedTranscript,
  };
}
