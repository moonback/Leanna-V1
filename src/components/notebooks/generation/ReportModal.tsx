/**
 * ReportModal — modal « Générer un rapport » : suggestions IA + grille complète
 * des types de rapports. Composant présentationnel.
 */

import { motion, AnimatePresence } from 'motion/react';
import { FileBarChart, X, Lightbulb, RefreshCw, Sparkles, Zap, ArrowRight } from 'lucide-react';
import type { SpringTransition, ScrimStyle } from '../motionTypes.js';
import { DOC_TYPES, REPORT_TYPES } from './constants.js';

interface Suggestion {
  type: string;
  title: string;
  description: string;
  reason: string;
  relevance: number;
  recommendedSourceIds: string[];
}

interface Props {
  show: boolean;
  sources: { id: string }[];
  suggestions: Suggestion[];
  loadingSuggestions: boolean;
  onClose: () => void;
  onLoadSuggestions: () => void;
  onSelectSuggestion: (suggestion: Suggestion) => void;
  onSelectType: (type: string) => void;
  scrimSpring: SpringTransition;
  scrimStyle: ScrimStyle;
  modalSpring: SpringTransition;
  reduceMotion: boolean | null;
}

export function ReportModal({
  show, sources, suggestions, loadingSuggestions,
  onClose, onLoadSuggestions, onSelectSuggestion, onSelectType,
  scrimSpring, scrimStyle, modalSpring, reduceMotion,
}: Props) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={scrimSpring}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={scrimStyle}
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={reduceMotion ? { opacity: 0 } : { scale: 0.95, opacity: 0, y: 10 }}
            animate={reduceMotion ? { opacity: 1 } : { scale: 1, opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { scale: 0.95, opacity: 0, y: 10 }}
            transition={modalSpring}
            className="w-full max-w-7xl max-h-[85vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden"
            style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)' }}
          >
            {/* Modal header */}
            <div className="flex items-center gap-3 px-6 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--border-base)' }}>
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ backgroundColor: 'color-mix(in srgb, var(--color-error) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--color-error) 25%, transparent)' }}
              >
                <FileBarChart className="w-5 h-5" style={{ color: 'var(--color-error)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                  Générer un rapport
                </h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Choisissez un type ou suivez les suggestions basées sur vos {sources.length} source{sources.length > 1 ? 's' : ''}
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg transition-all hover:bg-[var(--bg-hover)] active:scale-95"
                style={{ color: 'var(--text-muted)' }}
                // autoFocus justifié : point d'entrée du focus-trap à l'ouverture
                // de la modale (bouton de fermeture), focus attendu.
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal content — scrollable */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
              {/* Suggestions IA */}
              <div
                className="rounded-2xl p-4 space-y-4"
                style={{
                  background: 'linear-gradient(135deg, color-mix(in srgb, var(--color-warning) 7%, transparent), color-mix(in srgb, var(--accent-primary) 5%, transparent))',
                  border: '1px solid color-mix(in srgb, var(--color-warning) 20%, transparent)',
                }}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--color-warning) 15%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--color-warning) 30%, transparent)',
                    }}
                  >
                    <Lightbulb className="w-4 h-4" style={{ color: 'var(--color-warning)' }} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>
                      Suggestions pour vos sources
                    </h3>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-dimmed)' }}>
                      Recommandations générées par l'IA
                    </p>
                  </div>
                  {!loadingSuggestions && suggestions.length > 0 && (
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0"
                      style={{ backgroundColor: 'color-mix(in srgb, var(--color-warning) 15%, transparent)', color: 'var(--color-warning)' }}
                    >
                      {suggestions.length}
                    </span>
                  )}
                  {!loadingSuggestions && (
                    <button
                      onClick={onLoadSuggestions}
                      className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all hover:shadow-sm active:scale-95 flex-shrink-0"
                      style={{
                        border: '1px solid color-mix(in srgb, var(--color-warning) 35%, transparent)',
                        color: 'var(--color-warning)',
                        backgroundColor: 'color-mix(in srgb, var(--color-warning) 8%, transparent)',
                      }}
                      title="Demander de nouvelles suggestions (actualisation manuelle)"
                    >
                      <RefreshCw className="w-3 h-3" />
                      {suggestions.length > 0 ? 'Rafraîchir' : 'Obtenir des suggestions'}
                    </button>
                  )}
                </div>

                {loadingSuggestions && (
                  <div className="grid grid-cols-2 gap-2.5">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 p-3.5 rounded-xl animate-pulse"
                        style={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-base)' }}
                      >
                        <div
                          className="w-9 h-9 rounded-xl flex-shrink-0"
                          style={{ backgroundColor: 'color-mix(in srgb, var(--text-muted) 12%, transparent)' }}
                        />
                        <div className="flex-1 space-y-2 pt-0.5">
                          <div className="h-3 w-3/4 rounded-full" style={{ backgroundColor: 'color-mix(in srgb, var(--text-muted) 15%, transparent)' }} />
                          <div className="h-2.5 w-full rounded-full" style={{ backgroundColor: 'color-mix(in srgb, var(--text-muted) 10%, transparent)' }} />
                          <div className="h-2.5 w-2/3 rounded-full" style={{ backgroundColor: 'color-mix(in srgb, var(--text-muted) 10%, transparent)' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!loadingSuggestions && suggestions.length > 0 && (
                  <div className="grid grid-cols-2 gap-2.5">
                    {suggestions.map((suggestion, idx) => {
                      const docType = REPORT_TYPES.find(t => t.key === suggestion.type) || DOC_TYPES.find(t => t.key === suggestion.type);
                      const SugIcon = docType?.icon || Sparkles;
                      const docColor = docType?.color || 'var(--text-muted)';
                      const relevance = Math.max(0, Math.min(100, suggestion.relevance ?? 0));
                      return (
                        <button
                          key={idx}
                          onClick={() => onSelectSuggestion(suggestion)}
                          className="relative w-full flex flex-col gap-2.5 p-3.5 rounded-xl border transition-all hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98] text-left group overflow-hidden"
                          style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-base)' }}
                        >
                          <span
                            className="absolute left-0 top-0 bottom-0 w-1 transition-all group-hover:w-1.5"
                            style={{ backgroundColor: docColor, opacity: 0.8 }}
                          />
                          <div className="flex items-start gap-3 pl-1.5">
                            <div
                              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110"
                              style={{ backgroundColor: `color-mix(in srgb, ${docColor} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${docColor} 25%, transparent)` }}
                            >
                              <SugIcon className="w-4 h-4" style={{ color: docColor }} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold leading-tight truncate" style={{ color: 'var(--text-primary)' }}>
                                {suggestion.title}
                              </p>
                              <p className="text-xs mt-1 leading-relaxed line-clamp-2" style={{ color: 'var(--text-muted)' }}>
                                {suggestion.reason}
                              </p>
                            </div>
                          </div>

                          <div className="pl-1.5 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium" style={{ color: 'var(--text-dimmed)' }}>
                                Pertinence
                              </span>
                              <span className="text-xs font-bold" style={{ color: docColor }}>
                                {relevance}%
                              </span>
                            </div>
                            <div
                              className="h-1.5 w-full rounded-full overflow-hidden"
                              style={{ backgroundColor: 'color-mix(in srgb, var(--text-muted) 12%, transparent)' }}
                            >
                              <span
                                className="block h-full rounded-full transition-all"
                                style={{ width: `${relevance}%`, backgroundColor: docColor }}
                              />
                            </div>
                          </div>

                          <div className="flex items-center justify-center gap-1.5 pl-1.5 pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="text-xs font-semibold" style={{ color: 'var(--accent-primary)' }}>Générer ce rapport</span>
                            <Zap className="w-3.5 h-3.5" style={{ color: 'var(--color-warning)' }} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {!loadingSuggestions && suggestions.length === 0 && (
                  <div
                    className="flex flex-col items-center gap-3 py-6 px-4 rounded-xl text-center"
                    style={{ backgroundColor: 'var(--bg-base)', border: '1px dashed color-mix(in srgb, var(--color-warning) 30%, transparent)' }}
                  >
                    <div
                      className="w-11 h-11 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: 'color-mix(in srgb, var(--color-warning) 12%, transparent)' }}
                    >
                      <Sparkles className="w-5 h-5" style={{ color: 'var(--color-warning)' }} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                        Aucune suggestion pour le moment
                      </p>
                      <p className="text-xs mt-1 max-w-xs" style={{ color: 'var(--text-dimmed)' }}>
                        Lancez l'analyse pour que l'IA identifie les rapports les plus pertinents à partir de vos sources.
                      </p>
                    </div>
                    <button
                      onClick={onLoadSuggestions}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold transition-all hover:shadow-sm active:scale-95"
                      style={{
                        backgroundColor: 'color-mix(in srgb, var(--color-warning) 14%, transparent)',
                        color: 'var(--color-warning)',
                        border: '1px solid color-mix(in srgb, var(--color-warning) 30%, transparent)',
                      }}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Obtenir des suggestions
                    </button>
                  </div>
                )}
              </div>

              {/* Séparateur */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px" style={{ backgroundColor: 'var(--border-base)' }} />
                <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>
                  ou choisir un type de rapport
                </span>
                <div className="flex-1 h-px" style={{ backgroundColor: 'var(--border-base)' }} />
              </div>

              {/* Grille de tous les types */}
              <div className="grid grid-cols-2 gap-2.5">
                {REPORT_TYPES.map(({ key, label, icon: Icon, desc, color }) => (
                  <button
                    key={key}
                    onClick={() => onSelectType(key)}
                    className="relative flex items-start gap-3 p-3.5 pl-4 rounded-xl border transition-all hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.97] text-left group overflow-hidden"
                    style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-base)' }}
                  >
                    <span
                      className="absolute left-0 top-0 bottom-0 w-1 transition-all group-hover:w-1.5"
                      style={{ backgroundColor: color, opacity: 0.7 }}
                    />
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 transition-transform group-hover:scale-110"
                      style={{ backgroundColor: `${color}12`, border: `1px solid ${color}25` }}
                    >
                      <Icon className="w-4 h-4" style={{ color }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                        {label}
                      </p>
                      <p className="text-xs mt-0.5 leading-snug" style={{ color: 'var(--text-dimmed)' }}>
                        {desc}
                      </p>
                    </div>
                    <ArrowRight
                      className="w-3.5 h-3.5 flex-shrink-0 mt-1 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all"
                      style={{ color }}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-between px-6 py-3 border-t flex-shrink-0" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-secondary)' }}>
              <p className="text-xs" style={{ color: 'var(--text-dimmed)' }}>
                {sources.length} source{sources.length > 1 ? 's' : ''} disponible{sources.length > 1 ? 's' : ''} • Le rapport sera généré en streaming
              </p>
              <button
                onClick={onClose}
                className="px-3 py-1.5 rounded-full text-xs font-medium transition-all hover:bg-[var(--bg-hover)]"
                style={{ color: 'var(--text-muted)' }}
              >
                Annuler
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
