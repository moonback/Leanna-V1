/**
 * AudioGenerator — colonne gauche de l'Audio Overview : carte de génération
 * (durée, options avancées, sources, instructions), bouton générer, et liste
 * des podcasts déjà produits.
 *
 * Composant présentationnel : l'état de configuration et les actions réseau
 * sont détenus par le parent (AudioOverviewPanel) et passés en props.
 */

import { motion, AnimatePresence } from 'motion/react';
import {
  Mic, Play, Loader2, Clock, Radio, Settings2, CheckSquare, Trash2,
} from 'lucide-react';
import type { AudioOverview, AudioSource, Tone } from './types.js';

interface Props {
  fullView: boolean;
  sources: AudioSource[];
  overviews: AudioOverview[];
  selectedOverview: AudioOverview | null;

  // Configuration de génération (détenue par le parent)
  duration: 'short' | 'medium' | 'long';
  setDuration: (d: 'short' | 'medium' | 'long') => void;
  showOptions: boolean;
  setShowOptions: (v: boolean) => void;
  tone: Tone;
  setTone: (t: Tone) => void;
  selectedSourceIds: string[];
  toggleSource: (sourceId: string) => void;
  selectAllSources: () => void;
  deselectAllSources: () => void;
  customInstructions: string;
  setCustomInstructions: (v: string) => void;

  generating: boolean;
  onGenerate: () => void;
  onSelectOverview: (ov: AudioOverview) => void;
  onDelete: (overviewId: string) => void;
  formatDuration: (seconds: number) => string;
}

export function AudioGenerator({
  fullView,
  sources,
  overviews,
  selectedOverview,
  duration,
  setDuration,
  showOptions,
  setShowOptions,
  tone,
  setTone,
  selectedSourceIds,
  toggleSource,
  selectAllSources,
  deselectAllSources,
  customInstructions,
  setCustomInstructions,
  generating,
  onGenerate,
  onSelectOverview,
  onDelete,
  formatDuration,
}: Props) {
  return (
    <div
      className={`${fullView ? 'w-full lg:w-80 flex-shrink-0 border-b lg:border-b-0 lg:border-r' : 'flex-1'} overflow-y-auto custom-scrollbar p-5 space-y-5`}
      style={{ borderColor: 'var(--notebook-border)', backgroundColor: 'var(--notebook-studio-bg)' }}
    >
      {/* Generator card */}
      <div
        className="p-5 rounded-2xl border space-y-4"
        style={{ backgroundColor: 'var(--notebook-card-bg)', borderColor: 'var(--notebook-border)' }}
      >
        <div className="flex items-center gap-2.5">
          <div className="notebook-empty-state-icon" style={{ width: 36, height: 36 }}>
            <Mic className="w-4 h-4" />
          </div>
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              Audio Overview
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Podcast IA conversationnel
            </p>
          </div>
        </div>

        {/* Duration selector */}
        <div className="space-y-2">
          <p className="text-xs font-semibold" style={{ color: 'var(--text-dimmed)' }}>Durée cible</p>
          <div className="flex gap-2">
            {([
              { key: 'short' as const, label: '~5 min', icon: '⚡' },
              { key: 'medium' as const, label: '~10 min', icon: '📻' },
              { key: 'long' as const, label: '~15 min', icon: '🎙️' },
            ]).map(opt => (
              <button
                key={opt.key}
                onClick={() => setDuration(opt.key)}
                className="flex-1 flex flex-col items-center gap-1 px-3 py-2.5 rounded-full text-xs font-medium transition-all"
                style={{
                  backgroundColor: duration === opt.key ? 'var(--accent-subtle)' : 'var(--bg-base)',
                  color: duration === opt.key ? 'var(--accent-primary)' : 'var(--text-muted)',
                  border: `1.5px solid ${duration === opt.key ? 'var(--accent-primary)' : 'var(--border-base)'}`,
                }}
              >
                <span className="text-sm">{opt.icon}</span>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Options toggle */}
        <button
          onClick={() => setShowOptions(!showOptions)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-full text-xs font-medium transition-all"
          style={{
            backgroundColor: showOptions ? 'var(--accent-subtle)' : 'var(--bg-base)',
            color: showOptions ? 'var(--accent-primary)' : 'var(--text-muted)',
            border: `1px solid ${showOptions ? 'var(--accent-primary)' : 'var(--border-base)'}`,
          }}
        >
          <Settings2 className="w-3.5 h-3.5" />
          Options avancées
        </button>

        {/* Advanced options */}
        <AnimatePresence>
          {showOptions && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="space-y-3 overflow-hidden"
            >
              {/* Tone selector */}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold" style={{ color: 'var(--text-dimmed)' }}>Ton</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {([
                    { key: 'casual' as Tone, label: '😊 Décontracté' },
                    { key: 'academic' as Tone, label: '🎓 Académique' },
                    { key: 'humorous' as Tone, label: '😄 Humoristique' },
                    { key: 'professional' as Tone, label: '💼 Professionnel' },
                  ]).map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => setTone(opt.key)}
                      className="px-2 py-1.5 rounded-full text-xs font-medium transition-all"
                      style={{
                        backgroundColor: tone === opt.key ? 'var(--accent-subtle)' : 'var(--bg-base)',
                        color: tone === opt.key ? 'var(--accent-primary)' : 'var(--text-muted)',
                        border: `1px solid ${tone === opt.key ? 'var(--accent-primary)' : 'var(--border-base)'}`,
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Source selector */}
              {sources.length > 1 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold" style={{ color: 'var(--text-dimmed)' }}>
                      Sources ({selectedSourceIds.length}/{sources.length})
                    </p>
                    <button
                      onClick={selectedSourceIds.length === sources.length ? deselectAllSources : selectAllSources}
                      className="text-xs font-medium"
                      style={{ color: 'var(--accent-primary)' }}
                    >
                      {selectedSourceIds.length === sources.length ? 'Aucune' : 'Toutes'}
                    </button>
                  </div>
                  <div className="max-h-28 overflow-y-auto custom-scrollbar space-y-1">
                    {sources.map(src => (
                      <button
                        key={src.id}
                        onClick={() => toggleSource(src.id)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-full text-left text-xs transition-all"
                        style={{
                          backgroundColor: selectedSourceIds.includes(src.id) ? 'var(--accent-subtle)' : 'transparent',
                          color: selectedSourceIds.includes(src.id) ? 'var(--accent-primary)' : 'var(--text-muted)',
                        }}
                      >
                        <CheckSquare
                          className="w-3 h-3 flex-shrink-0"
                          style={{ opacity: selectedSourceIds.includes(src.id) ? 1 : 0.3 }}
                        />
                        <span className="truncate">{src.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom instructions */}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold" style={{ color: 'var(--text-dimmed)' }}>
                  Instructions personnalisées
                </p>
                <textarea
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="Ex: Insiste sur les aspects pratiques, ajoute des exemples concrets..."
                  className="w-full px-3 py-2 rounded-full text-xs resize-none leading-relaxed"
                  style={{
                    backgroundColor: 'var(--bg-base)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-base)',
                  }}
                  rows={2}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={onGenerate}
          disabled={generating || selectedSourceIds.length === 0}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-xs font-bold transition-all active:scale-95 disabled:opacity-50 shadow-sm"
          style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}
        >
          {generating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Génération en cours...
            </>
          ) : (
            <>
              <Radio className="w-4 h-4" />
              Générer le podcast
            </>
          )}
        </button>
      </div>

      {/* Previous overviews */}
      {overviews.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>
            Podcasts ({overviews.length})
          </p>
          <AnimatePresence initial={false}>
            {overviews.map(ov => (
              <motion.div
                key={ov.id}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative group"
              >
                <button
                  onClick={() => onSelectOverview(ov)}
                  aria-label={`Sélectionner l'aperçu audio : ${ov.title}`}
                  className={`w-full p-3.5 rounded-xl border text-left transition-all hover:shadow-sm ${selectedOverview?.id === ov.id ? 'ring-1 ring-[var(--accent-primary)]' : ''}`}
                  style={{ borderColor: selectedOverview?.id === ov.id ? 'var(--accent-primary)' : 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: 'var(--accent-subtle)' }}
                    >
                      <Play className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                        {ov.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text-dimmed)' }}>
                          <Clock className="w-2.5 h-2.5" />
                          {formatDuration(ov.estimatedDuration)}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${ov.status === 'ready' ? 'bg-green-500/10 text-green-400' : ov.status === 'error' ? 'bg-red-500/10 text-red-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                          {ov.status === 'ready' ? '● Prêt' : ov.status === 'error' ? '● Erreur' : '● En cours'}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(ov.id); }}
                  className="absolute top-2 right-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/10"
                  style={{ color: 'var(--color-error)' }}
                  title="Supprimer"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
