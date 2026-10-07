/**
 * SourceListCompact — rendu compact (colonne latérale) de la liste des sources :
 * en-tête avec actions de sélection / suppression globale, recherche, liste en
 * pilules, et pied de page avec statistiques. Composant présentationnel.
 */

import type { SpringTransition, TapScaleProps } from '../motionTypes.js';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search, Loader2, Trash2, Plus, FileText, CheckSquare, Square, X,
} from 'lucide-react';
import { TYPE_ICONS, TYPE_COLORS, ACCEPTED_EXTENSIONS, type SourceItem } from './constants.js';

interface Props {
  sources: SourceItem[];
  filteredSources: SourceItem[];
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  selectedSources: string[];
  selectedSourceId?: string | null;
  uploading: boolean;
  confirmDeleteAll: boolean;
  allFilteredSelected: boolean;
  totalWords: number;
  totalChunks: number;
  prefersReducedMotion: boolean | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  spring: SpringTransition;
  springSnappy: SpringTransition;
  tapScale: TapScaleProps;

  onFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  openFilePicker: () => void;
  onSelectAll: () => void;
  onDeleteSelected: () => void;
  onDeleteAll: () => void;
  onToggleSelect: (sourceId: string) => void;
  onDelete: (sourceId: string) => void;
  onSelectSource?: (sourceId: string) => void;
}

export function SourceListCompact(props: Props) {
  const {
    sources, filteredSources, searchQuery, setSearchQuery,
    selectedSources, selectedSourceId, uploading, confirmDeleteAll, allFilteredSelected,
    totalWords, totalChunks, prefersReducedMotion,
    fileInputRef, spring, springSnappy, tapScale,
    onFileInputChange, openFilePicker, onSelectAll, onDeleteSelected, onDeleteAll,
    onToggleSelect, onDelete, onSelectSource,
  } = props;

  return (
    <div className="h-full min-h-0 flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-4 flex-shrink-0 border-b border-[var(--notebook-border)]">
        <div className="min-w-0">
          <p className="text-sm uppercase font-semibold" style={{ color: 'var(--text-dimmed)', letterSpacing: '0.08em' }}>Sources</p>
          <h2 className="text-sm font-semibold truncate text-[var(--text-primary)]">
            {sources.length} document{sources.length !== 1 ? 's' : ''}
          </h2>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <AnimatePresence mode="wait" initial={false}>
            {selectedSources.length > 0 ? (
              <motion.div
                key="selection-actions"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={springSnappy}
                className="flex items-center gap-1.5"
              >
                <motion.button
                  {...tapScale}
                  type="button"
                  onClick={onSelectAll}
                  disabled={uploading}
                  className="p-1.5 rounded-lg hover:bg-[var(--notebook-surface-muted)] transition-colors disabled:opacity-50"
                  title={allFilteredSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
                  aria-label={allFilteredSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
                >
                  <CheckSquare className="h-4 w-4" style={{ color: 'var(--accent-primary)' }} />
                </motion.button>
                <motion.button
                  {...tapScale}
                  type="button"
                  onClick={onDeleteSelected}
                  disabled={uploading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors disabled:opacity-50"
                  style={{ backgroundColor: 'var(--red-500)', color: 'var(--color-error)' }}
                >
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  <span>Supprimer ({selectedSources.length})</span>
                </motion.button>
              </motion.div>
            ) : (
              <motion.div
                key="default-actions"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={springSnappy}
                className="flex items-center gap-1.5"
              >
                {sources.length > 0 && (
                  <motion.button
                    {...tapScale}
                    type="button"
                    onClick={onDeleteAll}
                    disabled={uploading}
                    className="p-1.5 rounded-lg transition-colors disabled:opacity-50"
                    style={confirmDeleteAll ? { backgroundColor: 'var(--red-500)' } : {}}
                    onMouseEnter={(e) => { if (!confirmDeleteAll) (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(239,68,68,0.1)'; }}
                    onMouseLeave={(e) => { if (!confirmDeleteAll) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
                    title={confirmDeleteAll ? 'Cliquez pour confirmer' : 'Supprimer toutes les sources'}
                    aria-label="Supprimer toutes les sources"
                  >
                    <Trash2 className="h-4 w-4" style={{ color: confirmDeleteAll ? 'var(--color-success)' : 'var(--color-error)' }} />
                  </motion.button>
                )}
                <motion.button
                  {...tapScale}
                  type="button"
                  onClick={openFilePicker}
                  disabled={uploading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium disabled:opacity-70"
                  style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}
                >
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  <span>Ajouter</span>
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <input ref={fileInputRef} type="file" accept={ACCEPTED_EXTENSIONS} multiple onChange={onFileInputChange} className="hidden" />
      </div>

      {/* Search */}
      {sources.length > 0 && (
        <div className="px-3 py-2.5 flex-shrink-0">
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-full transition-colors focus-within:ring-2"
            style={{
              backgroundColor: 'var(--notebook-surface-muted)',
              border: '1px solid var(--notebook-border)',
              ...({ '--tw-ring-color': 'var(--accent-primary)' } as React.CSSProperties),
            }}
          >
            <Search className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'var(--text-dimmed)' }} />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher..."
              aria-label="Rechercher dans les sources"
              className="flex-1 bg-transparent outline-none text-xs min-w-0"
              style={{ color: 'var(--text-primary)' }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="p-0.5 rounded hover:bg-[var(--bg-active)] flex-shrink-0" aria-label="Effacer la recherche">
                <X className="h-3 w-3" style={{ color: 'var(--text-dimmed)' }} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Source list */}
      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar px-2 pb-4 max-h-full">
        {sources.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-12 px-4 gap-3">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'var(--notebook-surface-muted)' }}
            >
              <FileText className="h-5 w-5" style={{ color: 'var(--text-dimmed)' }} />
            </div>
            <p className="text-sm font-medium text-[var(--text-primary)]">Aucune source</p>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed max-w-[220px]">
              Ajoutez des documents pour alimenter l'IA.
            </p>
            <motion.button
              {...tapScale}
              type="button"
              onClick={openFilePicker}
              className="flex items-center gap-1.5 mt-1 px-3.5 py-2 rounded-full text-xs font-medium"
              style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}
            >
              <Plus className="h-3.5 w-3.5" />
              Ajouter une source
            </motion.button>
          </div>
        ) : filteredSources.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <Search className="h-4 w-4" style={{ color: 'var(--text-dimmed)' }} />
            <p className="text-xs text-[var(--text-muted)]">Aucun résultat pour « {searchQuery} »</p>
          </div>
        ) : (
          <div className="space-y-1 pt-1">
            <AnimatePresence initial={false}>
              {filteredSources.map((source) => {
                const isSelected = selectedSources.includes(source.id);
                const isSingleSelected = selectedSourceId === source.id;
                const hasSelection = selectedSources.length > 0;

                return (
                  <motion.div
                    key={source.id}
                    layout={!prefersReducedMotion}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={spring}
                    className="group flex items-center gap-2 px-2.5 py-2.5 rounded-full cursor-pointer"
                    data-active={isSingleSelected || isSelected}
                    style={{
                      backgroundColor: isSingleSelected
                        ? 'var(--accent-subtle, rgba(59,130,246,0.08))'
                        : isSelected
                          ? 'rgba(59,130,246,0.15)'
                          : 'transparent',
                      border: (isSingleSelected || isSelected) ? '1px solid var(--accent-primary)' : '1px solid transparent',
                      transition: 'background-color 120ms ease, border-color 120ms ease',
                    }}
                    onClick={() => {
                      if (hasSelection) {
                        onToggleSelect(source.id);
                      } else {
                        onSelectSource?.(source.id);
                      }
                    }}
                    onMouseEnter={(e) => {
                      if (!isSingleSelected && !isSelected) {
                        (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--notebook-surface-muted)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSingleSelected && !isSelected) {
                        (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                      }
                    }}
                  >
                    {/* Selection checkbox */}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onToggleSelect(source.id); }}
                      className={`flex-shrink-0 p-0.5 rounded-lg hover:bg-[var(--bg-active)] transition-opacity ${hasSelection || isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                      aria-label={isSelected ? 'Désélectionner' : 'Sélectionner'}
                    >
                      {isSelected ? (
                        <CheckSquare className="h-4 w-4" style={{ color: 'var(--accent-primary)' }} />
                      ) : (
                        <Square className="h-4 w-4" style={{ color: 'var(--text-dimmed)' }} />
                      )}
                    </button>

                    {/* File type icon */}
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm"
                      style={{ backgroundColor: `${TYPE_COLORS[source.type] || 'var(--text-muted)'}14` }}
                    >
                      {TYPE_ICONS[source.type] || '📎'}
                    </div>

                    {/* Text content */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {source.title}
                      </p>
                      <p className="mt-0.5 truncate text-xs" style={{ color: 'var(--text-dimmed)' }}>
                        {source.type} · {source.wordCount?.toLocaleString()} mots
                      </p>
                    </div>

                    {/* Delete button on hover */}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onDelete(source.id); }}
                      className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/10 flex-shrink-0"
                      title="Supprimer"
                      aria-label={`Supprimer ${source.title}`}
                    >
                      <Trash2 className="h-3 w-3 text-red-400" />
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Footer stats */}
      {sources.length > 0 && (
        <div className="flex-shrink-0 px-4 py-2.5 border-t border-[var(--notebook-border)]">
          <p className="text-xs text-center" style={{ color: 'var(--text-dimmed)' }}>
            {totalWords.toLocaleString()} mots · {totalChunks} chunks
          </p>
        </div>
      )}
    </div>
  );
}
