/**
 * useNotebookLive — second assistant vocal « live » dédié au Notebook Chat
 * (« Interrogez vos sources »).
 *
 * Session Gemini Live indépendante de l'assistant global (useLiveAPI) :
 *   - capture micro + lecture audio via le hook partagé useAudio ;
 *   - WebSocket dédié sur /notebook-live?notebookId=...&sources=... ;
 *   - transcription live (user_text / text) exposée pour affichage ;
 *   - citations des sources renvoyées par l'outil notebook_search.
 *
 * La session est strictement scopée au notebook actif : chaque réponse est
 * groundée par le serveur sur les sources via le moteur RAG.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAudio } from '../../../hooks/useAudio.js';
import type { Citation } from './types.js';

export type NotebookLiveStatus = 'idle' | 'connecting' | 'connected';

export interface NotebookLiveTranscriptEntry {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

interface GeneratedDocInfo {
  taskId?: string;
  id: string;
  type: string;
  title: string;
}

interface UseNotebookLiveOptions {
  notebookId: string;
  /** Sous-ensemble de sources à interroger (vide = toutes). */
  selectedSources?: string[];
  onError?: (message: string) => void;
  /** Appelé quand l'assistant démarre la génération d'un document. */
  onDocumentGenerating?: (info: { taskId?: string; type: string }) => void;
  /** Appelé quand l'assistant a généré un document (rafraîchir l'historique). */
  onDocumentGenerated?: (doc: GeneratedDocInfo) => void;
  /** Appelé si la génération d'un document échoue. */
  onDocumentGenerationError?: (info: { taskId?: string; type?: string; error: string }) => void;
}

export function useNotebookLive({
  notebookId,
  selectedSources = [],
  onError,
  onDocumentGenerating,
  onDocumentGenerated,
  onDocumentGenerationError,
}: UseNotebookLiveOptions) {
  const [status, setStatus] = useState<NotebookLiveStatus>('idle');
  const [busy, setBusy] = useState(false);
  const [transcript, setTranscript] = useState<NotebookLiveTranscriptEntry[]>([]);
  const [lastCitations, setLastCitations] = useState<Citation[]>([]);
  // Niveaux audio live (0–1) pour l'indicateur d'amplitude animé.
  const [levels, setLevels] = useState({ input: 0, output: 0 });

  const wsRef = useRef<WebSocket | null>(null);
  const intentionalCloseRef = useRef(false);
  // Dernière entrée par rôle, pour agréger les fragments de transcription en continu.
  const activeUserIdRef = useRef<string | null>(null);
  const activeAssistantIdRef = useRef<string | null>(null);
  const selectedSourcesRef = useRef<string[]>(selectedSources);
  selectedSourcesRef.current = selectedSources;

  const onErrorRef = useRef<typeof onError>(onError);
  onErrorRef.current = onError;
  const onDocGeneratingRef = useRef<typeof onDocumentGenerating>(onDocumentGenerating);
  onDocGeneratingRef.current = onDocumentGenerating;
  const onDocGeneratedRef = useRef<typeof onDocumentGenerated>(onDocumentGenerated);
  onDocGeneratedRef.current = onDocumentGenerated;
  const onDocGenErrorRef = useRef<typeof onDocumentGenerationError>(onDocumentGenerationError);
  onDocGenErrorRef.current = onDocumentGenerationError;

  // ── Audio micro + lecture (hook partagé) ─────────────────────────────────
  const handleAudioData = useCallback((pcm16: ArrayBuffer) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.send(pcm16); } catch { /* ignore */ }
    }
  }, []);

  const {
    muted,
    toggleMute,
    playAudioChunk,
    handleInterrupt,
    initAudio,
    cleanupAudio,
    getInputAmplitude,
    getOutputAmplitude,
  } = useAudio({ onAudioData: handleAudioData, vadEnabled: true });

  // ── Agrégation des fragments de transcription ────────────────────────────
  const appendTranscript = useCallback((role: 'user' | 'assistant', fragment: string) => {
    setTranscript(prev => {
      const activeRef = role === 'user' ? activeUserIdRef : activeAssistantIdRef;
      const otherRef = role === 'user' ? activeAssistantIdRef : activeUserIdRef;
      // Un nouveau tour de l'autre rôle clôt le tour courant.
      otherRef.current = null;

      if (activeRef.current) {
        return prev.map(e =>
          e.id === activeRef.current ? { ...e, text: e.text + fragment } : e,
        );
      }
      const id = `nbl-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      activeRef.current = id;
      return [...prev, { id, role, text: fragment }];
    });
  }, []);

  // ── Déconnexion ──────────────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    if (wsRef.current) {
      try { wsRef.current.close(); } catch { /* ignore */ }
      wsRef.current = null;
    }
    cleanupAudio();
    activeUserIdRef.current = null;
    activeAssistantIdRef.current = null;
    setBusy(false);
    setStatus('idle');
  }, [cleanupAudio]);

  // ── Connexion ──────────────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    if (status !== 'idle' || !notebookId) return;
    intentionalCloseRef.current = false;
    setStatus('connecting');
    setTranscript([]);
    setLastCitations([]);
    activeUserIdRef.current = null;
    activeAssistantIdRef.current = null;

    try {
      await initAudio();
    } catch {
      onErrorRef.current?.("Micro inaccessible — autorisez l'accès au microphone.");
      cleanupAudio();
      setStatus('idle');
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const params = new URLSearchParams({ notebookId });
    const sources = selectedSourcesRef.current;
    if (sources.length > 0) params.set('sources', sources.join(','));

    const ws = new WebSocket(`${protocol}//${window.location.host}/notebook-live?${params.toString()}`);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        playAudioChunk(event.data);
        return;
      }
      try {
        const msg = JSON.parse(event.data as string);
        if (msg.type === 'ready') return;
        if (typeof msg.user_text === 'string') appendTranscript('user', msg.user_text);
        if (typeof msg.text === 'string') appendTranscript('assistant', msg.text);
        if (msg.interrupted) {
          handleInterrupt();
          // La réponse courante est coupée : prochain fragment = nouveau tour.
          activeAssistantIdRef.current = null;
        }
        if (typeof msg.busy === 'boolean') setBusy(msg.busy);
        if (Array.isArray(msg.citations)) setLastCitations(msg.citations as Citation[]);
        if (typeof msg.error === 'string') onErrorRef.current?.(msg.error);
        // ── Génération automatique de documents par l'assistant ──────────
        if (msg.document_generating && typeof msg.document_generating.type === 'string') {
          onDocGeneratingRef.current?.({
            taskId: msg.document_generating.taskId,
            type: msg.document_generating.type,
          });
        }
        if (msg.document_generated && typeof msg.document_generated.id === 'string') {
          onDocGeneratedRef.current?.(msg.document_generated as GeneratedDocInfo);
        }
        if (msg.document_generation_error && typeof msg.document_generation_error.error === 'string') {
          onDocGenErrorRef.current?.({
            taskId: msg.document_generation_error.taskId,
            type: msg.document_generation_error.type,
            error: msg.document_generation_error.error,
          });
          onErrorRef.current?.(`Échec de la génération du document : ${msg.document_generation_error.error}`);
        }
      } catch {
        /* ignore JSON mal formé */
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      cleanupAudio();
      activeUserIdRef.current = null;
      activeAssistantIdRef.current = null;
      setBusy(false);
      setStatus('idle');
      if (!intentionalCloseRef.current) {
        onErrorRef.current?.('Connexion vocale interrompue.');
      }
      intentionalCloseRef.current = false;
    };

    ws.onerror = () => {
      onErrorRef.current?.("Erreur de l'assistant vocal du notebook.");
    };
  }, [status, notebookId, initAudio, cleanupAudio, playAudioChunk, handleInterrupt, appendTranscript]);

  const toggle = useCallback(() => {
    if (status === 'idle') void connect();
    else disconnect();
  }, [status, connect, disconnect]);

  // ── Envoi d'un message texte (fallback clavier) ──────────────────────────
  const sendText = useCallback((text: string) => {
    const t = text.trim();
    const ws = wsRef.current;
    if (!t || !ws || ws.readyState !== WebSocket.OPEN) return;
    try { ws.send(JSON.stringify({ text: t })); } catch { /* ignore */ }
    appendTranscript('user', t);
    activeUserIdRef.current = null; // message complet → clôturer le tour
  }, [appendTranscript]);

  // ── Nettoyage au démontage ───────────────────────────────────────────────
  useEffect(() => {
    return () => {
      intentionalCloseRef.current = true;
      if (wsRef.current) {
        try { wsRef.current.close(); } catch { /* ignore */ }
        wsRef.current = null;
      }
      cleanupAudio();
    };
  }, [cleanupAudio]);

  // Déconnecter proprement si l'on change de notebook en pleine session.
  useEffect(() => {
    if (status !== 'idle') disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notebookId]);

  // ── Polling des niveaux audio (RAF) pour l'indicateur d'amplitude ────────
  useEffect(() => {
    if (status !== 'connected') {
      setLevels({ input: 0, output: 0 });
      return;
    }
    let active = true;
    const tick = () => {
      if (!active) return;
      setLevels({
        input: getInputAmplitude ? getInputAmplitude() : 0,
        output: getOutputAmplitude ? getOutputAmplitude() : 0,
      });
      requestAnimationFrame(tick);
    };
    const frame = requestAnimationFrame(tick);
    return () => {
      active = false;
      cancelAnimationFrame(frame);
    };
  }, [status, getInputAmplitude, getOutputAmplitude]);

  // Niveaux normalisés + états dérivés (mêmes seuils que l'orbe global).
  const inputLevel = Math.min(1, Math.max(0, Number.isFinite(levels.input) ? levels.input : 0));
  const outputLevel = Math.min(1, Math.max(0, Number.isFinite(levels.output) ? levels.output : 0));
  const isSpeaking = status === 'connected' && outputLevel > 0.035;
  const isListening = status === 'connected' && !muted && !isSpeaking && inputLevel > 0.025;
  const amplitude = Math.max(inputLevel, outputLevel);

  return {
    status,
    connected: status === 'connected',
    connecting: status === 'connecting',
    busy,
    muted,
    toggleMute,
    transcript,
    lastCitations,
    connect,
    disconnect,
    toggle,
    sendText,
    getInputAmplitude,
    getOutputAmplitude,
    // Indicateur d'amplitude
    inputLevel,
    outputLevel,
    amplitude,
    isSpeaking,
    isListening,
  };
}
