/**
 * useChatStream — moteur de conversation du NotebookChat (messages, streaming,
 * file FIFO, édition/retry, feedback, citations, export, persistance).
 * Comportement identique à l'implémentation d'origine (FIFO + setTimeout 50).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, apiVoid } from '../api/client.js';
import { streamSSE } from '../api/sse.js';
import type { ChatStreamData } from '../api/types.js';
import type { Citation, ChatMessage, SandboxFolder, QueuedChatRequest } from './types.js';
import { errorMessage } from '../utils.js';
import { loadGenerationStateFor, useChatPersistence } from './useChatPersistence.js';
import { useChatGenerators } from './useChatGenerators.js';

interface UseChatStreamOptions {
  notebookId: string;
  sources: { id: string; title: string }[];
  onRefresh?: () => void;
  selectedSources: string[];
  personality: string;
  activeThreadId: string | null;
  setFollowUps: (v: string[]) => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

export function useChatStream({
  notebookId,
  sources,
  onRefresh,
  selectedSources,
  personality,
  activeThreadId,
  setFollowUps,
  onSuccess,
  onError,
}: UseChatStreamOptions) {
  const generationStateKey = `notebook-chat-generation-${notebookId}`;
  const initial = loadGenerationStateFor(generationStateKey);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // Miroir de `messages` pour que les handlers (retry/edit/saveToNote) le lisent
  // sans l'avoir en dépendance : ils restent ainsi référentiellement stables
  // (le memo de MessageItem n'est plus invalidé à chaque nouveau message).
  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;
  const [loading, setLoading] = useState(initial.loading);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [streamingText, setStreamingText] = useState(initial.streamingText);
  const [deepDiveProgress, setDeepDiveProgress] = useState(initial.deepDiveProgress);
  const [queuedCount, setQueuedCount] = useState(0);

  const [hoveredCitation, setHoveredCitation] = useState<{ citation: Citation; fullContent: string; x: number; y: number } | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [feedbackMap, setFeedbackMap] = useState<Record<string, 'up' | 'down'>>({});

  const abortRef = useRef<AbortController | null>(null);
  const chunkCache = useRef<Map<string, string>>(new Map());
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const requestQueueRef = useRef<QueuedChatRequest[]>([]);
  const processingQueueRef = useRef(false);

  // ─── Persistance localStorage (synchro inter-onglets) ──────────────────────
  useChatPersistence({
    generationStateKey,
    loading, streamingText, deepDiveProgress,
    setLoading, setStreamingText, setDeepDiveProgress,
  });

  // ─── Historique du thread actif ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoadingHistory(true);

    (async () => {
      try {
        const threadParam = activeThreadId ? `?threadId=${activeThreadId}` : '';
        const data = await api<{ messages?: ChatMessage[] }>(
          `/api/notebooks/${notebookId}/chat/history${threadParam}`,
        );
        if (!cancelled) setMessages(data.messages || []);
      } catch { /* ignore */ }
      if (!cancelled) setLoadingHistory(false);
    })();

    return () => { cancelled = true; };
  }, [notebookId, activeThreadId]);

  // ─── Copy / édition / feedback ─────────────────────────────────────────────
  const handleCopy = useCallback(async (msgId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMsgId(msgId);
      setTimeout(() => setCopiedMsgId(null), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedMsgId(msgId);
      setTimeout(() => setCopiedMsgId(null), 2000);
    }
  }, []);

  const handleEditStart = useCallback((msgId: string, content: string) => {
    setEditingMsgId(msgId);
    setEditingContent(content);
  }, []);

  const handleEditCancel = useCallback(() => {
    setEditingMsgId(null);
    setEditingContent('');
  }, []);

  const handleStopStreaming = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (streamingText) {
      setMessages(prev => [...prev, {
        id: `partial-${Date.now()}`,
        role: 'assistant',
        content: streamingText + '\n\n*(réponse interrompue)*',
        citations: [],
        timestamp: new Date().toISOString(),
      }]);
      setStreamingText('');
    }
    setDeepDiveProgress('');
  }, [streamingText]);

  const handleFeedback = useCallback(async (msgId: string, type: 'up' | 'down') => {
    const current = feedbackMap[msgId];
    const newType = current === type ? undefined : type;

    setFeedbackMap(prev => {
      const next = { ...prev };
      if (newType) next[msgId] = newType;
      else delete next[msgId];
      return next;
    });

    try {
      await apiVoid(`/api/notebooks/${notebookId}/chat/feedback`, {
        method: 'POST',
        json: { messageId: msgId, feedback: newType || null },
      });
    } catch { /* silent */ }
  }, [feedbackMap, notebookId]);

  // ─── Moteur FIFO ───────────────────────────────────────────────────────────
  const processChatQueue = useCallback(async () => {
    if (processingQueueRef.current) return;

    processingQueueRef.current = true;
    setLoading(true);

    try {
      while (requestQueueRef.current.length > 0) {
        const request = requestQueueRef.current.shift()!;
        setQueuedCount(requestQueueRef.current.length);
        setStreamingText('');

        try {
          abortRef.current = new AbortController();

          let accumulated = '';

          await streamSSE(`/api/notebooks/${notebookId}/chat/stream`, {
            signal: abortRef.current.signal,
            json: {
              question: request.question,
              sourceIds: request.sourceIds,
              personality: request.personality,
              threadId: request.threadId,
            },
            onFrame: ({ data }) => {
              const parsed = data as ChatStreamData;
              if (parsed.text) {
                accumulated += parsed.text;
                setStreamingText(accumulated);
              } else if (parsed.message) {
                setStreamingText('');
                setMessages(prev => [...prev, parsed.message!]);

                if (!document.hidden) {
                  onSuccess('✓ Réponse générée avec succès');
                }
              } else if (parsed.error) {
                throw new Error(parsed.error);
              }
            },
          });
        } catch (e: unknown) {
          if (e instanceof DOMException && e.name === 'AbortError') {
            continue;
          }

          const message = e instanceof Error ? e.message : 'Erreur inconnue';
          onError(message);
          setStreamingText('');
          setMessages(prev => [...prev, {
            id: `error-${Date.now()}`,
            role: 'assistant',
            content: `❌ Erreur: ${message}`,
            citations: [],
            timestamp: new Date().toISOString(),
          }]);
        } finally {
          abortRef.current = null;
          setStreamingText('');
        }
      }
    } finally {
      processingQueueRef.current = false;
      setQueuedCount(requestQueueRef.current.length);
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [notebookId, onError, onSuccess]);

  const handleSend = useCallback((question: string) => {
    const q = (question ?? '').trim();
    if (!q) return;

    if (inputRef.current) inputRef.current.style.height = 'auto';

    const request: QueuedChatRequest = {
      id: `request-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      question: q,
      sourceIds: selectedSources.length > 0 ? [...selectedSources] : undefined,
      personality: personality !== 'default' ? personality : undefined,
      threadId: activeThreadId || undefined,
    };

    const tempUserMsg: ChatMessage = {
      id: `temp-${request.id}`,
      role: 'user',
      content: q,
      citations: [],
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, tempUserMsg]);
    requestQueueRef.current.push(request);
    setQueuedCount(requestQueueRef.current.length);

    void processChatQueue();
  }, [selectedSources, personality, activeThreadId, processChatQueue]);

  const handleRetry = useCallback(async (msgId: string) => {
    const current = messagesRef.current;
    const msgIndex = current.findIndex(m => m.id === msgId);
    if (msgIndex < 1) return;

    const userMsg = current[msgIndex - 1];
    if (userMsg.role !== 'user') return;

    setMessages(prev => prev.filter((_, i) => i !== msgIndex));
    setTimeout(() => handleSend(userMsg.content), 50);
  }, [handleSend]);

  const handleEditSubmit = useCallback((msgId: string) => {
    const newContent = editingContent.trim();
    if (!newContent) return;

    const msgIndex = messagesRef.current.findIndex(m => m.id === msgId);
    if (msgIndex < 0) return;

    setMessages(prev => prev.slice(0, msgIndex));
    setEditingMsgId(null);
    setEditingContent('');
    setTimeout(() => handleSend(newContent), 50);
  }, [editingContent, handleSend]);

  // ─── Deep Dive / Compare / Insights (hook dédié) ──────────────────────────
  const { handleDeepDive, handleCompare, handleInsights } = useChatGenerators({
    notebookId, sources, loading,
    setLoading, setStreamingText, setDeepDiveProgress, setMessages, inputRef,
    onSuccess, onError,
  });

  const handleClear = useCallback(async () => {
    try {
      await apiVoid(`/api/notebooks/${notebookId}/chat/history`, { method: 'DELETE' });
      setMessages([]);
      setFollowUps([]);
    } catch { /* ignore */ }
  }, [notebookId, setFollowUps]);

  // ─── Export / Save to note / Citation fetch ───────────────────────────────
  const handleExport = useCallback(async () => {
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/chat/export?format=markdown`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: 'Erreur' }));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] || 'chat-export.md';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      onError(errorMessage(e));
    }
  }, [notebookId, onError]);

  const handleSaveToNote = useCallback(async (msg: ChatMessage) => {
    const current = messagesRef.current;
    const msgIndex = current.findIndex(m => m.id === msg.id);
    const userMsg = msgIndex > 0 ? current[msgIndex - 1] : null;
    const title = userMsg?.role === 'user'
      ? userMsg.content.slice(0, 80).replace(/[\n\r]/g, ' ')
      : `Note du chat — ${new Date(msg.timestamp).toLocaleDateString('fr')}`;

    try {
      await apiVoid(`/api/notebooks/${notebookId}/notes`, {
        method: 'POST',
        json: { title, content: msg.content },
      });
      onSuccess('Sauvegardé dans les notes');
      onRefresh?.();
    } catch (e: unknown) {
      onError(`Erreur : ${errorMessage(e)}`);
    }
  }, [notebookId, onRefresh, onError, onSuccess]);

  const fetchCitationChunk = useCallback(async (citation: Citation, x: number, y: number) => {
    const cached = chunkCache.current.get(citation.chunkId);
    if (cached) {
      setHoveredCitation({ citation, fullContent: cached, x, y });
      return;
    }
    try {
      const data = await api<{ chunk?: { content?: string } }>(
        `/api/notebooks/${notebookId}/chat/chunk/${citation.chunkId}`,
      );
      const content = data.chunk?.content || citation.excerpt;
      chunkCache.current.set(citation.chunkId, content);
      setHoveredCitation({ citation, fullContent: content, x, y });
    } catch { /* ignore */ }
  }, [notebookId]);

  const openFolderPickerData = useCallback(async (): Promise<SandboxFolder[]> => {
    try {
      const data = await api<{ folders?: SandboxFolder[] }>('/api/notebooks/sandbox/folders');
      return data.folders || [];
    } catch {
      return [];
    }
  }, []);

  const saveMessageMarkdown = useCallback(async (messageId: string, folder: string | undefined): Promise<string> => {
    const data = await api<{ filePath: string }>(
      `/api/notebooks/${notebookId}/chat/save-message`,
      { method: 'POST', json: { messageId, folder: folder || undefined } },
    );
    return data.filePath;
  }, [notebookId]);

  return {
    // état
    messages, setMessages,
    loading,
    loadingHistory,
    streamingText, setStreamingText,
    deepDiveProgress,
    queuedCount,
    hoveredCitation, setHoveredCitation,
    copiedMsgId,
    editingMsgId,
    editingContent, setEditingContent,
    feedbackMap,
    inputRef,
    // actions
    handleSend,
    handleRetry,
    handleEditStart,
    handleEditCancel,
    handleEditSubmit,
    handleDeepDive,
    handleCompare,
    handleInsights,
    handleClear,
    handleStopStreaming,
    handleCopy,
    handleFeedback,
    handleExport,
    handleSaveToNote,
    fetchCitationChunk,
    openFolderPickerData,
    saveMessageMarkdown,
  };
}
