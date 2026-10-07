/**
 * useChatGenerators — générateurs de chat hors file FIFO : Deep Dive, Comparer,
 * Insights. Extraits de useChatStream pour alléger le moteur.
 *
 * Les trois partagent l'état `loading` / `streamingText` / `deepDiveProgress`
 * et les setters de messages, fournis par le moteur. L'exclusion mutuelle via
 * `loading` (comportement d'origine) est préservée.
 */

import { useCallback } from 'react';
import { streamSSE } from '../api/sse.js';
import type { ChatStreamData, DeepDiveStreamData } from '../api/types.js';
import type { ChatMessage } from './types.js';
import { errorMessage, isAbortError } from '../utils.js';

interface UseChatGeneratorsOptions {
  notebookId: string;
  sources: { id: string; title: string }[];
  loading: boolean;
  setLoading: (v: boolean) => void;
  setStreamingText: (v: string) => void;
  setDeepDiveProgress: (v: string) => void;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

export function useChatGenerators({
  notebookId, sources, loading,
  setLoading, setStreamingText, setDeepDiveProgress, setMessages, inputRef,
  onSuccess, onError,
}: UseChatGeneratorsOptions) {
  const handleDeepDive = useCallback(async (question: string) => {
    const q = question.trim();
    if (!q || loading) return;

    if (inputRef.current) inputRef.current.style.height = 'auto';
    setLoading(true);
    setStreamingText('');
    setDeepDiveProgress('');

    const tempUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: `🔬 [Deep Dive] ${q}`,
      citations: [],
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      await streamSSE(`/api/notebooks/${notebookId}/chat/deep-dive`, {
        json: { question: q },
        onFrame: ({ data }) => {
          const parsed = data as DeepDiveStreamData;
          if (parsed.stage) {
            setDeepDiveProgress(parsed.content || parsed.stage);
          } else if (parsed.message) {
            setDeepDiveProgress('');
            setMessages(prev => [...prev, parsed.message!]);
            if (!document.hidden) {
              onSuccess('✓ Deep Dive terminé avec succès');
            }
          } else if (parsed.error) {
            throw new Error(parsed.error);
          }
        },
      });
    } catch (e: unknown) {
      const msg = errorMessage(e);
      if (!isAbortError(e)) {
        onError(msg);
      }
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `❌ Erreur Deep Dive: ${msg}`,
        citations: [],
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setLoading(false);
      setDeepDiveProgress('');
      inputRef.current?.focus();
    }
  }, [loading, notebookId, onError, onSuccess, setLoading, setStreamingText, setDeepDiveProgress, setMessages, inputRef]);

  const handleCompare = useCallback(async () => {
    if (loading || sources.length < 2) return;

    setLoading(true);
    setStreamingText('');

    const tempUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: `🔄 Comparer les sources : ${sources.map(s => `"${s.title}"`).join(", ")}`,
      citations: [],
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      let accumulated = "";

      await streamSSE(`/api/notebooks/${notebookId}/chat/compare`, {
        json: { sourceIds: sources.map(s => s.id) },
        onFrame: ({ data }) => {
          const parsed = data as ChatStreamData;
          if (parsed.text) {
            accumulated += parsed.text;
            setStreamingText(accumulated);
          } else if (parsed.message) {
            setStreamingText('');
            setMessages(prev => [...prev, parsed.message!]);
            if (!document.hidden) {
              onSuccess('✓ Comparaison terminée avec succès');
            }
          }
        },
      });
    } catch (e: unknown) {
      if (!isAbortError(e)) {
        onError(errorMessage(e));
      }
      setStreamingText('');
    } finally {
      setLoading(false);
      setStreamingText('');
    }
  }, [loading, notebookId, sources, onError, onSuccess, setLoading, setStreamingText, setMessages]);

  const handleInsights = useCallback(async () => {
    if (loading) return;

    setLoading(true);
    setStreamingText('');

    const tempUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: '💡 Extraction d\'insights — analyse approfondie des sources',
      citations: [],
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      let accumulated = "";

      await streamSSE(`/api/notebooks/${notebookId}/chat/insights`, {
        onFrame: ({ data }) => {
          const parsed = data as ChatStreamData;
          if (parsed.text) {
            accumulated += parsed.text;
            setStreamingText(accumulated);
          } else if (parsed.message) {
            setStreamingText('');
            setMessages(prev => [...prev, parsed.message!]);
            if (!document.hidden) {
              onSuccess('✓ Extraction d\'insights terminée avec succès');
            }
          }
        },
      });
    } catch (e: unknown) {
      if (!isAbortError(e)) {
        onError(errorMessage(e));
      }
      setStreamingText('');
    } finally {
      setLoading(false);
      setStreamingText('');
    }
  }, [loading, notebookId, onError, onSuccess, setLoading, setStreamingText, setMessages]);

  return { handleDeepDive, handleCompare, handleInsights };
}
