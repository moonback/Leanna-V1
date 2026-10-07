/**
 * ThreadBar — sélecteur de fil de discussion (dropdown), compteur de tokens
 * estimé, et bouton « Nouveau ». Composant présentationnel.
 */

import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageCircle, ChevronDown, Trash2, MessageSquarePlus } from 'lucide-react';
import { SPRING_UI } from '../motion.js';
import type { ChatMessage, ChatThreadSummary } from './types.js';

interface Props {
  threads: ChatThreadSummary[];
  activeThreadId: string | null;
  showThreadList: boolean;
  setShowThreadList: (v: boolean) => void;
  messages: ChatMessage[];
  onSwitchThread: (threadId: string | null) => void;
  onDeleteThread: (threadId: string) => void;
  onNewThread: () => void;
  prefersReducedMotion: boolean | null;
  /** Contrôle de l'assistant vocal, rendu à côté du bouton « Nouveau ». */
  voiceSlot?: ReactNode;
}

export function ThreadBar({
  threads, activeThreadId, showThreadList, setShowThreadList,
  messages, onSwitchThread, onDeleteThread, onNewThread, prefersReducedMotion,
  voiceSlot,
}: Props) {
  return (
    <div
      className="mx-auto flex w-full max-w-4xl flex-shrink-0 items-center gap-2 px-5 py-4 lg:px-8"
      style={{ borderColor: 'transparent', backgroundColor: 'transparent' }}
    >
      {/* Thread selector */}
      <div className="relative flex-1 min-w-0">
        <button
          onClick={() => setShowThreadList(!showThreadList)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full text-smfont-medium transition-all hover:bg-[var(--bg-hover)] max-w-[250px]"
          style={{ color: 'var(--text-primary)' }}
        >
          <MessageCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--accent-primary)' }} />
          <span className="truncate">
            {threads.find(t => t.id === activeThreadId)?.title || 'Conversation principale'}
          </span>
          <ChevronDown className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--text-dimmed)' }} />
        </button>

        {/* Thread dropdown */}
        <AnimatePresence>
          {showThreadList && (
            <motion.div
              initial={{ opacity: 0, y: 4, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.95 }}
              transition={prefersReducedMotion ? { duration: 0.1 } : SPRING_UI}
              style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)', transformOrigin: 'top left' }}
              className="absolute top-full left-0 mt-1 z-40 w-72 rounded-xl overflow-hidden shadow-xl"
            >
              <div className="max-h-60 overflow-y-auto custom-scrollbar">
                {/* Main conversation option */}
                <div
                  role="button"
                  tabIndex={0}
                  className={`flex items-center gap-2 px-4 py-2.5 transition-colors hover:bg-[var(--accent-subtle)] cursor-pointer border-b ${activeThreadId === null ? 'bg-[var(--accent-subtle)]' : ''}`}
                  style={{ borderColor: 'var(--border-base)' }}
                  onClick={() => onSwitchThread(null)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSwitchThread(null); } }}
                >
                  <MessageCircle className="w-3 h-3 flex-shrink-0" style={{ color: activeThreadId === null ? 'var(--accent-primary)' : 'var(--text-dimmed)' }} />
                  <span
                    className="flex-1 text-smfont-medium"
                    style={{ color: activeThreadId === null ? 'var(--accent-primary)' : 'var(--text-primary)' }}
                  >
                    Conversation principale
                  </span>
                </div>

                {/* Thread list */}
                {threads.length === 0 ? (
                  <p className="px-4 py-3 text-xs" style={{ color: 'var(--text-dimmed)' }}>
                    Pas de conversations supplémentaires.
                  </p>
                ) : (
                  threads.map(thread => (
                    <div
                      key={thread.id}
                      role="button"
                      tabIndex={0}
                      className={`group flex items-center gap-2 px-4 py-2.5 transition-colors hover:bg-[var(--accent-subtle)] cursor-pointer ${thread.id === activeThreadId ? 'bg-[var(--accent-subtle)]' : ''}`}
                      onClick={() => onSwitchThread(thread.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSwitchThread(thread.id); } }}
                    >
                      <MessageCircle className="w-3 h-3 flex-shrink-0" style={{ color: thread.id === activeThreadId ? 'var(--accent-primary)' : 'var(--text-dimmed)' }} />
                      <span
                        className="flex-1 text-smfont-medium truncate"
                        style={{ color: thread.id === activeThreadId ? 'var(--accent-primary)' : 'var(--text-primary)' }}
                      >
                        {thread.title}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); onDeleteThread(thread.id); }}
                        className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/10 transition-all"
                        style={{ color: 'var(--text-dimmed)' }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Token counter (estimated) */}
      <div
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-smfont-medium"
        style={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-base)', color: 'var(--text-dimmed)' }}
        title="Estimation des tokens utilisés dans cette conversation"
      >
        <span style={{ color: messages.length > 40 ? 'var(--color-error)' : messages.length > 20 ? 'var(--color-warning)' : 'var(--text-dimmed)' }}>
          ~{Math.round(messages.reduce((acc, m) => acc + m.content.length / 4, 0)).toLocaleString()}
        </span>
        <span>tokens</span>
      </div>

      {/* Assistant vocal — Interroger vos sources */}
      {voiceSlot}

      {/* New thread button */}
      <button
        onClick={onNewThread}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-smfont-medium transition-all hover:bg-[var(--accent-subtle)] active:scale-95"
        style={{ color: 'var(--accent-primary)', border: '1px solid var(--border-base)' }}
        title="Nouvelle conversation"
      >
        <MessageSquarePlus className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Nouveau</span>
      </button>
    </div>
  );
}
