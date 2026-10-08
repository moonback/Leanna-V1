/**
 * useChatLiveVoice — mode vocal (live) de l'assistante généraliste.
 *
 * Session Gemini Live indépendante, calquée sur useNotebookLive mais sans
 * notebook ni génération de documents : capture micro + lecture TTS via le
 * hook partagé useAudio, WebSocket dédié sur /chat-live-voice, transcription
 * live (user_text / text) exposée pour affichage dans la vue chat.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAudio } from '../hooks/useAudio.js';

export type ChatVoiceStatus = 'idle' | 'connecting' | 'connected';

export interface ChatVoiceTranscriptEntry {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

interface UseChatLiveVoiceOptions {
  onError?: (message: string) => void;
}

export function useChatLiveVoice({ onError }: UseChatLiveVoiceOptions = {}) {
  const [status, setStatus] = useState<ChatVoiceStatus>('idle');
  const [busy, setBusy] = useState(false);
  const [transcript, setTranscript] = useState<ChatVoiceTranscriptEntry[]>([]);
  const [levels, setLevels] = useState({ input: 0, output: 0 });

  const wsRef = useRef<WebSocket | null>(null);
  const intentionalCloseRef = useRef(false);
  const activeUserIdRef = useRef<string | null>(null);
  const activeAssistantIdRef = useRef<string | null>(null);

  const onErrorRef = useRef<typeof onError>(onError);
  onErrorRef.current = onError;

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
    setTranscript((prev) => {
      const activeRef = role === 'user' ? activeUserIdRef : activeAssistantIdRef;
      const otherRef = role === 'user' ? activeAssistantIdRef : activeUserIdRef;
      otherRef.current = null;

      if (activeRef.current) {
        return prev.map((e) => (e.id === activeRef.current ? { ...e, text: e.text + fragment } : e));
      }
      const id = `cv-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
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

  // ── Connexion ────────────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    if (status !== 'idle') return;
    intentionalCloseRef.current = false;
    setStatus('connecting');
    activeUserIdRef.current = null;
    activeAssistantIdRef.current = null;

    try {
      await initAudio();
    } catch {
      onErrorRef.current?.("Micro inaccessible — autorise l'accès au microphone.");
      cleanupAudio();
      setStatus('idle');
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/chat-live-voice`);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => setStatus('connected');

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
          activeAssistantIdRef.current = null;
        }
        if (typeof msg.busy === 'boolean') setBusy(msg.busy);
        if (typeof msg.error === 'string') onErrorRef.current?.(msg.error);
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
      onErrorRef.current?.("Erreur de l'assistant vocal.");
    };
  }, [status, initAudio, cleanupAudio, playAudioChunk, handleInterrupt, appendTranscript]);

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
    activeUserIdRef.current = null;
  }, [appendTranscript]);

  const clearTranscript = useCallback(() => {
    setTranscript([]);
    activeUserIdRef.current = null;
    activeAssistantIdRef.current = null;
  }, []);

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
    connect,
    disconnect,
    toggle,
    sendText,
    clearTranscript,
    inputLevel,
    outputLevel,
    amplitude,
    isSpeaking,
    isListening,
  };
}
