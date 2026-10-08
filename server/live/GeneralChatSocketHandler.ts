/**
 * GeneralChatSocketHandler — assistant texte « généraliste » épuré.
 *
 * Objectif (Phase 2 du plan de transformation) : offrir une interface de chat
 * conversationnelle minimale, centrée sur le texte, pour l'assistante
 * généraliste du quotidien — SANS la machinerie lourde de la session Gemini
 * Live (/live) : pas d'audio, pas de superviseur, pas de boîte à outils IDE.
 *
 * Capacités d'outils : uniquement les outils utilitaires du quotidien
 * (`get_weather`, `get_news`, `lookup_topic`), exposés via le function-calling
 * de Gemini. Le system prompt est le persona généraliste compilé par le
 * SystemPromptBuilder (mode "ask", sans agents, sans projet).
 *
 * Chemin WebSocket : `/chat-live`
 *
 * Protocole client ↔ serveur (JSON) :
 *   client → serveur : { text: "<prompt>" }           message utilisateur
 *   serveur → client : { text: "<chunk>" }            texte streamé (plusieurs)
 *                      { tool: "<name>" }              un outil est appelé
 *                      { done: true }                  fin du tour
 *                      { error: "<message>" }          erreur
 */

import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI } from '@google/genai';
import { buildSystemPrompt } from '../runtime/prompts/index.js';
import type { ProfileConfig } from '../runtime/prompts/types.js';

/** Nom des skills dont les outils sont exposés au chat généraliste. */
const UTILITY_SKILL_IDS = ['weather', 'utilities'];

/** Nombre maximum d'allers-retours d'appels d'outils par tour (anti-boucle). */
const MAX_TOOL_ROUNDS = 4;

export interface GeneralChatSocketDeps {
  getCurrentProfile: () => ProfileConfig;
  createGeminiAI: () => GoogleGenAI;
  /** Appelle un outil natif par son nom (délégué au SkillManager/ToolRegistry). */
  handleToolCall: (name: string, args: any) => Promise<any>;
  /** Déclarations d'outils filtrées (format Gemini) à exposer au modèle. */
  getToolDeclarations: (skillIds: string[]) => any[];
}

interface ChatTurn {
  role: 'user' | 'model';
  parts: any[];
}

export function attachGeneralChatWebSocket(
  wss: WebSocketServer,
  deps: GeneralChatSocketDeps,
): void {
  const { getCurrentProfile, createGeminiAI, handleToolCall, getToolDeclarations } = deps;

  wss.on('connection', (clientWs: WebSocket) => {
    console.log('[GeneralChat] Client connecté.');

    const sendJson = (payload: unknown) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        try { clientWs.send(JSON.stringify(payload)); } catch { /* ignore */ }
      }
    };

    // Historique de la conversation, conservé pour la durée de la connexion.
    const history: ChatTurn[] = [];
    let busy = false;

    const profile = getCurrentProfile();
    const systemPrompt = buildSystemPrompt({
      mode: 'ask',
      aiName: profile.aiName || 'Leanna',
      userName: profile.userName,
      language: profile.language,
      responseStyle: profile.responseStyle,
      // Pas d'agents ni de projet : chat généraliste pur.
      agents: { enabled: false },
    });

    // Déclarations d'outils utilitaires (nettoyées des champs internes _mcp*).
    const rawDecls = getToolDeclarations(UTILITY_SKILL_IDS);
    const toolDeclarations = rawDecls
      .filter(Boolean)
      .map((d: any) => {
        const { _mcpServerId, ...rest } = d ?? {};
        return rest;
      });
    const tools = toolDeclarations.length > 0 ? [{ functionDeclarations: toolDeclarations }] : undefined;

    async function runTurn(userText: string): Promise<void> {
      busy = true;
      sendJson({ busy: true });

      history.push({ role: 'user', parts: [{ text: userText }] });

      const ai = createGeminiAI();
      const model = 'gemini-3.8-flash';
      const temperature = profile.temperature ?? 0.7;

      try {
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const response = await ai.models.generateContent({
            model,
            contents: history as any,
            config: {
              temperature,
              systemInstruction: { parts: [{ text: systemPrompt }] },
              ...(tools ? { tools } : {}),
            },
          });

          const candidate = response.candidates?.[0];
          const parts = candidate?.content?.parts ?? [];
          const functionCalls = parts.filter((p: any) => p.functionCall).map((p: any) => p.functionCall);

          if (functionCalls.length > 0) {
            // Enregistrer le tour "model" (appels d'outils) dans l'historique.
            history.push({ role: 'model', parts });

            const responseParts: any[] = [];
            for (const call of functionCalls) {
              const name = call.name as string;
              sendJson({ tool: name });
              let result: any;
              try {
                result = await handleToolCall(name, call.args ?? {});
              } catch (err: any) {
                result = { error: err?.message ?? 'Échec de l\'outil.' };
              }
              responseParts.push({
                functionResponse: { name, response: { result } },
              });
            }
            // Fournir les résultats d'outils et relancer un tour.
            history.push({ role: 'user', parts: responseParts });
            continue;
          }

          // Pas d'appel d'outil : réponse texte finale → streamer vers le client.
          const finalText = parts
            .filter((p: any) => typeof p.text === 'string' && !p.thought)
            .map((p: any) => p.text)
            .join('');

          history.push({ role: 'model', parts: [{ text: finalText }] });

          // Streaming « simulé » par mots pour une UX fluide même si le tour
          // final a été résolu en un seul appel (le function-calling exige une
          // réponse complète avant le texte, donc on fragmente nous-mêmes).
          if (finalText) {
            const chunks = finalText.match(/\S+\s*/g) ?? [finalText];
            for (const chunk of chunks) {
              sendJson({ text: chunk });
            }
          } else {
            sendJson({ text: "Je n'ai pas de réponse à fournir pour le moment." });
          }
          sendJson({ done: true });
          busy = false;
          sendJson({ busy: false });
          return;
        }

        // Trop d'allers-retours d'outils.
        sendJson({ error: "Trop d'appels d'outils successifs — tour interrompu." });
        sendJson({ done: true });
      } catch (err: any) {
        console.error('[GeneralChat] Erreur de génération:', err);
        sendJson({ error: err?.message ?? 'Erreur de génération.' });
        sendJson({ done: true });
      } finally {
        busy = false;
        sendJson({ busy: false });
      }
    }

    clientWs.on('message', (data: Buffer) => {
      let msg: any;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        sendJson({ error: 'Message client invalide (JSON attendu).' });
        return;
      }

      if (typeof msg.text === 'string' && msg.text.trim()) {
        if (busy) {
          sendJson({ error: 'Une réponse est déjà en cours, patiente un instant.' });
          return;
        }
        void runTurn(msg.text.trim());
      }
    });

    clientWs.on('close', () => {
      console.log('[GeneralChat] Client déconnecté.');
    });
    clientWs.on('error', (err) => {
      console.error('[GeneralChat] Erreur WebSocket client:', err);
    });
  });
}
