/**
 * GeneralChatLiveVoiceSocketHandler — mode VOCAL (live) de l'assistante
 * généraliste.
 *
 * Pendant vocal du chat texte `/chat-live` : une session Gemini Live audio
 * (STT + TTS), groundée sur le persona généraliste et dotée des mêmes outils
 * utilitaires du quotidien (météo, actualités, encyclopédie) via le
 * function-calling de Gemini Live.
 *
 * Volontairement MINIMAL et INDÉPENDANT (modèle : NotebookLiveSocketHandler) :
 * pas de boîte à outils IDE, pas de superviseur, pas de context-gate.
 *
 * Chemin WebSocket : `/chat-live-voice`
 *
 * Protocole client ↔ serveur :
 *   client → serveur :
 *     - audio micro PCM16 16 kHz : frames binaires
 *     - message texte (fallback) : { text: "<prompt>" }
 *   serveur → client :
 *     - audio modèle PCM 24 kHz  : frames binaires
 *     - { type: 'ready' }                 session prête
 *     - { user_text: "<transcription>" }  transcription de l'utilisateur
 *     - { text: "<transcription>" }       transcription de l'assistant
 *     - { tool: "<name>" }                un outil est appelé
 *     - { busy: boolean }                 exécution d'outil en cours
 *     - { interrupted: true }             barge-in
 *     - { error: "<message>" }            erreur
 */

import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { buildSystemPrompt } from '../runtime/prompts/index.js';
import type { ProfileConfig } from '../runtime/prompts/types.js';

/** Skills dont les outils sont exposés au mode vocal. */
const UTILITY_SKILL_IDS = ['weather', 'utilities'];

export interface GeneralChatLiveVoiceDeps {
  getCurrentProfile: () => ProfileConfig;
  createGeminiAI: () => GoogleGenAI;
  /** Appelle un outil natif par son nom (délégué au SkillManager/ToolRegistry). */
  handleToolCall: (name: string, args: any) => Promise<any>;
  /** Déclarations d'outils filtrées (format Gemini) à exposer au modèle. */
  getToolDeclarations: (skillIds: string[]) => any[];
  /** Sessions Gemini actives, pour un arrêt propre au shutdown. */
  activeGeminiSessions: Set<unknown>;
}

export function attachGeneralChatLiveVoiceWebSocket(
  wss: WebSocketServer,
  deps: GeneralChatLiveVoiceDeps,
): void {
  const { getCurrentProfile, createGeminiAI, handleToolCall, getToolDeclarations, activeGeminiSessions } = deps;

  wss.on('connection', async (clientWs: WebSocket) => {
    console.log('[GeneralChatVoice] Client connecté.');

    const sendJson = (payload: unknown) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        try { clientWs.send(JSON.stringify(payload)); } catch { /* ignore */ }
      }
    };

    const profile = getCurrentProfile();
    const voiceName = profile.aiVoice || 'Aoede';
    const temperature = profile.temperature ?? 0.7;

    const systemText = buildSystemPrompt({
      mode: 'ask',
      aiName: profile.aiName || 'Leanna',
      userName: profile.userName,
      language: profile.language,
      responseStyle: profile.responseStyle,
      agents: { enabled: false },
    });

    // Déclarations d'outils utilitaires (nettoyées des champs internes).
    const rawDecls = getToolDeclarations(UTILITY_SKILL_IDS);
    const functionDeclarations = rawDecls
      .filter(Boolean)
      .map((d: any) => {
        const { _mcpServerId, ...rest } = d ?? {};
        return rest;
      });

    let session: Awaited<ReturnType<GoogleGenAI['live']['connect']>> | null = null;
    let closed = false;

    // ── Traitement des appels d'outils utilitaires ──────────────────────────
    async function handleToolCalls(
      functionCalls: NonNullable<NonNullable<LiveServerMessage['toolCall']>['functionCalls']>,
    ): Promise<void> {
      sendJson({ busy: true });
      const responses: Array<{ id?: string; name: string; response: Record<string, unknown> }> = [];

      for (const call of functionCalls) {
        const name = call.name ?? 'unknown';
        sendJson({ tool: name });
        try {
          const result = await handleToolCall(name, call.args ?? {});
          responses.push({ id: call.id, name, response: { result } });
        } catch (err) {
          console.error(`[GeneralChatVoice] Erreur outil ${name}:`, err);
          responses.push({
            id: call.id,
            name,
            response: { error: err instanceof Error ? err.message : 'Échec de l\'outil.' },
          });
        }
      }

      try {
        session?.sendToolResponse({ functionResponses: responses });
      } catch (err) {
        console.error('[GeneralChatVoice] Échec sendToolResponse:', err);
      } finally {
        sendJson({ busy: false });
      }
    }

    try {
      session = await createGeminiAI().live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          temperature,
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
          systemInstruction: { parts: [{ text: systemText }] },
          ...(functionDeclarations.length > 0 ? { tools: [{ functionDeclarations }] } : {}),
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            // Audio du modèle → client (binaire).
            const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audio && clientWs.readyState === WebSocket.OPEN) {
              try { clientWs.send(Buffer.from(audio, 'base64')); } catch { /* ignore */ }
            }

            // Transcription de l'entrée utilisateur.
            const inputTranscription = (message.serverContent as { inputTranscription?: { text?: string } } | undefined)
              ?.inputTranscription?.text;
            if (inputTranscription) sendJson({ user_text: inputTranscription });

            // Transcription de la sortie assistant.
            const outputTranscription = (message.serverContent as { outputTranscription?: { text?: string } } | undefined)
              ?.outputTranscription?.text;
            if (outputTranscription) sendJson({ text: outputTranscription });

            // Barge-in / interruption.
            if (message.serverContent?.interrupted) sendJson({ interrupted: true });

            // Appels d'outils utilitaires.
            if (message.toolCall?.functionCalls?.length) {
              void handleToolCalls(message.toolCall.functionCalls);
            }
          },
          onerror: (e: unknown) => {
            console.error('[GeneralChatVoice] Erreur session Gemini:', e);
            sendJson({ error: 'Erreur de la session vocale.' });
          },
          onclose: () => {
            if (!closed) { closed = true; }
            if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
          },
        },
      });

      activeGeminiSessions.add(session);
      sendJson({ type: 'ready' });
    } catch (e) {
      console.error('[GeneralChatVoice] Échec de connexion à Gemini Live:', e);
      sendJson({ error: "Impossible de démarrer l'assistant vocal." });
      clientWs.close();
      return;
    }

    // ── Messages entrants du client ─────────────────────────────────────────
    clientWs.on('message', (data: Buffer, isBinary: boolean) => {
      if (!session) return;
      try {
        if (isBinary) {
          // Audio micro PCM16 16 kHz → Gemini Live.
          session.sendRealtimeInput({
            audio: { data: data.toString('base64'), mimeType: 'audio/pcm;rate=16000' },
          });
          return;
        }

        const msg = JSON.parse(data.toString());
        if (typeof msg.text === 'string' && msg.text.trim()) {
          session.sendClientContent({
            turns: [{ role: 'user', parts: [{ text: msg.text }] }],
            turnComplete: true,
          });
        }
      } catch (err) {
        console.error('[GeneralChatVoice] Message client invalide:', err);
      }
    });

    const cleanup = () => {
      if (closed) return;
      closed = true;
      console.log('[GeneralChatVoice] Client déconnecté — fermeture de la session.');
      try { session?.close(); } catch { /* ignore */ }
      if (session) activeGeminiSessions.delete(session);
    };

    clientWs.on('close', cleanup);
    clientWs.on('error', (err) => {
      console.error('[GeneralChatVoice] Erreur WebSocket client:', err);
      cleanup();
    });
  });
}
