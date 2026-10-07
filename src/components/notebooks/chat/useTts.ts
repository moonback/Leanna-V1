/**
 * useTts — lecture TTS en streaming d'un message de chat.
 * Extrait de NotebookChat (cluster TTS), comportement identique.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { streamSSE } from '../api/sse.js';
import type { TtsStreamData } from '../api/types.js';
import { errorMessage, isAbortError } from '../utils.js';

export function useTts() {
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const ttsAudioCtxRef = useRef<AudioContext | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const ttsNextStartRef = useRef<number>(0);

  const getTTSAudioContext = useCallback(() => {
    if (!ttsAudioCtxRef.current || ttsAudioCtxRef.current.state === 'closed') {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ttsAudioCtxRef.current = new AC({ sampleRate: 24000 });
    }
    return ttsAudioCtxRef.current;
  }, []);

  const playTTSChunk = useCallback((base64Audio: string) => {
    const audioCtx = getTTSAudioContext();
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
      source.connect(audioCtx.destination);
      const now = audioCtx.currentTime;
      const startTime = Math.max(now, ttsNextStartRef.current);
      source.start(startTime);
      ttsNextStartRef.current = startTime + audioBuffer.duration;
    } catch (e) {
      console.error('[NotebookChat TTS] Erreur lecture audio:', e);
    }
  }, [getTTSAudioContext]);

  const stopTTS = useCallback(() => {
    if (ttsAbortRef.current) {
      ttsAbortRef.current.abort();
      ttsAbortRef.current = null;
    }
    if (ttsAudioCtxRef.current && ttsAudioCtxRef.current.state !== 'closed') {
      ttsAudioCtxRef.current.close().catch((err) => {
        console.debug('[NotebookChat] TTS AudioContext close failed:', err);
      });
      ttsAudioCtxRef.current = null;
    }
    ttsNextStartRef.current = 0;
    setSpeakingMsgId(null);
  }, []);

  const handleTTS = useCallback(async (msgId: string, content: string) => {
    // Toggle off if already playing this message
    if (speakingMsgId === msgId) {
      stopTTS();
      return;
    }

    // Stop any ongoing TTS
    stopTTS();

    setSpeakingMsgId(msgId);
    ttsNextStartRef.current = 0;

    const controller = new AbortController();
    ttsAbortRef.current = controller;

    try {
      // Utiliser le streaming SSE pour les textes longs, requête simple sinon
      if (content.length > 500) {
        await streamSSE('/api/tts/speak-stream', {
          signal: controller.signal,
          json: { text: content, voice: 'ff_siwis' },
          onFrame: ({ event, data }) => {
            if (event === 'chunk') {
              const parsed = data as TtsStreamData;
              if (parsed.audio) playTTSChunk(parsed.audio);
            }
          },
        });
      } else {
        const data = await api<{ audio?: string }>('/api/tts/speak', {
          method: 'POST',
          json: { text: content, voice: 'ff_siwis' },
          signal: controller.signal,
        });
        if (data.audio) playTTSChunk(data.audio);
      }
    } catch (e: unknown) {
      if (!isAbortError(e)) {
        console.error('[NotebookChat TTS] Erreur:', errorMessage(e));
      }
    } finally {
      // Attendre la fin de la lecture audio avant de réinitialiser l'état
      const ctx = ttsAudioCtxRef.current;
      if (ctx && ctx.state !== 'closed' && ttsNextStartRef.current > ctx.currentTime) {
        const remainingMs = (ttsNextStartRef.current - ctx.currentTime) * 1000;
        setTimeout(() => {
          setSpeakingMsgId((current) => current === msgId ? null : current);
        }, remainingMs + 100);
      } else {
        setSpeakingMsgId((current) => current === msgId ? null : current);
      }
      ttsAbortRef.current = null;
    }
  }, [speakingMsgId, stopTTS, playTTSChunk]);

  // Cleanup TTS on unmount
  useEffect(() => {
    return () => {
      if (ttsAbortRef.current) ttsAbortRef.current.abort();
      if (ttsAudioCtxRef.current && ttsAudioCtxRef.current.state !== 'closed') {
        ttsAudioCtxRef.current.close().catch((err) => {
          console.debug('[NotebookChat] TTS AudioContext close failed (cleanup):', err);
        });
      }
    };
  }, []);

  return { speakingMsgId, handleTTS };
}
