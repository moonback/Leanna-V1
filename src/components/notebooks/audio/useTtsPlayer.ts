/**
 * useTtsPlayer — lecture TTS en streaming d'un Audio Overview.
 *
 * Encapsule toute la logique de lecture (Web Audio + flux SSE) auparavant
 * mêlée à AudioOverviewPanel : les refs stables (AudioContext, AbortController,
 * curseur de planification, miroir synchrone de l'état « en lecture »), l'état
 * exposé à l'UI, et le nettoyage au démontage.
 *
 * Le comportement est volontairement identique à l'implémentation d'origine :
 *  - planification « gapless » des chunks via nextStartTimeRef ;
 *  - la vitesse ne s'applique qu'aux chunks planifiés APRÈS son changement ;
 *  - playingRef permet à la closure onFrame de lire l'état de lecture à jour.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { streamSSE } from '../api/sse.js';
import type { TtsStreamData } from '../api/types.js';
import type { AudioOverview } from './types.js';

export interface UseTtsPlayerOptions {
  notebookId: string;
  /** Overview sélectionné (fournit l'id du flux à lire). */
  selectedOverview: AudioOverview | null;
  /** Remonte les erreurs non liées à une annulation (pour un toast). */
  onError?: (message: string) => void;
}

export interface TtsPlayerState {
  playing: boolean;
  ttsLoading: boolean;
  currentLineIndex: number;
  ttsProgress: number;
  ttsTotalLines: number;
  playbackSpeed: number;
  playTTS: () => Promise<void>;
  stopTTS: () => void;
  cycleSpeed: () => void;
}

export function useTtsPlayer({
  notebookId,
  selectedOverview,
  onError,
}: UseTtsPlayerOptions): TtsPlayerState {
  const [playing, setPlaying] = useState(false);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [currentLineIndex, setCurrentLineIndex] = useState(-1);
  const [ttsProgress, setTtsProgress] = useState(0);
  const [ttsTotalLines, setTtsTotalLines] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const abortControllerRef = useRef<AbortController | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const playingRef = useRef(false);
  const nextStartTimeRef = useRef(0);

  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new AC({ sampleRate: 24000 });
    }
    return audioCtxRef.current;
  }, []);

  const playAudioChunk = useCallback((base64Audio: string) => {
    const audioCtx = getAudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    try {
      const binaryStr = atob(base64Audio);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

      const pcm16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) float32[i] = pcm16[i] / 32768.0;

      const audioBuffer = audioCtx.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);

      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.playbackRate.value = playbackSpeed;
      source.connect(audioCtx.destination);

      const now = audioCtx.currentTime;
      const startTime = Math.max(now, nextStartTimeRef.current);
      source.start(startTime);
      nextStartTimeRef.current = startTime + (audioBuffer.duration / playbackSpeed);
    } catch (err) {
      console.error('[TTS] Erreur lecture audio:', err);
    }
  }, [getAudioContext, playbackSpeed]);

  const playTTS = useCallback(async () => {
    if (!selectedOverview) return;

    setTtsLoading(true);
    setPlaying(true);
    playingRef.current = true;
    setCurrentLineIndex(0);
    setTtsProgress(0);
    nextStartTimeRef.current = 0;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      await streamSSE(
        `/api/notebooks/${notebookId}/audio-overviews/${selectedOverview.id}/tts`,
        {
          signal: controller.signal,
          json: {},
          onFrame: ({ event, data }) => {
            // On cesse de traiter les frames si la lecture a été stoppée.
            if (!playingRef.current) return;
            const parsed = data as TtsStreamData;
            if (event === 'start') {
              setTtsTotalLines(parsed.total ?? 0);
              setTtsLoading(false);
            } else if (event === 'chunk') {
              setCurrentLineIndex(parsed.index ?? 0);
              setTtsProgress(prev => prev + 1);
              if (parsed.audio) playAudioChunk(parsed.audio);
            } else if (event === 'done') {
              // Fini
            } else if (event === 'error') {
              onError?.(parsed.error ?? 'Erreur TTS');
            }
          },
        },
      );
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') {
        onError?.(`Erreur TTS: ${e.message}`);
      }
    } finally {
      setTtsLoading(false);
      setPlaying(false);
      playingRef.current = false;
      abortControllerRef.current = null;
    }
  }, [notebookId, selectedOverview, playAudioChunk, onError]);

  const stopTTS = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    setCurrentLineIndex(-1);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    // Stop tout l'audio en cours
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch((err) => {
        console.debug('[AudioOverviewPanel] AudioContext close failed:', err);
      });
      audioCtxRef.current = null;
    }
    nextStartTimeRef.current = 0;
  }, []);

  const cycleSpeed = useCallback(() => {
    setPlaybackSpeed(prev => {
      if (prev === 1) return 1.25;
      if (prev === 1.25) return 1.5;
      if (prev === 1.5) return 1.75;
      if (prev === 1.75) return 2;
      return 1;
    });
  }, []);

  // Nettoyage au démontage : abort du flux + fermeture du contexte audio.
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
      if (audioCtxRef.current) audioCtxRef.current.close().catch((err) => {
        console.debug('[AudioOverviewPanel] AudioContext close failed (cleanup):', err);
      });
    };
  }, []);

  return {
    playing,
    ttsLoading,
    currentLineIndex,
    ttsProgress,
    ttsTotalLines,
    playbackSpeed,
    playTTS,
    stopTTS,
    cycleSpeed,
  };
}
