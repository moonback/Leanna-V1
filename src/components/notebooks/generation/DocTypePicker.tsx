/**
 * DocTypePicker — barre de configuration (sources / prompt), dropdowns associés,
 * bouton « Rapport complet » (ouvre le modal) et grille des types de documents.
 * Composant présentationnel.
 */

import { motion, AnimatePresence } from 'motion/react';
import { Filter, PenLine, FileBarChart, ArrowRight, Loader2 } from 'lucide-react';
import type { SpringTransition } from '../motionTypes.js';
import { DOC_TYPES } from './constants.js';
import type { SourceItem } from './types.js';

interface Props {
  sources: SourceItem[];
  showSourceFilter: boolean;
  setShowSourceFilter: (v: boolean) => void;
  showCustomPrompt: boolean;
  setShowCustomPrompt: (v: boolean) => void;
  selectedSourceIds: string[];
  setSelectedSourceIds: (ids: string[]) => void;
  toggleSourceSelection: (sourceId: string) => void;
  customInstructions: string;
  setCustomInstructions: (v: string) => void;
  activeGenerationIds: Set<string>;
  generationQueue: { id: string; type: string }[];
  onOpenReportModal: () => void;
  onGenerate: (type: string) => void;
  onOpenInfographic: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reportModalTriggerRef: React.RefObject<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  infographicModalTriggerRef: React.RefObject<any>;
  reduceMotion: boolean | null;
  modalSpring: SpringTransition;
}

export function DocTypePicker({
  sources,
  showSourceFilter,
  setShowSourceFilter,
  showCustomPrompt,
  setShowCustomPrompt,
  selectedSourceIds,
  setSelectedSourceIds,
  toggleSourceSelection,
  customInstructions,
  setCustomInstructions,
  activeGenerationIds,
  generationQueue,
  onOpenReportModal,
  onGenerate,
  onOpenInfographic,
  reportModalTriggerRef,
  infographicModalTriggerRef,
  reduceMotion,
  modalSpring,
}: Props) {
  return (
    <>
      {/* Quick config bar */}
      <div className="flex items-center gap-2">
        {sources.length > 1 && (
          <button
            onClick={() => setShowSourceFilter(!showSourceFilter)}
            className="notebook-chip"
            style={showSourceFilter || selectedSourceIds.length > 0 ? { borderColor: 'var(--notebook-accent)', color: 'var(--notebook-accent)', background: 'var(--notebook-accent-surface)' } : {}}
          >
            <Filter className="w-3 h-3" />
            {selectedSourceIds.length > 0 ? `${selectedSourceIds.length} src` : 'Sources'}
          </button>
        )}

        <button
          onClick={() => setShowCustomPrompt(!showCustomPrompt)}
          className="notebook-chip"
          style={showCustomPrompt || customInstructions.trim() ? { borderColor: 'var(--color-warning)', color: 'var(--color-warning)', background: 'color-mix(in srgb, var(--color-warning) 8%, transparent)' } : {}}
        >
          <PenLine className="w-3 h-3" />
          Prompt
          {customInstructions.trim() && <span className="w-1.5 h-1.5 rounded-full bg-green-400" />}
        </button>

        <span className="ml-auto text-xs" style={{ color: 'var(--text-muted)' }}>
          {sources.length} source{sources.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Source filter dropdown */}
      <AnimatePresence>
        {showSourceFilter && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={modalSpring}
            className="overflow-hidden"
          >
            <div
              className="p-2.5 rounded-xl space-y-1"
              style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)' }}
            >
              {sources.map(src => (
                <label
                  key={src.id}
                  htmlFor={`doctype-src-${src.id}`}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-full cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <input
                    id={`doctype-src-${src.id}`}
                    type="checkbox"
                    checked={selectedSourceIds.length === 0 || selectedSourceIds.includes(src.id)}
                    onChange={() => toggleSourceSelection(src.id)}
                    className="w-3 h-3 rounded accent-[var(--accent-primary)]"
                  />
                  <span className="text-xs truncate" style={{ color: 'var(--text-primary)' }}>{src.title}</span>
                </label>
              ))}
              {selectedSourceIds.length > 0 && (
                <button
                  onClick={() => setSelectedSourceIds([])}
                  className="text-xs px-2 py-1 w-full text-left hover:underline"
                  style={{ color: 'var(--accent-primary)' }}
                >
                  Réinitialiser (toutes)
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom instructions dropdown */}
      <AnimatePresence>
        {showCustomPrompt && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={modalSpring}
            className="overflow-hidden"
          >
            <textarea
              value={customInstructions}
              onChange={e => setCustomInstructions(e.target.value)}
              placeholder="Ex: Ton formel, focus technique, ajoute des exemples..."
              rows={2}
              className="w-full px-3 py-2.5 rounded-full text-xs outline-none resize-none transition-all focus:ring-1 focus:ring-[var(--color-warning)]"
              style={{
                backgroundColor: 'var(--bg-panel)',
                border: '1px solid var(--border-base)',
                color: 'var(--text-primary)',
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Generate buttons — redesigned grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>
            Générer
          </p>
          {activeGenerationIds.size > 0 && (
            <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--accent-primary)' }}>
              <Loader2 className="w-3 h-3 animate-spin" />
              {activeGenerationIds.size > 1 ? `${activeGenerationIds.size} en cours...` : 'En cours...'}
            </span>
          )}
        </div>

        {/* Bouton principal — Rapport complet (ouvre le modal) */}
        <button
          ref={reportModalTriggerRef}
          onClick={onOpenReportModal}
          disabled={sources.length === 0}
          className="w-full flex items-center gap-2.5 p-2.5 rounded-lg border transition-all disabled:opacity-40 active:scale-[0.98] hover:shadow-sm"
          style={{
            borderColor: 'color-mix(in srgb, var(--color-error) 25%, transparent)',
            backgroundColor: 'color-mix(in srgb, var(--color-error) 8%, transparent)',
          }}
          title="Choisir un type de rapport • Suggestions IA incluses"
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'color-mix(in srgb, var(--color-error) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--color-error) 25%, transparent)' }}
          >
            <FileBarChart className="w-4 h-4" style={{ color: 'var(--color-error)' }} />
          </div>
          <div className="min-w-0 flex-1 text-left">
            <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
              Rapport complet
            </p>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Types avancés
            </p>
          </div>
          <ArrowRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--color-error)' }} />
        </button>

        {/* Types rapides — 3 par ligne */}
        <div className="grid grid-cols-3 gap-1">
          {DOC_TYPES.filter(t => t.key !== 'full-report').map(({ key, label, icon: Icon, desc, color }) => {
            const isActive = [...activeGenerationIds].some(taskId => {
              const task = generationQueue.find(t => t.id === taskId);
              return task && task.type === key;
            });
            return (
              <motion.button
                key={key}
                ref={key === 'infographic' ? infographicModalTriggerRef : undefined}
                onClick={() => key === 'infographic' ? onOpenInfographic() : onGenerate(key)}
                disabled={sources.length === 0}
                whileHover={sources.length > 0 ? { y: -1, scale: 1.01 } : {}}
                whileTap={sources.length > 0 ? { scale: 0.98 } : {}}
                transition={reduceMotion ? { duration: 0.1 } : { type: 'spring', stiffness: 400, damping: 25 }}
                className={`group relative w-full flex flex-col items-center gap-1 p-1.5 rounded-lg text-center disabled:opacity-40 transition-all duration-200 ${
                  isActive ? 'ring-1' : 'hover:bg-[var(--bg-hover)]'
                }`}
                style={{
                  border: '1px solid',
                  borderColor: isActive ? color : 'var(--notebook-border)',
                  backgroundColor: isActive ? `${color}08` : 'var(--notebook-card-bg)',
                }}
                title={desc}
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all"
                  style={{ backgroundColor: `${color}10`, border: `1px solid ${color}20` }}
                >
                  {isActive ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color }} />
                  ) : (
                    <Icon className="w-4 h-4" style={{ color }} />
                  )}
                </div>

                <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                  {label}
                </span>

                {isActive && (
                  <motion.div
                    layoutId="activeGenType"
                    className="absolute inset-0 rounded-lg pointer-events-none"
                    style={{ border: `1.5px solid ${color}`, opacity: 0.6 }}
                  />
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Source count info */}
      {sources.length === 0 && (
        <p className="text-xs text-center py-2 px-3 rounded-lg" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-dimmed)' }}>
          Ajoutez des sources pour activer la génération
        </p>
      )}
    </>
  );
}
