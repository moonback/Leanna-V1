/**
 * ChatGeneralisteView — Interface de chat épurée pour l'assistante généraliste.
 *
 * Phase 2 du plan de transformation : une vue conversationnelle minimale,
 * centrée sur le texte, qui se branche sur le endpoint WebSocket léger
 * `/chat-live` (prompt → stream de tokens, outils utilitaires du quotidien).
 *
 * Ne passe PAS par useLiveAPI/useWebSocket (orientés audio/Gemini Live) : elle
 * ouvre sa propre WebSocket texte, réutilisant l'auth par cookie et le pattern
 * JSON { text } du reste de l'app.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, Trash2, Sparkles, Mic, MicOff, Loader2 } from 'lucide-react';
import { Button, Textarea, ViewHeader, EmptyState, useToast } from '../components/ui/index.js';
import { useChatLiveVoice } from './useChatLiveVoice.js';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Outil en cours d'utilisation (affiché pendant la génération). */
  tool?: string;
  /** Le message assistant est encore en cours de streaming. */
  streaming?: boolean;
}

const SUGGESTIONS = [
  'Quelle est la météo à Paris aujourd\u2019hui ?',
  'Résume-moi l\u2019actualité tech du moment',
  'Explique-moi simplement la photosynthèse',
  'Donne-moi une idée de dîner rapide et équilibré',
];

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function ChatGeneralisteView(): React.ReactElement {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // ID du message assistant en cours de construction (pour y accumuler les chunks).
  const streamingIdRef = useRef<string | null>(null);

  const toast = useToast();

  // ── Mode vocal (live) ──────────────────────────────────────────────────
  const voice = useChatLiveVoice({
    onError: (m) => toast.error(m),
  });
  const {
    connected: voiceConnected,
    connecting: voiceConnecting,
    muted: voiceMuted,
    toggleMute: voiceToggleMute,
    transcript: voiceTranscript,
    toggle: voiceToggle,
    isSpeaking,
    isListening,
  } = voice;

  // ── Connexion WebSocket ────────────────────────────────────────────────
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/chat-live`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    ws.onmessage = (event) => {
      let msg: any;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      // Chunk de texte → accumuler dans le message assistant en cours.
      if (typeof msg.text === 'string') {
        const id = streamingIdRef.current;
        if (!id) return;
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, content: m.content + msg.text, tool: undefined } : m)),
        );
        return;
      }

      // Un outil utilitaire est appelé.
      if (typeof msg.tool === 'string') {
        const id = streamingIdRef.current;
        if (!id) return;
        setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, tool: msg.tool } : m)));
        return;
      }

      // Erreur côté serveur.
      if (typeof msg.error === 'string') {
        const id = streamingIdRef.current;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id
              ? { ...m, content: m.content || `⚠️ ${msg.error}`, streaming: false, tool: undefined }
              : m,
          ),
        );
        return;
      }

      // Fin du tour.
      if (msg.done === true) {
        const id = streamingIdRef.current;
        setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, streaming: false, tool: undefined } : m)));
        streamingIdRef.current = null;
        setBusy(false);
        return;
      }

      // État occupé.
      if (typeof msg.busy === 'boolean') {
        setBusy(msg.busy);
      }
    };

    return () => {
      try { ws.close(); } catch { /* ignore */ }
      wsRef.current = null;
    };
  }, []);

  // ── Auto-scroll vers le bas à chaque nouveau contenu ───────────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, voiceTranscript]);

  // ── Envoi d'un message ─────────────────────────────────────────────────
  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      const ws = wsRef.current;
      if (!trimmed || busy || !ws || ws.readyState !== WebSocket.OPEN) return;

      const assistantId = newId();
      streamingIdRef.current = assistantId;

      setMessages((prev) => [
        ...prev,
        { id: newId(), role: 'user', content: trimmed },
        { id: assistantId, role: 'assistant', content: '', streaming: true },
      ]);
      setInput('');
      setBusy(true);

      try {
        ws.send(JSON.stringify({ text: trimmed }));
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: '⚠️ Impossible d\u2019envoyer le message.', streaming: false }
              : m,
          ),
        );
        setBusy(false);
        streamingIdRef.current = null;
      }
    },
    [busy],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const clearConversation = () => {
    if (busy) return;
    setMessages([]);
    streamingIdRef.current = null;
  };

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: 'var(--bg-base)' }}>
      <ViewHeader
        title="Assistante généraliste"
        icon={MessageCircle}
        description="Pose n\u2019importe quelle question du quotidien — météo, actualités, idées, explications."
        badge={connected ? 'En ligne' : 'Hors ligne'}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant={voiceConnected ? 'primary' : 'secondary'}
              size="sm"
              iconLeft={
                voiceConnecting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : voiceConnected ? (
                  <MicOff size={14} />
                ) : (
                  <Mic size={14} />
                )
              }
              onClick={voiceToggle}
              disabled={voiceConnecting}
              title={voiceConnected ? 'Arrêter le mode vocal' : 'Démarrer le mode vocal'}
            >
              {voiceConnected ? 'Arrêter la voix' : 'Mode vocal'}
            </Button>
            {messages.length > 0 && (
              <Button variant="ghost" size="sm" iconLeft={<Trash2 size={14} />} onClick={clearConversation} disabled={busy}>
                Effacer
              </Button>
            )}
          </div>
        }
      />

      {/* ── Bandeau mode vocal ────────────────────────────────────────── */}
      {voiceConnected && (
        <div
          className="flex flex-shrink-0 items-center justify-between gap-3 border-b px-4 py-2 lg:px-8"
          style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--accent-subtle)' }}
        >
          <span className="flex items-center gap-2 text-sm" style={{ color: 'var(--accent-secondary)' }}>
            <Mic size={14} className={isListening ? 'animate-pulse' : ''} />
            {isSpeaking ? 'L\u2019assistante parle…' : isListening ? 'Je t\u2019écoute…' : 'Mode vocal actif'}
          </span>
          <button
            onClick={voiceToggleMute}
            className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors"
            style={{
              backgroundColor: voiceMuted ? 'var(--color-warning)' : 'var(--bg-secondary)',
              color: voiceMuted ? 'white' : 'var(--text-secondary)',
              border: '1px solid var(--border-base)',
            }}
            title={voiceMuted ? 'Réactiver le micro' : 'Couper le micro'}
          >
            {voiceMuted ? <MicOff size={12} /> : <Mic size={12} />}
            {voiceMuted ? 'Micro coupé' : 'Micro actif'}
          </button>
        </div>
      )}

      {/* ── Fil de conversation ───────────────────────────────────────── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 lg:px-8">
        {messages.length === 0 && voiceTranscript.length === 0 ? (
          <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center">
            <EmptyState
              icon={Sparkles}
              title="Comment puis-je t\u2019aider ?"
              description="Je suis ton assistante du quotidien. Commence par une de ces idées :"
            />
            <div className="mt-4 grid w-full gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  disabled={!connected || busy}
                  className="rounded-xl border p-3 text-left text-sm transition-all hover:scale-[1.01] disabled:opacity-50"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    borderColor: 'var(--border-base)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-4">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {voiceTranscript.map((t) => (
              <MessageBubble
                key={t.id}
                message={{ id: t.id, role: t.role, content: t.text }}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Zone de saisie ────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-t px-4 py-3 lg:px-8" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-base)' }}>
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <div className="flex-1">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={connected ? 'Écris ton message… (Entrée pour envoyer)' : 'Connexion en cours…'}
              rows={1}
              minHeight={44}
              disabled={!connected}
            />
          </div>
          <Button
            variant="primary"
            size="lg"
            iconLeft={<Send size={16} />}
            onClick={() => send(input)}
            loading={busy}
            disabled={!connected || !input.trim()}
          >
            Envoyer
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Bulle de message ────────────────────────────────────────────────────────
function MessageBubble({ message }: { message: ChatMessage }): React.ReactElement {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
        style={{
          backgroundColor: isUser ? 'var(--accent-primary)' : 'var(--bg-secondary)',
          color: isUser ? 'white' : 'var(--text-primary)',
          border: isUser ? 'none' : '1px solid var(--border-base)',
        }}
      >
        {message.tool && !message.content ? (
          <span className="flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
            <Sparkles size={14} className="animate-pulse" />
            Consultation de l{'\u2019'}outil « {message.tool} »…
          </span>
        ) : message.content ? (
          message.content
        ) : (
          <span className="inline-flex gap-1" style={{ color: 'var(--text-muted)' }}>
            <span className="animate-bounce">•</span>
            <span className="animate-bounce [animation-delay:0.15s]">•</span>
            <span className="animate-bounce [animation-delay:0.3s]">•</span>
          </span>
        )}
      </div>
    </div>
  );
}
