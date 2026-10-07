/**
 * MessageItem — une bulle de message (utilisateur ou assistant) avec son mode
 * édition, sa barre d'actions et ses citations. Mémoïsé. Présentationnel.
 */

import { memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { SpringTransition } from '../motionTypes.js';
import {
  Check, Copy, RefreshCw, Square, Volume2, StickyNote, Download,
  ThumbsUp, ThumbsDown, Pencil, Quote, ChevronDown, ExternalLink,
} from 'lucide-react';
import { renderMessageContent } from './renderHelpers.js';
import type { Citation, ChatMessage } from './types.js';

interface Props {
  msg: ChatMessage;
  prefersReducedMotion: boolean | null;
  spring: SpringTransition;
  loading: boolean;
  editingMsgId: string | null;
  editingContent: string;
  setEditingContent: (v: string) => void;
  copiedMsgId: string | null;
  speakingMsgId: string | null;
  feedbackMap: Record<string, 'up' | 'down'>;
  showCitations: string | null;
  setShowCitations: (v: string | null) => void;
  setHoveredCitation: (v: null) => void;
  onCopy: (msgId: string, content: string) => void;
  onRetry: (msgId: string) => void;
  onTTS: (msgId: string, content: string) => void;
  onSaveToNote: (msg: ChatMessage) => void;
  onOpenFolderPicker: (msg: ChatMessage) => void;
  onFeedback: (msgId: string, type: 'up' | 'down') => void;
  onEditStart: (msgId: string, content: string) => void;
  onEditCancel: () => void;
  onEditSubmit: (msgId: string) => void;
  onFetchCitation: (citation: Citation, x: number, y: number) => void;
}

export const MessageItem = memo(function MessageItem({
  msg, prefersReducedMotion, spring, loading,
  editingMsgId, editingContent, setEditingContent,
  copiedMsgId, speakingMsgId, feedbackMap, showCitations, setShowCitations, setHoveredCitation,
  onCopy, onRetry, onTTS, onSaveToNote, onOpenFolderPicker, onFeedback,
  onEditStart, onEditCancel, onEditSubmit, onFetchCitation,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={prefersReducedMotion ? { duration: 0.1 } : spring}
      className={`mx-auto mb-6 flex w-full max-w-4xl ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className="notebook-chat-message"
        data-role={msg.role}
        style={{
          backgroundColor: msg.role === 'user' ? 'var(--notebook-chat-user)' : 'var(--notebook-chat-ai)',
          color: 'var(--text-primary)',
          border: msg.role === 'assistant' ? '1px solid var(--notebook-border)' : '1px solid transparent',
          maxWidth: msg.role === 'user' ? '75%' : '100%',
        }}
      >
        {/* Message content — with edit mode for user messages */}
        {msg.role === 'user' && editingMsgId === msg.id ? (
          <div className="space-y-2">
            <textarea
              value={editingContent}
              onChange={(e) => setEditingContent(e.target.value)}
              className="w-full px-3 py-2 rounded-full text-sm outline-none resize-none"
              style={{ backgroundColor: 'var(--notebook-surface-muted)', border: '1px solid var(--notebook-border)', color: 'var(--text-primary)' }}
              rows={3}
              // autoFocus justifié : le champ n'apparaît qu'après action explicite
              // (clic sur « Modifier ») ; focus immédiat attendu pour l'édition.
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => onEditSubmit(msg.id)}
                disabled={!editingContent.trim()}
                className="px-3 py-1.5 rounded-full text-smfont-medium transition-colors disabled:opacity-40"
                style={{ backgroundColor: 'var(--notebook-accent)', color: 'var(--text-primary)' }}
              >
                Renvoyer
              </button>
              <button
                onClick={onEditCancel}
                className="px-3 py-1.5 rounded-full text-smfont-medium notebook-chip"
              >
                Annuler
              </button>
            </div>
          </div>
        ) : msg.role === 'assistant' ? (
          renderMessageContent(msg.content)
        ) : (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
        )}

        {/* Actions bar */}
        {editingMsgId !== msg.id && (
          <div className="flex flex-wrap items-center gap-2 mt-2.5 pt-1">
            <p className="text-sm opacity-40">
              {new Date(msg.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </p>

            {/* Separator dot */}
            <span className="text-sm opacity-20" aria-hidden="true">•</span>

            {msg.role === 'assistant' && (
              <>
                {/* Copy */}
                <button
                  type="button"
                  onClick={() => onCopy(msg.id, msg.content)}
                  className={`flex items-center gap-1.5 text-sm transition-all duration-200 rounded-md px-2 py-1 ${
                    copiedMsgId === msg.id
                      ? 'opacity-100 bg-[var(--color-success)]/10'
                      : 'opacity-60 hover:opacity-100 hover:bg-[var(--notebook-hover)]'
                  }`}
                  style={{ color: copiedMsgId === msg.id ? 'var(--color-success)' : undefined }}
                  title="Copier la réponse"
                  aria-label={copiedMsgId === msg.id ? "Copié" : "Copier la réponse"}
                >
                  {copiedMsgId === msg.id ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span className="text-xs">{copiedMsgId === msg.id ? 'Copié' : 'Copier'}</span>
                </button>

                {/* Retry */}
                <button
                  type="button"
                  onClick={() => onRetry(msg.id)}
                  disabled={loading}
                  className="flex items-center gap-1.5 text-sm transition-all duration-200 rounded-md px-2 py-1 opacity-60 hover:opacity-100 hover:bg-[var(--notebook-hover)] disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Régénérer la réponse"
                  aria-label="Régénérer la réponse"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span className="text-xs">Retry</span>
                </button>

                {/* TTS */}
                <button
                  type="button"
                  onClick={() => onTTS(msg.id, msg.content)}
                  className={`flex items-center gap-1.5 text-sm transition-all duration-200 rounded-md px-2 py-1 ${
                    speakingMsgId === msg.id
                      ? 'opacity-100 bg-[var(--accent-primary)]/10'
                      : 'opacity-60 hover:opacity-100 hover:bg-[var(--notebook-hover)]'
                  }`}
                  style={{ color: speakingMsgId === msg.id ? 'var(--accent-primary)' : undefined }}
                  title={speakingMsgId === msg.id ? 'Arrêter la lecture' : 'Lire à voix haute (TTS IA)'}
                  aria-label={speakingMsgId === msg.id ? "Arrêter la lecture" : "Lire à voix haute"}
                >
                  {speakingMsgId === msg.id ? (
                    <>
                      <Square className="w-3.5 h-3.5" />
                      <span className="flex items-center gap-1">
                        <div className="flex gap-[2px]">
                          {Array.from({ length: 4 }).map((_, i) => (
                            <span
                              key={i}
                              className="w-[2px] h-2 bg-current rounded-full"
                              style={{ animationDelay: `${i * 0.15}s` }}
                              aria-hidden="true"
                            />
                          ))}
                        </div>
                      </span>
                      <span className="text-xs">Stop</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-3.5 h-3.5" />
                      <span className="text-xs">Écouter</span>
                    </>
                  )}
                </button>

                {/* Save to notes */}
                <button
                  type="button"
                  onClick={() => onSaveToNote(msg)}
                  className="flex items-center gap-1.5 text-sm transition-all duration-200 rounded-md px-2 py-1 opacity-60 hover:opacity-100 hover:bg-[var(--notebook-hover)]"
                  title="Sauvegarder dans les notes"
                  aria-label="Sauvegarder dans les notes"
                >
                  <StickyNote className="w-3.5 h-3.5" />
                  <span className="text-xs">Note</span>
                </button>

                {/* Save as Markdown */}
                <button
                  type="button"
                  onClick={() => onOpenFolderPicker(msg)}
                  className="flex items-center gap-1.5 text-sm transition-all duration-200 rounded-md px-2 py-1 opacity-60 hover:opacity-100 hover:bg-[var(--notebook-hover)]"
                  title="Enregistrer ce message en fichier Markdown (.md)"
                  aria-label="Enregistrer en Markdown"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="text-xs">MD</span>
                </button>

                {/* Separator */}
                <span className="text-sm opacity-20" aria-hidden="true">•</span>

                {/* Feedback thumbs */}
                <div className="flex gap-0.5">
                  <button
                    type="button"
                    onClick={() => onFeedback(msg.id, 'up')}
                    className={`p-1.5 rounded-md transition-all duration-200 ${
                      feedbackMap[msg.id] === 'up'
                        ? 'opacity-100 bg-[var(--color-success)]/10'
                        : 'opacity-60 hover:opacity-100 hover:bg-[var(--notebook-hover)]'
                    }`}
                    style={{ color: feedbackMap[msg.id] === 'up' ? 'var(--color-success)' : undefined }}
                    title="Bonne réponse"
                    aria-label="Bonne réponse"
                  >
                    <ThumbsUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onFeedback(msg.id, 'down')}
                    className={`p-1.5 rounded-md transition-all duration-200 ${
                      feedbackMap[msg.id] === 'down'
                        ? 'opacity-100 bg-[var(--color-error)]/10'
                        : 'opacity-60 hover:opacity-100 hover:bg-[var(--notebook-hover)]'
                    }`}
                    style={{ color: feedbackMap[msg.id] === 'down' ? 'var(--color-error)' : undefined }}
                    title="Mauvaise réponse"
                    aria-label="Mauvaise réponse"
                  >
                    <ThumbsDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </>
            )}

            {msg.role === 'user' && (
              <>
                <button
                  type="button"
                  onClick={() => onEditStart(msg.id, msg.content)}
                  className="flex items-center gap-1.5 text-sm transition-all duration-200 rounded-md px-2 py-1 opacity-60 hover:opacity-100 hover:bg-[var(--notebook-hover)]"
                  title="Modifier et renvoyer"
                  aria-label="Modifier le message"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span className="text-xs">Modifier</span>
                </button>

                {/* Save user message as Markdown */}
                <button
                  type="button"
                  onClick={() => onOpenFolderPicker(msg)}
                  className="flex items-center gap-1.5 text-sm transition-all duration-200 rounded-md px-2 py-1 opacity-60 hover:opacity-100 hover:bg-[var(--notebook-hover)]"
                  title="Enregistrer ce message en fichier Markdown (.md)"
                  aria-label="Enregistrer en Markdown"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="text-xs">MD</span>
                </button>
              </>
            )}
          </div>
        )}

        {/* Citations */}
        {msg.citations.length > 0 && (
          <div className="mt-3 pt-2.5 border-t" style={{ borderColor: 'var(--notebook-border)' }}>
            <button
              type="button"
              onClick={() => setShowCitations(showCitations === msg.id ? null : msg.id)}
              className="flex items-center gap-1.5 text-sm font-medium transition-all duration-200 rounded-md px-2 py-1.5 opacity-70 hover:opacity-100 hover:bg-[var(--notebook-hover)]"
              aria-expanded={showCitations === msg.id}
              aria-controls={`citations-${msg.id}`}
              aria-label={`${msg.citations.length} citation${msg.citations.length > 1 ? 's' : ''} disponibles`}
            >
              <Quote className="w-4 h-4" />
              <span>
                {msg.citations.length} citation{msg.citations.length > 1 ? 's' : ''}
              </span>
              <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showCitations === msg.id ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {showCitations === msg.id && (
                <motion.div
                  id={`citations-${msg.id}`}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  {/* Conteneur scrollable avec hauteur max */}
                  <div
                    className="mt-3 space-y-3 max-h-96 overflow-y-auto custom-scrollbar"
                    onMouseLeave={() => {
                      // Ne pas fermer le tooltip si on quitte juste pour scroller
                      const relatedTarget = document.querySelector(`#citations-${msg.id} :hover`);
                      if (!relatedTarget) setHoveredCitation(null);
                    }}
                  >
                    {msg.citations.map((cit, i) => (
                      <div
                        key={cit.chunkId || i}
                        className="p-3 rounded-lg transition-all duration-200 hover:shadow-sm hover:ring-1 hover:ring-[var(--accent-primary)]/30"
                        style={{
                          backgroundColor: 'var(--bg-base)',
                          color: 'var(--text-muted)',
                        }}
                      >
                        {/* Header avec titre + pertinence */}
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="font-medium text-[var(--text-primary)] truncate">
                            {cit.sourceTitle}
                          </span>
                          <span
                            className="px-2 py-0.5 rounded-full text-xs font-semibold"
                            style={{
                              backgroundColor: 'var(--accent-subtle)',
                              color: 'var(--accent-primary)',
                            }}
                          >
                            {(cit.relevance * 100).toFixed(0)}% pertinent
                          </span>
                        </div>

                        {/* Extrait avec affichage complet au clic */}
                        <p className="text-sm opacity-80 leading-relaxed line-clamp-3 cursor-pointer">
                          {cit.excerpt}
                        </p>

                        {/* Bouton pour voir le détail */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onFetchCitation(cit, e.clientX, e.clientY);
                          }}
                          className="text-xs opacity-60 hover:opacity-100 transition-opacity mt-1 flex items-center gap-1"
                          style={{ color: 'var(--accent-primary)' }}
                        >
                          Voir le détail <ExternalLink className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  );
});
