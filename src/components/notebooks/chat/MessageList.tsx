/**
 * MessageList — zone scrollable du chat : état de chargement, accueil +
 * suggestions, liste des messages (MessageItem), aperçu du streaming, boutons
 * stop / deep-dive / loading / follow-ups, bouton scroll-to-bottom, et le
 * tooltip de citation survolée. Composant présentationnel.
 */

import { motion, AnimatePresence } from 'motion/react';
import {
  Loader2, MessageCircle, Lightbulb, RefreshCw, StopCircle, Telescope, ArrowDown, Quote,
} from 'lucide-react';
import { SPRING_UI, SPRING_MOMENTUM_CHAT as SPRING_MOMENTUM } from '../motion.js';
import { renderMessageContent } from './renderHelpers.js';
import { MessageItem } from './MessageItem.js';
import type { Citation, ChatMessage } from './types.js';

interface Props {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  loadingHistory: boolean;
  messages: ChatMessage[];
  suggestions: string[];
  suggestionOffset: number;
  setSuggestionOffset: React.Dispatch<React.SetStateAction<number>>;
  followUps: string[];
  followUpOffset: number;
  setFollowUpOffset: React.Dispatch<React.SetStateAction<number>>;
  streamingText: string;
  deepDiveProgress: string;
  loading: boolean;
  showScrollBtn: boolean;
  hoveredCitation: { citation: Citation; fullContent: string; x: number; y: number } | null;
  prefersReducedMotion: boolean | null;
  onSend: (question: string) => void;
  onStopStreaming: () => void;
  scrollToBottom: () => void;
  // Props transmises à MessageItem
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

export function MessageList(props: Props) {
  const {
    scrollContainerRef, messagesEndRef, onScroll, loadingHistory, messages,
    suggestions, suggestionOffset, setSuggestionOffset,
    followUps, followUpOffset, setFollowUpOffset,
    streamingText, deepDiveProgress, loading, showScrollBtn, hoveredCitation,
    prefersReducedMotion, onSend, onStopStreaming, scrollToBottom,
  } = props;

  return (
    <>
      <div
        ref={scrollContainerRef}
        onScroll={onScroll}
        className="relative flex-1 overflow-y-auto custom-scrollbar px-5 py-6 lg:px-8"
      >
        {loadingHistory ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--accent-primary)' }} />
          </div>
        ) : messages.length === 0 ? (
          /* Welcome state */
          <div className="flex flex-col items-center justify-center py-16 gap-6 max-w-lg mx-auto">
            <div className="notebook-empty-state-icon" style={{ width: 64, height: 64 }}>
              <MessageCircle className="w-7 h-7" />
            </div>
            <div className="text-center space-y-2">
              <p className="text-lg font-medium notebook-heading" style={{ color: 'var(--text-primary)' }}>
                Interrogez vos sources
              </p>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Posez une question et l'IA répondra en citant les passages pertinents de vos documents.
              </p>
            </div>

            {/* Suggestions — 2 visibles + bouton pour en voir d'autres */}
            {suggestions.length > 0 && (
              <div className="w-full mt-4 space-y-3">
                <p className="text-smfont-medium flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
                  <Lightbulb className="w-3.5 h-3.5" />
                  Suggestions
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {suggestions.slice(suggestionOffset, suggestionOffset + 2).map((s, i) => (
                    <button
                      key={`${suggestionOffset}-${i}`}
                      onClick={() => onSend(s)}
                      className="notebook-chip text-left px-3 py-2.5 rounded-full text-sm leading-snug transition-all hover:scale-[1.02] hover:shadow-sm"
                      style={{
                        whiteSpace: 'normal',
                        textAlign: 'left',
                        backgroundColor: 'var(--notebook-chat-ai)',
                        border: '1px solid var(--notebook-border)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <span className="line-clamp-2">{s}</span>
                    </button>
                  ))}
                </div>
                {suggestions.length > 2 && (
                  <button
                    onClick={() => setSuggestionOffset((prev) => (prev + 2) >= suggestions.length ? 0 : prev + 2)}
                    className="flex items-center gap-1.5 text-smfont-medium px-3 py-1.5 rounded-full transition-colors hover:opacity-80"
                    style={{ color: 'var(--accent-primary)' }}
                  >
                    <RefreshCw className="w-3 h-3" />
                    Autres suggestions
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <MessageItem
                key={msg.id}
                msg={msg}
                prefersReducedMotion={prefersReducedMotion}
                spring={SPRING_UI}
                loading={loading}
                editingMsgId={props.editingMsgId}
                editingContent={props.editingContent}
                setEditingContent={props.setEditingContent}
                copiedMsgId={props.copiedMsgId}
                speakingMsgId={props.speakingMsgId}
                feedbackMap={props.feedbackMap}
                showCitations={props.showCitations}
                setShowCitations={props.setShowCitations}
                setHoveredCitation={props.setHoveredCitation}
                onCopy={props.onCopy}
                onRetry={props.onRetry}
                onTTS={props.onTTS}
                onSaveToNote={props.onSaveToNote}
                onOpenFolderPicker={props.onOpenFolderPicker}
                onFeedback={props.onFeedback}
                onEditStart={props.onEditStart}
                onEditCancel={props.onEditCancel}
                onEditSubmit={props.onEditSubmit}
                onFetchCitation={props.onFetchCitation}
              />
            ))}

            {/* Streaming text */}
            {streamingText && (
              <motion.div
                initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={prefersReducedMotion ? { duration: 0.1 } : SPRING_UI}
                className="flex justify-start max-w-4xl mx-auto"
              >
                <div
                  className="notebook-chat-message w-full"
                  data-role="assistant"
                  style={{ border: '1px solid var(--notebook-border)' }}
                >
                  {renderMessageContent(streamingText)}
                  <span className="inline-block w-1.5 h-4 ml-0.5 animate-pulse rounded-sm" style={{ backgroundColor: 'var(--notebook-accent)' }} />
                </div>
              </motion.div>
            )}

            {/* Stop streaming button */}
            {loading && (streamingText || deepDiveProgress) && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex justify-center"
              >
                <button
                  onClick={onStopStreaming}
                  className="flex items-center gap-2 px-4 py-2 rounded-full text-smfont-medium transition-all hover:scale-105 active:scale-95"
                  style={{
                    backgroundColor: 'var(--bg-panel)',
                    border: '1px solid var(--border-base)',
                    color: 'var(--text-secondary)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                  }}
                >
                  <StopCircle className="w-3.5 h-3.5" style={{ color: 'var(--color-error)' }} />
                  Arrêter la génération
                </button>
              </motion.div>
            )}

            {/* Deep dive progress */}
            {deepDiveProgress && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex justify-start"
              >
                <div
                  className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-xs"
                  style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)', border: '1px solid var(--accent-primary)' }}
                >
                  <Telescope className="w-4 h-4 animate-pulse" />
                  <span className="font-medium">{deepDiveProgress}</span>
                </div>
              </motion.div>
            )}

            {/* Loading indicator */}
            {loading && !streamingText && !deepDiveProgress && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex justify-start max-w-4xl mx-auto"
              >
                <div
                  className="notebook-chat-message"
                  data-role="assistant"
                  style={{ border: '1px solid var(--notebook-border)', padding: '16px 20px' }}
                >
                  <div className="flex gap-1.5">
                    <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: 'var(--notebook-accent)', animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: 'var(--notebook-accent)', animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: 'var(--notebook-accent)', animationDelay: '300ms' }} />
                  </div>
                </div>
              </motion.div>
            )}

            {/* Follow-ups */}
            {followUps.length > 0 && !loading && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="space-y-3 pt-4 max-w-4xl mx-auto"
              >
                <p className="text-smfont-medium flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
                  <Lightbulb className="w-3.5 h-3.5" />
                  Questions de suivi
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {followUps.slice(followUpOffset, followUpOffset + 2).map((q, i) => (
                    <button
                      key={`${followUpOffset}-${i}`}
                      onClick={() => onSend(q)}
                      className="notebook-chip text-left px-3 py-2.5 rounded-full text-sm leading-snug transition-all hover:scale-[1.02] hover:shadow-sm"
                      style={{
                        whiteSpace: 'normal',
                        textAlign: 'left',
                        backgroundColor: 'var(--notebook-chat-ai)',
                        border: '1px solid var(--notebook-border)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <span className="line-clamp-2">{q}</span>
                    </button>
                  ))}
                </div>
                {followUps.length > 2 && (
                  <button
                    onClick={() => setFollowUpOffset((prev) => (prev + 2) >= followUps.length ? 0 : prev + 2)}
                    className="flex items-center gap-1.5 text-smfont-medium px-3 py-1.5 rounded-full transition-colors hover:opacity-80"
                    style={{ color: 'var(--accent-primary)' }}
                  >
                    <RefreshCw className="w-3 h-3" />
                    Autres suggestions
                  </button>
                )}
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}

        {/* Scroll to bottom button */}
        <AnimatePresence>
          {showScrollBtn && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={prefersReducedMotion ? { duration: 0.1 } : SPRING_MOMENTUM}
              whileTap={{ scale: 0.88 }}
              onClick={scrollToBottom}
              className="fixed bottom-28 right-8 p-2.5 rounded-full shadow-lg z-30 hover:opacity-90 transition-opacity duration-150"
              style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}
            >
              <ArrowDown className="w-4 h-4" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Citation hover tooltip */}
      <AnimatePresence>
        {hoveredCitation && (
          <motion.div
            initial={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.95 }}
            transition={{ duration: 0.1 }}
            className="fixed z-50 max-w-md p-4 rounded-xl shadow-2xl pointer-events-none"
            style={{
              left: Math.min(hoveredCitation.x, window.innerWidth - 420),
              top: Math.max(hoveredCitation.y - 200, 8),
              backgroundColor: 'var(--bg-panel)',
              border: '1px solid var(--border-focus)',
              color: 'var(--text-primary)',
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Quote className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--accent-primary)' }} />
              <span className="text-smfont-semibold truncate">{hoveredCitation.citation.sourceTitle}</span>
              <span
                className="text-smpx-1.5 py-0.5 rounded-full font-bold flex-shrink-0"
                style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}
              >
                {(hoveredCitation.citation.relevance * 100).toFixed(0)}%
              </span>
            </div>
            <p className="text-smleading-relaxed whitespace-pre-wrap max-h-44 overflow-y-auto custom-scrollbar" style={{ color: 'var(--text-muted)' }}>
              {hoveredCitation.fullContent}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
