/**
 * SourceListFull — rendu plein écran de la liste des sources : cartes avec
 * aperçu du contenu, mots-clés/tags, ré-indexation et suppression par item.
 * Composant présentationnel.
 *
 * Performance (Phase 3) : au-delà de VIRTUALIZE_THRESHOLD sources affichées, la
 * liste bascule sur une virtualisation `react-window` (fenêtrage) pour ne monter
 * dans le DOM que les cartes visibles. En-dessous du seuil — le cas courant — on
 * conserve la liste animée (motion/AnimatePresence : layout + enter/exit) à
 * l'identique. La carte elle-même (SourceCard) est partagée entre les deux
 * chemins ; seule l'enveloppe diffère (motion.div animé vs div statique mesuré).
 */

import { motion, AnimatePresence } from 'motion/react';
import { List, useDynamicRowHeight, type RowComponentProps } from 'react-window';
import type { SpringTransition, TapScaleProps } from '../motionTypes.js';
import {
  Sparkles, Search, Loader2, Eye, RefreshCw, Trash2, CheckSquare, Square,
} from 'lucide-react';
import { TYPE_ICONS, TYPE_COLORS, type SourceItem } from './constants.js';

// Seuil au-delà duquel on vire sur la virtualisation. En-dessous, la liste
// animée reste identique au comportement d'origine.
const VIRTUALIZE_THRESHOLD = 40;
// Hauteur par défaut d'une carte avant mesure dynamique (react-window).
const ESTIMATED_ROW_HEIGHT = 132;

interface Props {
  sources: SourceItem[];
  filteredSources: SourceItem[];
  searchQuery: string;
  dragOver: boolean;
  selectedSources: string[];
  expandedSource: string | null;
  loadingPreview: boolean;
  sourcePreview: Record<string, string>;
  reindexingId: string | null;
  tagInput: { sourceId: string; value: string } | null;
  prefersReducedMotion: boolean | null;
  spring: SpringTransition;
  tapScale: TapScaleProps;

  onToggleSelect: (sourceId: string) => void;
  onTogglePreview: (sourceId: string) => void;
  onReindex: (sourceId: string) => void;
  onDelete: (sourceId: string) => void;
  onRemoveTag: (sourceId: string, tag: string) => void;
  onAddTag: (sourceId: string, tag: string) => void;
  setTagInput: (v: { sourceId: string; value: string } | null) => void;
}

/** Props propres au contenu d'une carte source (hors enveloppe animée). */
interface SourceCardProps {
  source: SourceItem;
  isSelected: boolean;
  selectedCount: number;
  expandedSource: string | null;
  loadingPreview: boolean;
  sourcePreview: Record<string, string>;
  reindexingId: string | null;
  tagInput: { sourceId: string; value: string } | null;
  tapScale: TapScaleProps;
  onToggleSelect: (sourceId: string) => void;
  onTogglePreview: (sourceId: string) => void;
  onReindex: (sourceId: string) => void;
  onDelete: (sourceId: string) => void;
  onRemoveTag: (sourceId: string, tag: string) => void;
  onAddTag: (sourceId: string, tag: string) => void;
  setTagInput: (v: { sourceId: string; value: string } | null) => void;
}

/**
 * SourceCard — contenu interne d'une carte source (checkbox, icône, méta,
 * mots-clés, aperçu, actions). Partagé entre le chemin animé et le chemin
 * virtualisé. N'inclut PAS l'enveloppe (motion.div / div) ni le hover border.
 */
function SourceCard({
  source, isSelected, selectedCount,
  expandedSource, loadingPreview, sourcePreview, reindexingId, tagInput,
  tapScale, onToggleSelect, onTogglePreview, onReindex, onDelete,
  onRemoveTag, onAddTag, setTagInput,
}: SourceCardProps) {
  return (
    <>
      {/* Checkbox de sélection */}
      <button
        type="button"
        onClick={() => onToggleSelect(source.id)}
        className={`flex-shrink-0 self-start mt-0.5 transition-opacity ${isSelected || selectedCount > 0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
        aria-label={isSelected ? 'Désélectionner' : 'Sélectionner'}
      >
        {isSelected ? (
          <CheckSquare className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
        ) : (
          <Square className="w-4 h-4" style={{ color: 'var(--text-dimmed)' }} />
        )}
      </button>

      {/* Type icon with color indicator */}
      <div
        className="flex flex-col items-center gap-1 flex-shrink-0 w-7 h-7 rounded-full justify-center"
        style={{ backgroundColor: `${TYPE_COLORS[source.type] || 'var(--text-muted)'}14` }}
      >
        <span className="text-sm leading-none">{TYPE_ICONS[source.type] || '📎'}</span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {source.title}
          </p>
          <span
            className="text-sm px-1.5 py-0.5 rounded-full font-bold uppercase flex-shrink-0"
            style={{ letterSpacing: '0.03em', backgroundColor: `${TYPE_COLORS[source.type] || 'var(--text-muted)'}15`, color: TYPE_COLORS[source.type] || 'var(--text-dimmed)' }}
          >
            {source.type}
          </span>
        </div>

        <p className="text-xs mt-0.5 leading-relaxed line-clamp-1" style={{ color: 'var(--text-muted)' }}>
          {source.summary}
        </p>

        {/* Expanded content preview */}
        <AnimatePresence>
          {expandedSource === source.id && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div
                className="mt-2 p-3 rounded-xl text-xs leading-relaxed max-h-60 overflow-y-auto custom-scrollbar whitespace-pre-wrap"
                style={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-base)', color: 'var(--text-secondary)' }}
              >
                {loadingPreview ? (
                  <div className="flex items-center gap-2" style={{ color: 'var(--text-dimmed)' }}>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Chargement du contenu...</span>
                  </div>
                ) : (
                  sourcePreview[source.id] || source.summary
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Meta row */}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-xs font-medium" style={{ color: 'var(--text-dimmed)' }}>
            {source.wordCount.toLocaleString()} mots
          </span>
          <span className="text-xs" style={{ color: 'var(--text-dimmed)' }}>
            {source.chunksCount} chunks
          </span>
          <span className="text-xs uppercase font-medium" style={{ color: 'var(--text-dimmed)', letterSpacing: '0.02em' }}>
            {source.language}
          </span>
        </div>

        {/* Keywords + Tags */}
        {source.keywords.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2 items-center">
            {source.keywords.slice(0, 6).map((kw: string) => (
              <button
                key={kw}
                type="button"
                className="text-xs px-2 py-0.5 rounded-full font-medium cursor-pointer transition-all hover:line-through hover:opacity-50"
                style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-dimmed)', border: '1px solid var(--border-base)' }}
                onClick={() => onRemoveTag(source.id, kw)}
                title="Cliquer pour retirer"
                aria-label={`Retirer le mot-clé ${kw}`}
              >
                {kw}
              </button>
            ))}
            {source.keywords.length > 6 && (
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: 'var(--text-dimmed)' }}>
                +{source.keywords.length - 6}
              </span>
            )}
            {/* Add tag inline */}
            {tagInput?.sourceId === source.id ? (
              <form
                onSubmit={(e) => { e.preventDefault(); onAddTag(source.id, tagInput.value); }}
                className="inline-flex"
              >
                <input
                  type="text"
                  value={tagInput.value}
                  onChange={(e) => setTagInput({ sourceId: source.id, value: e.target.value })}
                  placeholder="tag..."
                  // autoFocus justifié : le champ n'apparaît qu'après clic sur
                  // « + tag » ; focus immédiat attendu pour la saisie.
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  onBlur={() => setTagInput(null)}
                  className="text-xs px-2 py-0.5 rounded-full w-16 outline-none"
                  style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)', border: '1px solid var(--accent-primary)' }}
                />
              </form>
            ) : (
              <button
                onClick={() => setTagInput({ sourceId: source.id, value: '' })}
                className="text-xs px-2 py-0.5 rounded-full font-medium transition-colors hover:bg-[var(--accent-subtle)] opacity-0 group-hover:opacity-100"
                style={{ color: 'var(--text-dimmed)', border: '1px dashed var(--border-base)' }}
                title="Ajouter un tag"
              >
                + tag
              </button>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity self-start">
        <motion.button
          {...tapScale}
          onClick={() => onTogglePreview(source.id)}
          className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
          title="Voir le contenu"
          aria-label="Voir le contenu"
        >
          <Eye className="w-3.5 h-3.5" style={{ color: expandedSource === source.id ? 'var(--accent-primary)' : 'var(--text-dimmed)' }} />
        </motion.button>
        <motion.button
          {...tapScale}
          onClick={() => onReindex(source.id)}
          disabled={reindexingId === source.id}
          className="p-1.5 rounded-lg hover:bg-[var(--accent-subtle)] transition-colors disabled:opacity-40"
          title="Re-indexer la source"
          aria-label="Re-indexer la source"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${reindexingId === source.id ? 'animate-spin' : ''}`} style={{ color: 'var(--accent-primary)' }} />
        </motion.button>
        <motion.button
          {...tapScale}
          onClick={() => onDelete(source.id)}
          className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
          title="Supprimer"
          aria-label={`Supprimer ${source.title}`}
        >
          <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--color-error)' }} />
        </motion.button>
      </div>
    </>
  );
}

/** Styles communs à l'enveloppe d'une carte (animée ou statique). */
function cardWrapperStyle(isSelected: boolean): React.CSSProperties {
  return {
    backgroundColor: 'var(--notebook-card-bg)',
    borderColor: isSelected ? 'var(--accent-primary)' : 'var(--notebook-border)',
    boxShadow: isSelected ? '0 0 0 1px var(--accent-primary)' : 'none',
    transition: 'border-color 150ms ease, box-shadow 150ms ease',
  };
}

const hoverEnter = (isSelected: boolean) => (e: React.MouseEvent<HTMLElement>) => {
  if (!isSelected) (e.currentTarget as HTMLElement).style.borderColor = 'var(--notebook-accent)';
};
const hoverLeave = (isSelected: boolean) => (e: React.MouseEvent<HTMLElement>) => {
  if (!isSelected) (e.currentTarget as HTMLElement).style.borderColor = 'var(--notebook-border)';
};

/** Rangée virtualisée (react-window) : enveloppe statique + SourceCard. */
type RowData = Omit<Props, 'sources' | 'searchQuery' | 'dragOver' | 'prefersReducedMotion' | 'spring'> & {
  filteredSources: SourceItem[];
};

function VirtualRow({ index, style, ...data }: RowComponentProps<RowData>) {
  const source = data.filteredSources[index];
  const isSelected = data.selectedSources.includes(source.id);
  return (
    // L'espacement inter-cartes est en padding-bottom sur l'élément mesuré par
    // react-window (et non en margin sur l'enfant) pour que la hauteur dynamique
    // inclue bien le gap.
    <div style={style} className="pb-3">
      <div
        className="group p-3 rounded-xl border flex gap-2"
        style={cardWrapperStyle(isSelected)}
        onMouseEnter={hoverEnter(isSelected)}
        onMouseLeave={hoverLeave(isSelected)}
      >
        <SourceCard
          source={source}
          isSelected={isSelected}
          selectedCount={data.selectedSources.length}
          expandedSource={data.expandedSource}
          loadingPreview={data.loadingPreview}
          sourcePreview={data.sourcePreview}
          reindexingId={data.reindexingId}
          tagInput={data.tagInput}
          tapScale={data.tapScale}
          onToggleSelect={data.onToggleSelect}
          onTogglePreview={data.onTogglePreview}
          onReindex={data.onReindex}
          onDelete={data.onDelete}
          onRemoveTag={data.onRemoveTag}
          onAddTag={data.onAddTag}
          setTagInput={data.setTagInput}
        />
      </div>
    </div>
  );
}

export function SourceListFull({
  sources,
  filteredSources,
  searchQuery,
  dragOver,
  selectedSources,
  expandedSource,
  loadingPreview,
  sourcePreview,
  reindexingId,
  tagInput,
  prefersReducedMotion,
  spring,
  tapScale,
  onToggleSelect,
  onTogglePreview,
  onReindex,
  onDelete,
  onRemoveTag,
  onAddTag,
  setTagInput,
}: Props) {
  // Cache de hauteurs dynamiques pour la virtualisation (hauteurs de carte
  // variables selon mots-clés / aperçu étendu). Hook toujours appelé (règles
  // des hooks) même si la virtualisation n'est pas active.
  const rowHeight = useDynamicRowHeight({ defaultRowHeight: ESTIMATED_ROW_HEIGHT });

  if (sources.length === 0) {
    return (
      <div
        className="notebook-empty-state rounded-2xl border-2 border-dashed transition-colors"
        style={{ borderColor: dragOver ? 'var(--notebook-accent)' : 'var(--notebook-border)', padding: '48px 24px' }}
      >
        <div className="notebook-empty-state-icon" style={{ width: 56, height: 56 }}>
          <Sparkles className="w-6 h-6" />
        </div>
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          Ajoutez vos premières sources
        </p>
        <p className="text-xs max-w-sm" style={{ color: 'var(--text-muted)' }}>
          Glissez-déposez des fichiers, ou utilisez les boutons ci-dessus pour importer.
        </p>
        <div className="flex flex-wrap gap-2 mt-2 justify-center">
          {['PDF', 'URL', 'Texte', 'DOCX', 'Markdown'].map(t => (
            <span key={t} className="notebook-chip" style={{ fontSize: '11px', padding: '4px 10px' }}>{t}</span>
          ))}
        </div>
      </div>
    );
  }

  // ── Chemin virtualisé : grandes listes (fenêtrage, sans animation layout) ──
  if (filteredSources.length > VIRTUALIZE_THRESHOLD) {
    return (
      <div className="space-y-3">
        <List
          rowComponent={VirtualRow}
          rowCount={filteredSources.length}
          rowHeight={rowHeight}
          rowProps={{
            filteredSources,
            selectedSources,
            expandedSource,
            loadingPreview,
            sourcePreview,
            reindexingId,
            tagInput,
            tapScale,
            onToggleSelect,
            onTogglePreview,
            onReindex,
            onDelete,
            onRemoveTag,
            onAddTag,
            setTagInput,
          }}
          style={{ height: 'min(70vh, 720px)' }}
          overscanCount={4}
        />
      </div>
    );
  }

  // ── Chemin animé : cas courant, comportement d'origine à l'identique ──────
  return (
    <div className="space-y-3">
      <AnimatePresence initial={false}>
        {filteredSources.map((source) => {
          const isSelected = selectedSources.includes(source.id);
          return (
            <motion.div
              key={source.id}
              layout={!prefersReducedMotion}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={spring}
              className="group p-3 rounded-xl border flex gap-2"
              style={cardWrapperStyle(isSelected)}
              onMouseEnter={hoverEnter(isSelected)}
              onMouseLeave={hoverLeave(isSelected)}
            >
              <SourceCard
                source={source}
                isSelected={isSelected}
                selectedCount={selectedSources.length}
                expandedSource={expandedSource}
                loadingPreview={loadingPreview}
                sourcePreview={sourcePreview}
                reindexingId={reindexingId}
                tagInput={tagInput}
                tapScale={tapScale}
                onToggleSelect={onToggleSelect}
                onTogglePreview={onTogglePreview}
                onReindex={onReindex}
                onDelete={onDelete}
                onRemoveTag={onRemoveTag}
                onAddTag={onAddTag}
                setTagInput={setTagInput}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>

      {searchQuery && filteredSources.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <Search className="h-4 w-4" style={{ color: 'var(--text-dimmed)' }} />
          <p className="text-xs" style={{ color: 'var(--text-dimmed)' }}>
            Aucune source ne correspond à « {searchQuery} »
          </p>
        </div>
      )}
    </div>
  );
}
