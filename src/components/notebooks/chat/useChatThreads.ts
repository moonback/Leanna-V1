/**
 * useChatThreads — gestion des fils de discussion du chat.
 * Détient la liste des threads, le thread actif et son UI, charge la liste au
 * montage, et expose les actions nouveau/changer/supprimer.
 *
 * Reçoit les setters du stream (messages, streaming, follow-ups) car changer ou
 * supprimer un thread réinitialise la conversation affichée.
 */

import { useCallback, useEffect, useState } from 'react';
import { api, apiVoid } from '../api/client.js';
import type { ChatThread } from '../api/types.js';
import type { ChatMessage, ChatThreadSummary } from './types.js';

interface UseChatThreadsOptions {
  notebookId: string;
  activeThreadId: string | null;
  setActiveThreadId: (v: string | null) => void;
  setMessages: (v: ChatMessage[]) => void;
  setStreamingText: (v: string) => void;
  setFollowUps: (v: string[]) => void;
}

export function useChatThreads({
  notebookId, activeThreadId, setActiveThreadId,
  setMessages, setStreamingText, setFollowUps,
}: UseChatThreadsOptions) {
  const [threads, setThreads] = useState<ChatThreadSummary[]>([]);
  const [showThreadList, setShowThreadList] = useState(false);

  // Charger la liste des threads (une seule fois)
  useEffect(() => {
    (async () => {
      try {
        const data = await api<{ threads?: ChatThread[] }>(
          `/api/notebooks/${notebookId}/chat/threads`,
        );
        setThreads(data.threads || []);
      } catch { /* ignore */ }
    })();
  }, [notebookId]);

  const handleNewThread = useCallback(async () => {
    try {
      const data = await api<{ thread: ChatThread }>(
        `/api/notebooks/${notebookId}/chat/threads`,
        { method: 'POST', json: { title: `Conversation ${threads.length + 1}` } },
      );
      setThreads(prev => [data.thread, ...prev]);
      setActiveThreadId(data.thread.id);
      setMessages([]);
      setFollowUps([]);
    } catch { /* ignore */ }
  }, [notebookId, threads.length, setActiveThreadId, setMessages, setFollowUps]);

  const handleSwitchThread = useCallback((threadId: string | null) => {
    if (threadId === activeThreadId) {
      setShowThreadList(false);
      return;
    }
    setActiveThreadId(threadId);
    setShowThreadList(false);
    setFollowUps([]);
    setStreamingText('');
  }, [activeThreadId, setActiveThreadId, setFollowUps, setStreamingText]);

  const handleDeleteThread = useCallback(async (threadId: string) => {
    try {
      await apiVoid(`/api/notebooks/${notebookId}/chat/threads/${threadId}`, { method: 'DELETE' });
      setThreads(prev => prev.filter(t => t.id !== threadId));
      if (activeThreadId === threadId) {
        const remaining = threads.filter(t => t.id !== threadId);
        if (remaining.length > 0) {
          setActiveThreadId(remaining[0].id);
        } else {
          setActiveThreadId(null);
          setMessages([]);
        }
      }
    } catch { /* ignore */ }
  }, [notebookId, activeThreadId, threads, setActiveThreadId, setMessages]);

  return {
    threads,
    showThreadList, setShowThreadList,
    handleNewThread,
    handleSwitchThread,
    handleDeleteThread,
  };
}
