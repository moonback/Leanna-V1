/**
 * NotebookVoicePanel — contrôle du second assistant vocal « live » dédié au
 * Notebook Chat (« Interrogez vos sources »).
 *
 * Rendu compact, destiné à prendre place dans la ThreadBar à côté du bouton
 * « Nouveau ». Le bouton micro ouvre/ferme une session Gemini Live groundée
 * sur les sources du notebook ; un panneau de transcription en direct
 * (questions + réponses + sources citées) s'affiche en overlay sous le bouton.
 *
 * Pendant que la session notebook est active, l'assistant vocal GLOBAL (Leanna)
 * est mis en sourdine pour éviter que les deux micros/haut-parleurs se chevauchent.
 */

import { useContext, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Loader2, Volume2 } from 'lucide-react';
import { LiveAPIContext } from '../../../context/LiveAPIContext.js';
import { useNotebookLive } from './useNotebookLive.js';

interface Props {
  notebookId: string;
  selectedSources: string[];
  prefersReducedMotion: boolean | null;
  onError: (message: string) => void;
  /** Notification de progression quand l'assistant génère un document. */
  onInfo?: (message: string) => void;
  /** Appelé quand l'assistant a généré un document (rafraîchir l'historique). */
  onDocumentGenerated?: (doc: { id: string; type: string; title: string }) => void;
}

export function NotebookVoicePanel({ notebookId, selectedSources, prefersReducedMotion, onError, onInfo, onDocumentGenerated }: Props) {
  const live = useNotebookLive({
    notebookId,
    selectedSources,
    onError,
    onDocumentGenerating: (info) => {
      onInfo?.(`Génération du document (${info.type})…`);
      // Refléter la génération dans la barre de progression du panneau « Générer ».
      window.dispatchEvent(new CustomEvent('notebook-voice-generation-start', {
        detail: { notebookId, taskId: info.taskId, type: info.type },
      }));
    },
    onDocumentGenerated: (doc) => {
      onInfo?.(`Document généré : ${doc.title}`);
      window.dispatchEvent(new CustomEvent('notebook-voice-generation-done', {
        detail: { notebookId, taskId: doc.taskId, type: doc.type, title: doc.title },
      }));
      onDocumentGenerated?.(doc);
    },
    onDocumentGenerationError: (info) => {
      window.dispatchEvent(new CustomEvent('notebook-voice-generation-done', {
        detail: { notebookId, taskId: info.taskId, type: info.type, error: info.error },
      }));
    },
  });
  const {
    connected, connecting, busy, muted, toggleMute, transcript, toggle,
    amplitude, inputLevel, outputLevel, isSpeaking, isListening,
  } = live;

  // Couleur de l'indicateur selon l'état courant.
  const ampColor = busy
    ? 'var(--color-warning, #fbbf24)'
    : isSpeaking
      ? 'var(--color-accent-alt, #a78bfa)'
      : 'var(--accent-primary)';
  // Amplitude lissée vers une échelle visible (le niveau brut est souvent faible).
  const ampScale = Math.min(1, amplitude * 2.2);

  // Accès défensif au contexte Live global (peut être absent en test isolé).
  const globalLive = useContext(LiveAPIContext);
  // On ne touche à la sourdine globale que si on l'a nous-mêmes activée.
  const didMuteGlobalRef = useRef(false);

  useEffect(() => {
    if (!globalLive) return;
    if (connected && globalLive.connected && !globalLive.muted) {
      globalLive.toggleMute();
      didMuteGlobalRef.current = true;
    } else if (!connected && didMuteGlobalRef.current) {
      // Rétablir le son global quand on arrête la session notebook.
      if (globalLive.connected && globalLive.muted) globalLive.toggleMute();
      didMuteGlobalRef.current = false;
    }
  }, [connected, globalLive]);

  const transcriptEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  return (
    <div className="relative flex items-center gap-1.5">
      {/* ── Bouton « Interroger à la voix » (compact, pour la ThreadBar) ── */}
      <div className="relative flex items-center">
        {/* Anneaux d'amplitude animés — réagissent au niveau audio live */}
        <AnimatePresence>
          {connected && !muted && (ampScale > 0.02 || isSpeaking || isListening) && (
            <>
              {/* <motion.span
                key="ring-outer"
                className="pointer-events-none absolute inset-0 rounded-full"
                style={{ border: `2px solid ${ampColor}` }}
                initial={{ opacity: 0, scale: 1 }}
                animate={prefersReducedMotion
                  ? { opacity: 0.4, scale: 1 }
                  : { opacity: 0.15 + ampScale * 0.5, scale: 1 + ampScale * 0.6 }}
                exit={{ opacity: 0, scale: 1 }}
                transition={{ duration: 0.12 }}
                aria-hidden="true"
              /> */}
              {/* <motion.span
                key="ring-mid"
                className="pointer-events-none absolute inset-0 rounded-full"
                style={{ border: `2px solid ${ampColor}` }}
                initial={{ opacity: 0, scale: 1 }}
                animate={prefersReducedMotion
                  ? { opacity: 0.3, scale: 1 }
                  : { opacity: 0.2 + ampScale * 0.5, scale: 1 + ampScale * 0.3 }}
                exit={{ opacity: 0, scale: 1 }}
                transition={{ duration: 0.1 }}
                aria-hidden="true"
              /> */}
            </>
          )}
        </AnimatePresence>

        <motion.button
          onClick={toggle}
          disabled={connecting}
          whileTap={{ scale: 0.92 }}
          transition={{ duration: 0.1 }}
          className="relative z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-smfont-medium transition-colors disabled:opacity-60"
          style={{
            backgroundColor: connected ? ampColor : 'transparent',
            color: connected ? '#fff' : 'var(--accent-primary)',
            border: '1px solid var(--border-base)',
          }}
          title={connected ? "Arrêter l'assistant vocal" : "Interroger vos sources à la voix"}
          aria-label={connected ? "Arrêter l'assistant vocal" : "Démarrer l'assistant vocal"}
          aria-pressed={connected}
        >
          {connecting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Mic className="w-3.5 h-3.5 flex-shrink-0" />
          )}

          {/* Barres d'amplitude animées (visualiseur) */}
          {connected && !connecting && (
            <span className="flex items-end gap-[2px] h-3.5" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => {
                // Chaque barre réagit un peu différemment pour un rendu organique.
                const base = muted ? 0.08 : (isSpeaking ? outputLevel : inputLevel);
                const jitter = [1, 0.7, 1.15, 0.85][i];
                const h = prefersReducedMotion
                  ? 0.35
                  : Math.min(1, 0.12 + base * 2.6 * jitter);
                return (
                  <motion.span
                    key={i}
                    className="w-[3px] rounded-full"
                    style={{ backgroundColor: '#fff', originY: 1 }}
                    animate={{ height: `${Math.round(h * 100)}%`, opacity: muted ? 0.5 : 0.9 }}
                    transition={{ duration: 0.08 }}
                  />
                );
              })}
            </span>
          )}

          <span className="hidden sm:inline">
            {connecting
              ? 'Connexion…'
              : connected
                ? (muted ? 'Micro coupé' : isSpeaking ? 'Répond…' : 'À l\u2019écoute')
                : 'Interroger à la voix'}
          </span>
        </motion.button>
      </div>

      {/* Bouton couper/réactiver le micro (visible en session) */}
      {connected && (
        <button
          onClick={toggleMute}
          className="p-1.5 rounded-full transition-colors flex-shrink-0"
          style={{
            backgroundColor: muted ? 'var(--color-warning)' : 'transparent',
            color: muted ? '#fff' : 'var(--text-muted)',
            border: '1px solid var(--border-base)',
          }}
          title={muted ? 'Réactiver le micro' : 'Couper le micro'}
          aria-label={muted ? 'Réactiver le micro' : 'Couper le micro'}
          aria-pressed={muted}
        >
          {muted ? <MicOff className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
        </button>
      )}

      {/* ── Panneau de transcription live (overlay ancré) ─────────────── */}
      <AnimatePresence>
        {/* {connected && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={spring}
            className="absolute top-full right-0 mt-2 z-50 w-80 max-w-[92vw] rounded-xl overflow-hidden shadow-xl"
            style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)', transformOrigin: 'top right' }}
          >
            <div
              className="flex items-center justify-between px-3 py-2 border-b"
              style={{ borderColor: 'var(--border-base)' }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="relative flex h-2 w-2 flex-shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                </span>
                <span className="text-smfont-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                  Interrogez vos sources
                </span>
                {busy && (
                  <span className="flex items-center gap-1 text-xs flex-shrink-0" style={{ color: 'var(--accent-primary)' }}>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    recherche…
                  </span>
                )}
              </div>
              <button
                onClick={toggle}
                className="p-1 rounded-md transition-colors hover:bg-red-500/10 flex-shrink-0"
                style={{ color: 'var(--text-muted)' }}
                title="Arrêter l'assistant vocal"
                aria-label="Arrêter l'assistant vocal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-56 overflow-y-auto px-3 py-2 space-y-2 custom-scrollbar">
              {transcript.length === 0 ? (
                <p className="text-sm py-2 text-center" style={{ color: 'var(--text-dimmed)' }}>
                  Parlez pour poser une question sur vos sources…
                </p>
              ) : (
                transcript.map((e) => (
                  <div key={e.id} className="flex gap-2">
                    <span
                      className="flex-shrink-0 text-smfont-semibold mt-0.5"
                      style={{ color: e.role === 'user' ? 'var(--accent-primary)' : 'var(--text-muted)' }}
                    >
                      {e.role === 'user' ? 'Vous' : 'IA'}
                    </span>
                    <span className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                      {e.text}
                    </span>
                  </div>
                ))
              )}
              <div ref={transcriptEndRef} />
            </div>

            {lastCitations.length > 0 && (
              <div className="px-3 py-2 border-t flex flex-wrap gap-1.5" style={{ borderColor: 'var(--border-base)' }}>
                <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-dimmed)' }}>
                  <BookOpen className="w-3 h-3" /> Sources :
                </span>
                {lastCitations.map((c, i) => (
                  <span
                    key={`${c.chunkId}-${i}`}
                    className="px-2 py-0.5 rounded-full text-xs"
                    style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}
                    title={c.excerpt}
                  >
                    {c.sourceTitle.length > 28 ? c.sourceTitle.slice(0, 28) + '…' : c.sourceTitle}
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        )} */}
      </AnimatePresence>
    </div>
  );
}
