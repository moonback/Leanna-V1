/**
 * useGenerationQueue — moteur de génération de documents.
 *
 * Détient le « cluster génération » auparavant mêlé à GeneratePanel : la file
 * d'attente, les générations actives (jusqu'à MAX_PARALLEL_GENERATIONS en
 * parallèle), le streaming SSE par tâche, la progression, le document
 * sélectionné, et les actions associées (générer, régénérer, copier, exporter,
 * importer).
 *
 * La chaîne executeTask ↔ effet parallèle ↔ selectedDoc est conservée telle
 * quelle pour garantir un comportement identique (closures, timer de
 * progression basé sur le temps, retrait différé de la file).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, apiVoid } from '../api/client.js';
import { streamSSE } from '../api/sse.js';
import type { GenerateStreamData } from '../api/types.js';
import { getDocTypeLabel, MAX_PARALLEL_GENERATIONS } from './constants.js';
import type { GeneratedDoc, QueuedGeneration, SourceItem, DocRef } from './types.js';
import { errorMessage } from '../utils.js';

interface UseGenerationQueueOptions {
  notebookId: string;
  sources: SourceItem[];
  onRefresh: () => void;
  imageModel?: string;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
  fullView: boolean;
  initialDoc?: DocRef | null;
  selectedSourceIds: string[];
  customInstructions: string;
}

export function useGenerationQueue({
  notebookId,
  sources,
  onRefresh,
  imageModel,
  onSuccess,
  onError,
  fullView,
  initialDoc,
  selectedSourceIds,
  customInstructions,
}: UseGenerationQueueOptions) {
  const [generatedDocs, setGeneratedDocs] = useState<GeneratedDoc[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<GeneratedDoc | null>(null);
  const [copied, setCopied] = useState(false);

  const [generationQueue, setGenerationQueue] = useState<QueuedGeneration[]>([]);
  const [activeGenerationIds, setActiveGenerationIds] = useState<Set<string>>(new Set());
  const [streamingTexts, setStreamingTexts] = useState<Record<string, string>>({});
  const [generationProgresses, setGenerationProgresses] = useState<Record<string, number>>({});

  const contentRef = useRef<HTMLDivElement>(null);

  // Charger les docs générés
  useEffect(() => {
    (async () => {
      try {
        const data = await api<{ documents?: GeneratedDoc[] }>(
          `/api/notebooks/${notebookId}/generated`,
        );
        setGeneratedDocs(data.documents || []);
      } catch { /* ignore */ }
    })();
  }, [notebookId]);

  // Set initial doc when opened in fullView
  useEffect(() => {
    if (initialDoc && fullView) {
      setSelectedDoc(initialDoc as GeneratedDoc);
    }
  }, [initialDoc, fullView]);

  // Auto-scroll pendant le streaming
  useEffect(() => {
    const hasStreaming = Object.values(streamingTexts).some(text => text);
    if (hasStreaming && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [streamingTexts]);

  // Ajouter une génération à la file d'attente
  const addToQueue = useCallback((type: string, extraInstructions?: string) => {
    const newTask: QueuedGeneration = {
      id: `gen-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      sourceIds: selectedSourceIds.length > 0 ? selectedSourceIds : undefined,
      customInstructions: [customInstructions.trim(), extraInstructions?.trim()].filter(Boolean).join('\n') || undefined,
      title: getDocTypeLabel(type),
      progress: 0,
      status: 'pending',
      createdAt: Date.now(),
    };
    setGenerationQueue(prev => [...prev, newTask]);
    return newTask.id;
  }, [selectedSourceIds, customInstructions]);

  // Exécuter une tâche de génération individuelle
  const executeTask = useCallback(async (task: QueuedGeneration) => {
    setActiveGenerationIds(prev => new Set(prev).add(task.id));
    setStreamingTexts(prev => ({ ...prev, [task.id]: '' }));
    setGenerationProgresses(prev => ({ ...prev, [task.id]: 1 }));

    // Progression basée sur le temps en fallback : avance régulièrement vers 90%
    const startTime = Date.now();
    const ESTIMATED_MS = 30_000;
    const timerId: ReturnType<typeof setInterval> = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const timeProgress = Math.min(90, Math.round((elapsed / ESTIMATED_MS) * 100));
      setGenerationProgresses(prev => {
        const current = prev[task.id] ?? 0;
        if (timeProgress > current) {
          return { ...prev, [task.id]: timeProgress };
        }
        return prev;
      });
      setGenerationQueue(q => q.map(t =>
        t.id === task.id && timeProgress > (t.progress ?? 0)
          ? { ...t, progress: timeProgress }
          : t
      ));
    }, 500);

    setGenerationQueue(prev => prev.map(t =>
      t.id === task.id ? { ...t, status: 'generating', progress: 1 } : t
    ));

    if (selectedDoc) setSelectedDoc(null);

    try {
      let accumulated = "";
      const ESTIMATED_TOTAL_CHARS = 12_000;

      await streamSSE(`/api/notebooks/${notebookId}/generate/stream`, {
        json: {
          type: task.type,
          sourceIds: task.sourceIds,
          customInstructions: task.customInstructions,
          imageModel: imageModel || undefined,
        },
        onFrame: ({ data }) => {
          const parsed = data as GenerateStreamData;
          if (parsed.text) {
            accumulated += parsed.text;
            const progress = Math.min(95, Math.round((accumulated.length / ESTIMATED_TOTAL_CHARS) * 100));
            setGenerationProgresses(prev => ({ ...prev, [task.id]: progress }));
            setGenerationQueue(prev => prev.map(t =>
              t.id === task.id ? { ...t, progress } : t
            ));
            setStreamingTexts(prev => ({ ...prev, [task.id]: accumulated }));
          } else if (parsed.document) {
            const doc = parsed.document;
            setGenerationProgresses(prev => ({ ...prev, [task.id]: 100 }));
            setGenerationQueue(prev => prev.map(t =>
              t.id === task.id ? { ...t, progress: 100, status: 'completed' } : t
            ));
            setStreamingTexts(prev => ({ ...prev, [task.id]: '' }));
            setGeneratedDocs(prev => [doc, ...prev]);
            setSelectedDoc(doc);
            onSuccess(`"${doc.title}" généré`);
            onRefresh();
          } else if (parsed.error) {
            setGenerationQueue(prev => prev.map(t =>
              t.id === task.id ? { ...t, status: 'error', progress: 0 } : t
            ));
            throw new Error(parsed.error);
          }
        },
      });
    } catch (e: unknown) {
      setGenerationQueue(prev => prev.map(t =>
        t.id === task.id ? { ...t, status: 'error', progress: 0 } : t
      ));
      onError(errorMessage(e));
      setStreamingTexts(prev => ({ ...prev, [task.id]: '' }));
    } finally {
      clearInterval(timerId);
      setActiveGenerationIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(task.id);
        return newSet;
      });
      setGenerationProgresses(prev => ({ ...prev, [task.id]: 0 }));
      setStreamingTexts(prev => ({ ...prev, [task.id]: '' }));
      setTimeout(() => {
        setGenerationQueue(prev => prev.filter(t => t.id !== task.id));
      }, 1000);
    }
  }, [notebookId, imageModel, onSuccess, onError, onRefresh, selectedDoc]);

  // ── Générations déclenchées par l'assistant vocal ───────────────────────
  // L'assistant vocal du notebook lance des générations côté serveur (hors de
  // cette file). On reflète ces générations dans la barre de progression via
  // deux CustomEvents dispatchés par NotebookChat :
  //   notebook-voice-generation-start { notebookId, taskId, type }
  //   notebook-voice-generation-done  { notebookId, taskId, type, title, error? }
  // Une tâche « fantôme » (préfixe voice-) est insérée en statut 'generating'
  // avec une progression basée sur le temps, puis complétée/supprimée à la fin.
  useEffect(() => {
    const voiceTimers = new Map<string, ReturnType<typeof setInterval>>();

    const stopTimer = (taskId: string) => {
      const t = voiceTimers.get(taskId);
      if (t) { clearInterval(t); voiceTimers.delete(taskId); }
    };

    const onStart = (e: Event) => {
      const detail = (e as CustomEvent<{ notebookId?: string; taskId?: string; type?: string }>).detail;
      if (!detail || (detail.notebookId && detail.notebookId !== notebookId)) return;
      const taskId = detail.taskId || `voice-${Date.now()}`;
      const type = detail.type || 'summary';

      setGenerationQueue(prev => {
        if (prev.some(t => t.id === taskId)) return prev;
        return [...prev, {
          id: taskId,
          type,
          title: getDocTypeLabel(type),
          progress: 1,
          status: 'generating',
          createdAt: Date.now(),
        }];
      });
      setActiveGenerationIds(prev => new Set(prev).add(taskId));
      setGenerationProgresses(prev => ({ ...prev, [taskId]: 1 }));

      // Progression temporelle jusqu'à 90 % (la fin arrive sur l'event 'done').
      const startTime = Date.now();
      const ESTIMATED_MS = 25_000;
      const timerId = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const timeProgress = Math.min(90, Math.round((elapsed / ESTIMATED_MS) * 100));
        setGenerationProgresses(prev => {
          const current = prev[taskId] ?? 0;
          return timeProgress > current ? { ...prev, [taskId]: timeProgress } : prev;
        });
        setGenerationQueue(q => q.map(t =>
          t.id === taskId && timeProgress > (t.progress ?? 0) ? { ...t, progress: timeProgress } : t,
        ));
      }, 500);
      voiceTimers.set(taskId, timerId);
    };

    const onDone = (e: Event) => {
      const detail = (e as CustomEvent<{ notebookId?: string; taskId?: string; error?: string }>).detail;
      if (!detail || (detail.notebookId && detail.notebookId !== notebookId)) return;
      const taskId = detail.taskId || '';
      stopTimer(taskId);

      const failed = !!detail.error;
      setGenerationProgresses(prev => ({ ...prev, [taskId]: failed ? 0 : 100 }));
      setGenerationQueue(prev => prev.map(t =>
        t.id === taskId ? { ...t, progress: failed ? 0 : 100, status: failed ? 'error' : 'completed' } : t,
      ));
      setActiveGenerationIds(prev => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
      // Recharger la liste des docs générés pour refléter le nouveau document.
      if (!failed) {
        (async () => {
          try {
            const data = await api<{ documents?: GeneratedDoc[] }>(`/api/notebooks/${notebookId}/generated`);
            setGeneratedDocs(data.documents || []);
          } catch { /* ignore */ }
        })();
      }
      // Retrait différé de la file (comme pour les générations manuelles).
      setTimeout(() => {
        setGenerationQueue(prev => prev.filter(t => t.id !== taskId));
        setGenerationProgresses(prev => {
          const next = { ...prev };
          delete next[taskId];
          return next;
        });
      }, 1200);
    };

    window.addEventListener('notebook-voice-generation-start', onStart as EventListener);
    window.addEventListener('notebook-voice-generation-done', onDone as EventListener);
    return () => {
      window.removeEventListener('notebook-voice-generation-start', onStart as EventListener);
      window.removeEventListener('notebook-voice-generation-done', onDone as EventListener);
      voiceTimers.forEach(t => clearInterval(t));
      voiceTimers.clear();
    };
  }, [notebookId]);

  // Traitement de la file — jusqu'à MAX_PARALLEL_GENERATIONS tâches simultanées
  useEffect(() => {
    if (sources.length === 0 || generationQueue.length === 0) return;
    const pendingTasks = generationQueue.filter(
      t => t.status === 'pending' && !activeGenerationIds.has(t.id)
    );
    const availableSlots = MAX_PARALLEL_GENERATIONS - activeGenerationIds.size;
    if (pendingTasks.length > 0 && availableSlots > 0) {
      const tasksToStart = pendingTasks.slice(0, availableSlots);
      tasksToStart.forEach(task => { executeTask(task); });
    }
  }, [generationQueue, activeGenerationIds, sources.length, executeTask]);

  const handleGenerate = useCallback((type: string, extraInstructions?: string) => {
    if (sources.length === 0) {
      onError('Ajoutez des sources d\'abord.');
      return;
    }
    addToQueue(type, extraInstructions);
  }, [sources.length, onError, addToQueue]);

  const handleRegenerate = useCallback(async () => {
    if (!selectedDoc) return;
    try {
      await apiVoid(`/api/notebooks/${notebookId}/generated/${selectedDoc.id}`, { method: 'DELETE' });
      setGeneratedDocs(prev => prev.filter(d => d.id !== selectedDoc.id));
      onRefresh();
    } catch { /* ignore */ }
    setSelectedDoc(null);
    handleGenerate(selectedDoc.type);
  }, [selectedDoc, notebookId, handleGenerate, onRefresh]);

  const handleCopy = useCallback(async (content: string) => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const handleExportMd = useCallback((doc: GeneratedDoc) => {
    const blob = new Blob([doc.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.title.replace(/[^a-zA-Z0-9àáâãäéèêëïîôùûüÿç\s-]/g, '')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const handleImportToWorkspace = useCallback(async (doc: GeneratedDoc) => {
    const filename = doc.title
      .replace(/[^a-zA-Z0-9àáâãäéèêëïîôùûüÿç\s-]/g, '')
      .replace(/\s+/g, '-')
      .toLowerCase();
    const filePath = `docs/generated/${filename}.md`;

    try {
      const token = localStorage.getItem('Leanna_api_token');
      const res = await fetch('/api/ide/file', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'x-Leanna-token': token } : {}),
        },
        body: JSON.stringify({ path: filePath, content: doc.content }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: 'Erreur' }));
        throw new Error(d.error || `HTTP ${res.status}`);
      }

      onSuccess(`Importé dans le workspace : ${filePath}`);
    } catch (e: unknown) {
      onError(`Erreur import : ${errorMessage(e)}`);
    }
  }, [onSuccess, onError]);

  const retryTask = useCallback((taskId: string) => {
    setGenerationQueue(prev => prev.map(t =>
      t.id === taskId ? { ...t, status: 'pending', progress: 0 } : t
    ));
  }, []);

  const cancelTask = useCallback((taskId: string) => {
    setGenerationQueue(prev => prev.filter(t => t.id !== taskId));
  }, []);

  return {
    // état
    generatedDocs,
    selectedDoc, setSelectedDoc,
    copied,
    generationQueue,
    activeGenerationIds,
    streamingTexts,
    generationProgresses,
    contentRef,
    // actions
    handleGenerate,
    handleRegenerate,
    handleCopy,
    handleExportMd,
    handleImportToWorkspace,
    retryTask,
    cancelTask,
  };
}
