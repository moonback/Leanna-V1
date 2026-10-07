/**
 * Composer — zone de saisie : barre de filtre de sources, menu slash, textarea,
 * boutons d'action (deep-dive / insights / compare / contexte / envoi), et barre
 * basse (indices, sélecteur de personnalité, export, effacer). Présentationnel.
 */

import { motion, AnimatePresence } from 'motion/react';
import {
  X, Filter, Telescope, Zap, GitCompare, Lightbulb, Send, Loader2, Download, Trash2,
} from 'lucide-react';
import { SPRING_UI } from '../motion.js';
import type { Personality } from './constants.js';
import type { ChatMessage } from './types.js';

interface Props {
  sources: { id: string; title: string }[];
  input: string;
  setInput: (v: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  loading: boolean;
  queuedCount: number;
  messages: ChatMessage[];
  selectedSources: string[];
  showSourceFilter: boolean;
  setShowSourceFilter: (v: boolean) => void;
  toggleSourceFilter: (sourceId: string) => void;
  clearSourceFilter: () => void;
  showSlashMenu: boolean;
  filteredSlashCommands: { cmd: string; desc: string; prompt: string }[];
  showContextMenu: boolean;
  setShowContextMenu: (v: boolean) => void;
  contextSuggestions: { label: string; prompt: string }[];
  personalities: Personality[];
  personality: string;
  setPersonality: (v: string) => void;
  showPersonalityMenu: boolean;
  setShowPersonalityMenu: (v: boolean) => void;
  currentPersonality: Personality;
  prefersReducedMotion: boolean | null;
  onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSubmit: () => void;
  onSend: (question: string) => void;
  onDeepDive: () => void;
  onInsights: () => void;
  onCompare: () => void;
  onExport: () => void;
  onClear: () => void;
}

export function Composer(props: Props) {
  const {
    sources, input, setInput, inputRef, loading, queuedCount, messages,
    selectedSources, showSourceFilter, setShowSourceFilter, toggleSourceFilter, clearSourceFilter,
    showSlashMenu, filteredSlashCommands, showContextMenu, setShowContextMenu, contextSuggestions,
    personalities, personality, setPersonality, showPersonalityMenu, setShowPersonalityMenu, currentPersonality,
    prefersReducedMotion, onInputChange, onKeyDown, onSubmit, onSend, onDeepDive, onInsights, onCompare, onExport, onClear,
  } = props;

  return (
    <div
      className="flex-shrink-0 px-5 pb-5 pt-3 lg:px-8"
      style={{ borderColor: 'transparent', backgroundColor: 'transparent' }}
    >
      {/* Source filter bar */}
      {showSourceFilter && sources.length > 0 && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="mb-2 overflow-hidden"
        >
          <div
            className="flex items-center gap-2 p-2.5 rounded-xl flex-wrap"
            style={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-base)' }}
          >
            <span className="text-smfont-semibold flex-shrink-0" style={{ color: 'var(--text-dimmed)' }}>
              Sources actives :
            </span>
            {sources.map(s => (
              <button
                key={s.id}
                onClick={() => toggleSourceFilter(s.id)}
                className={`px-2.5 py-1 rounded-full text-smfont-medium transition-all active:scale-95 ${
                  selectedSources.includes(s.id) || selectedSources.length === 0
                    ? 'ring-1 ring-[var(--accent-primary)]'
                    : 'opacity-40'
                }`}
                style={{
                  backgroundColor: selectedSources.includes(s.id) ? 'var(--accent-subtle)' : 'var(--bg-panel)',
                  color: selectedSources.includes(s.id) ? 'var(--accent-primary)' : 'var(--text-muted)',
                  border: '1px solid var(--border-base)',
                }}
              >
                {s.title.length > 25 ? s.title.slice(0, 25) + '…' : s.title}
              </button>
            ))}
            {selectedSources.length > 0 && (
              <button
                onClick={clearSourceFilter}
                className="px-2 py-1 rounded-full text-smfont-medium transition-all hover:bg-red-500/10"
                style={{ color: 'var(--text-muted)' }}
              >
                <X className="w-3 h-3 inline mr-0.5" />
                Reset
              </button>
            )}
          </div>
        </motion.div>
      )}

      {/* Slash command menu */}
      <AnimatePresence>
        {showSlashMenu && filteredSlashCommands.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="mb-2 rounded-xl overflow-hidden"
            style={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-base)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
          >
            {filteredSlashCommands.map((cmd) => (
              <button
                key={cmd.cmd}
                onClick={() => { setInput(''); onSend(cmd.prompt); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--accent-subtle)]"
              >
                <code className="text-smfont-mono font-semibold" style={{ color: 'var(--accent-primary)' }}>
                  {cmd.cmd}
                </code>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {cmd.desc}
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main input container */}
      <div
        className="relative mx-auto flex max-w-4xl items-end gap-0 rounded-xl transition-shadow duration-200 focus-within:ring-2"
        style={{
          backgroundColor: 'var(--notebook-surface)',
          border: '1px solid var(--notebook-border)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
          ['--tw-ring-color' as never]: 'var(--accent-primary)',
        }}
      >
        {/* Left actions — filter */}
        <div className="flex items-center gap-0.5 pl-2 py-2 flex-shrink-0">
          {sources.length > 1 && (
            <button
              onClick={() => setShowSourceFilter(!showSourceFilter)}
              className={`p-2 rounded-lg transition-all active:scale-90 ${showSourceFilter || selectedSources.length > 0 ? '' : 'opacity-50 hover:opacity-100'}`}
              style={{ color: selectedSources.length > 0 ? 'var(--accent-primary)' : 'var(--text-dimmed)' }}
              title="Filtrer les sources"
            >
              <Filter className="w-4 h-4" />
              {selectedSources.length > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full text-smfont-bold flex items-center justify-center"
                  style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}
                >
                  {selectedSources.length}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Textarea */}
        <textarea
          ref={inputRef}
          value={input}
          onChange={onInputChange}
          onKeyDown={onKeyDown}
          placeholder={'Posez une question sur vos sources... (/ pour les commandes)'}
          rows={1}
          className="flex-1 bg-transparent px-4 py-4 text-sm leading-6 outline-none resize-none placeholder:text-[var(--text-dimmed)]"
          style={{
            color: 'var(--text-primary)',
            minHeight: '58px',
            maxHeight: '120px',
          }}
        />

        {/* Right action buttons */}
        <div className="relative flex items-center gap-1 px-2 py-2 flex-shrink-0 context-menu-container">
          <motion.button
            onClick={onDeepDive}
            disabled={!input.trim() || loading}
            whileTap={input.trim() && !loading ? { scale: 0.88 } : undefined}
            transition={{ duration: 0.1 }}
            className="p-2 rounded-lg disabled:opacity-25 hover:bg-[var(--accent-subtle)] transition-colors duration-150"
            style={{ color: 'var(--accent-primary)' }}
            title="Deep Dive — exploration approfondie"
          >
            <Telescope className="w-4 h-4" />
          </motion.button>

          <motion.button
            onClick={onInsights}
            disabled={loading}
            whileTap={!loading ? { scale: 0.88 } : undefined}
            transition={{ duration: 0.1 }}
            className="p-2 rounded-lg disabled:opacity-25 hover:bg-amber-500/10 transition-colors duration-150"
            style={{ color: 'var(--color-warning)' }}
            title="Extraire les insights clés"
          >
            <Zap className="w-4 h-4" />
          </motion.button>

          {sources.length >= 2 && (
            <motion.button
              onClick={onCompare}
              disabled={loading}
              whileTap={!loading ? { scale: 0.88 } : undefined}
              transition={{ duration: 0.1 }}
              className="p-2 rounded-lg disabled:opacity-25 hover:bg-violet-500/10 transition-colors duration-150"
              style={{ color: 'var(--color-accent-alt)' }}
              title="Comparer les sources"
            >
              <GitCompare className="w-4 h-4" />
            </motion.button>
          )}

          {/* Context Menu Button */}
          <motion.button
            onClick={() => setShowContextMenu(!showContextMenu)}
            disabled={loading}
            whileTap={!loading ? { scale: 0.88 } : undefined}
            transition={{ duration: 0.1 }}
            className="p-2 rounded-lg disabled:opacity-25 hover:bg-[var(--accent-subtle)] transition-colors duration-150"
            style={{ color: 'var(--accent-primary)' }}
            title="Demandes avec contexte complet"
          >
            <Lightbulb className="w-4 h-4" />
          </motion.button>

          {/* Context Menu Dropdown */}
          <AnimatePresence>
            {showContextMenu && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="absolute bottom-full right-0 mb-1 z-50 w-60 rounded-xl overflow-hidden shadow-xl"
                style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)' }}
              >
                <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--border-base)' }}>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-dimmed)' }}>
                    Demandes avec contexte complet
                  </p>
                </div>
                {contextSuggestions.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => { setInput(''); onSend(s.prompt); setShowContextMenu(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[var(--accent-subtle)]"
                  >
                    <Lightbulb className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--accent-primary)' }} />
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{s.label}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Separator */}
          <div className="w-px h-5 mx-1" style={{ backgroundColor: 'var(--border-base)' }} />

          {/* Send button */}
          <motion.button
            onClick={onSubmit}
            disabled={!input.trim() || loading}
            whileTap={input.trim() && !loading ? { scale: 0.88 } : undefined}
            transition={{ duration: 0.1 }}
            className="p-2.5 rounded-full disabled:opacity-30 transition-colors duration-150"
            style={{
              backgroundColor: input.trim() && !loading ? 'var(--notebook-accent)' : 'var(--notebook-surface-muted)',
              color: input.trim() && !loading ? 'var(--text-primary)' : 'var(--text-dimmed)',
            }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </motion.button>
        </div>
      </div>

      {/* Bottom bar — hints + personality + secondary actions */}
      <div className="flex items-center justify-between mt-2 px-1">
        <div className="flex items-center gap-2">
          <p className="text-xs" style={{ color: 'var(--text-dimmed)' }}>
            Entrée pour envoyer • / commandes
            {queuedCount > 0 && (
              <span style={{ color: 'var(--accent-primary)' }}>
                {' '}• {queuedCount} en attente
              </span>
            )}
            {selectedSources.length > 0 && (
              <span style={{ color: 'var(--accent-primary)' }}> • {selectedSources.length} source{selectedSources.length > 1 ? 's' : ''}</span>
            )}
          </p>

          {/* Personality selector */}
          <div className="relative">
            <button
              onClick={() => setShowPersonalityMenu(!showPersonalityMenu)}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-smfont-medium transition-all hover:bg-[var(--accent-subtle)]"
              style={{ color: 'var(--text-muted)', border: '1px solid var(--border-base)' }}
            >
              {(() => { const PIcon = currentPersonality.icon; return <span className="inline-flex items-center"><PIcon size={13} /></span>; })()}
              <span>{currentPersonality.label}</span>
            </button>

            <AnimatePresence>
              {showPersonalityMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 4, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.95 }}
                  transition={prefersReducedMotion ? { duration: 0.1 } : SPRING_UI}
                  className="absolute bottom-full left-0 mb-1 z-40 w-56 rounded-xl overflow-hidden shadow-xl"
                  style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)', transformOrigin: 'bottom left' }}
                >
                  <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--border-base)' }}>
                    <p className="text-smfont-semibold" style={{ color: 'var(--text-dimmed)' }}>Ton de l'assistant</p>
                  </div>
                  {personalities.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { setPersonality(p.id); setShowPersonalityMenu(false); }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[var(--accent-subtle)] ${personality === p.id ? 'bg-[var(--accent-subtle)]' : ''}`}
                    >
                      {(() => { const PIcon = p.icon; return <span className="inline-flex items-center"><PIcon size={14} style={{ color: 'var(--text-muted)' }} /></span>; })()}
                      <div className="min-w-0 flex-1">
                        <p className="text-smfont-medium" style={{ color: personality === p.id ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
                          {p.label}
                        </p>
                        <p className="text-smtruncate" style={{ color: 'var(--text-dimmed)' }}>{p.desc}</p>
                      </div>
                      {personality === p.id && (
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: 'var(--accent-primary)' }} />
                      )}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <>
              <button
                onClick={onExport}
                className="p-1.5 rounded-md transition-all hover:bg-[var(--accent-subtle)] active:scale-90"
                style={{ color: 'var(--text-muted)' }}
                title="Exporter en Markdown"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onClear}
                className="p-1.5 rounded-md transition-all hover:bg-red-500/10 active:scale-90"
                style={{ color: 'var(--text-muted)' }}
                title="Effacer l'historique"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
