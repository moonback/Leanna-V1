/**
 * SourcePanel — Gestion des sources d'un notebook.
 *
 * Orchestrateur mince depuis le découpage (Phase 2) :
 *  - délègue l'ajout de sources (upload, URL, texte, codebase, drag & drop) au
 *    hook useSourceUpload ;
 *  - délègue la liste (recherche, sélection, aperçu, tags, ré-index, suppression)
 *    au hook useSourceList ;
 *  - rend SourceListCompact (mode compact) ou UploadToolbar + UploadQueue +
 *    SourceListFull (mode plein écran).
 */

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Upload, Search, X } from 'lucide-react';
import { useToast } from '../ui/Toast.js';
import { SourcesSummaryCard } from './SourcesSummaryCard.js';
import { GitHubRepositoryImportModal } from './GitHubRepositoryImportModalLazy.js';
import { SPRING_UI_SLOW as SPRING_UI, SPRING_SNAPPY } from './motion.js';
import { useSourceUpload } from './sources/useSourceUpload.js';
import { useSourceList } from './sources/useSourceList.js';
import { UploadToolbar } from './sources/UploadToolbar.js';
import { UploadQueue } from './sources/UploadQueue.js';
import { SourceListFull } from './sources/SourceListFull.js';
import { SourceListCompact } from './sources/SourceListCompact.js';
import type { SourceItem } from './sources/constants.js';

interface Props {
  notebookId: string;
  sources: SourceItem[];
  onRefresh: () => void;
  /** Reports upload progress to parent (total files, completed count, active boolean) */
  onUploadProgress?: (state: { total: number; done: number; active: boolean }) => void;
  compact?: boolean;
  /** Called when a source is clicked in compact mode — opens it in the main panel */
  onSelectSource?: (sourceId: string) => void;
  /** Currently selected source ID (for highlighting in compact mode) */
  selectedSourceId?: string | null;
}

export function SourcePanel({ notebookId, sources, onRefresh, onUploadProgress, compact = false, onSelectSource, selectedSourceId }: Props) {
  const { success, error: toastError } = useToast();
  const prefersReducedMotion = useReducedMotion();

  const upload = useSourceUpload({ notebookId, onRefresh, onSuccess: success, onError: toastError });
  const { uploading, uploadQueue, dragOver } = upload;

  const list = useSourceList({
    notebookId, sources, onRefresh, onSuccess: success, onError: toastError, setUploading: upload.setUploading,
  });
  const { searchQuery, setSearchQuery, filteredSources } = list;

  const [showGitHubImport, setShowGitHubImport] = useState(false);

  // Ressort adapté au réglage d'accessibilité de l'utilisateur
  const spring = prefersReducedMotion ? { duration: 0.15 } : SPRING_UI;
  const springSnappy = prefersReducedMotion ? { duration: 0.12 } : SPRING_SNAPPY;
  const tapScale = prefersReducedMotion ? {} : { whileTap: { scale: 0.96 } };

  // Report upload progress to parent
  useEffect(() => {
    if (!onUploadProgress) return;
    const done = uploadQueue.filter(f => f.status === 'success').length;
    onUploadProgress({ total: uploadQueue.length, done, active: uploading });
  }, [uploadQueue, uploading, onUploadProgress]);

  // Stats dérivées
  const totalWords = sources.reduce((acc, s) => acc + s.wordCount, 0);
  const totalChunks = sources.reduce((acc, s) => acc + s.chunksCount, 0);
  const uploadDone = uploadQueue.filter(f => f.status === 'success').length;
  const uploadErrors = uploadQueue.filter(f => f.status === 'error').length;

  const sourcesHash = useMemo(() => sources.map(s => s.id).sort().join('|'), [sources]);

  // ─── Mode compact ──────────────────────────────────────────────────────────
  if (compact) {
    return (
      <SourceListCompact
        sources={sources}
        filteredSources={filteredSources}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        selectedSources={list.selectedSources}
        selectedSourceId={selectedSourceId}
        uploading={uploading}
        confirmDeleteAll={list.confirmDeleteAll}
        allFilteredSelected={list.allFilteredSelected}
        totalWords={totalWords}
        totalChunks={totalChunks}
        prefersReducedMotion={prefersReducedMotion}
        fileInputRef={upload.fileInputRef}
        spring={spring}
        springSnappy={springSnappy}
        tapScale={tapScale}
        onFileInputChange={upload.handleFileInputChange}
        openFilePicker={upload.openFilePicker}
        onSelectAll={list.handleSelectAll}
        onDeleteSelected={list.handleDeleteSelected}
        onDeleteAll={list.handleDeleteAll}
        onToggleSelect={list.handleToggleSelect}
        onDelete={list.handleDelete}
        onSelectSource={onSelectSource}
      />
    );
  }

  // ─── Mode plein écran ────────────────────────────────────────────────────
  return (
    <div
      className="h-full flex flex-col overflow-hidden relative"
      onDragOver={upload.handleDragOver}
      onDragEnter={upload.handleDragEnter}
      onDragLeave={upload.handleDragLeave}
      onDrop={upload.handleDrop}
    >
      {/* Drag & Drop Overlay */}
      <AnimatePresence>
        {dragOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={springSnappy}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 rounded-2xl pointer-events-none"
            style={{
              backgroundColor: 'var(--notebook-accent-surface)',
              border: '2.5px dashed var(--notebook-accent)',
              backdropFilter: 'blur(4px)',
            }}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              transition={spring}
              className="notebook-empty-state-icon"
              style={{ width: 64, height: 64 }}
            >
              <Upload className="w-7 h-7" />
            </motion.div>
            <p className="text-sm font-medium" style={{ color: 'var(--notebook-accent)' }}>
              Déposez vos fichiers ici
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              PDF, texte, Markdown, HTML, DOCX, CSV, JSON, YAML, Images
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Sticky header + actions ─────────────────────────── */}
      <div
        className="flex-shrink-0 px-4 pt-3 pb-2 space-y-2"
        style={{ backgroundColor: 'var(--notebook-canvas, var(--bg-base))', borderBottom: '1px solid var(--notebook-border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold" style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
              Sources
            </h1>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {sources.length === 0
                ? 'Aucun document pour le moment'
                : `${sources.length} source${sources.length !== 1 ? 's' : ''} · ${totalWords.toLocaleString()} mots · ${totalChunks} chunks`}
            </p>
          </div>
        </div>

        <UploadQueue uploadQueue={uploadQueue} uploadDone={uploadDone} uploadErrors={uploadErrors} spring={spring} />

        <UploadToolbar upload={upload} onOpenGitHub={() => setShowGitHubImport(true)} spring={spring} tapScale={tapScale} />

        {/* Search (when >3 sources) */}
        {sources.length > 3 && (
          <div className="notebook-search-field">
            <Search className="h-4 w-4 flex-shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Rechercher dans les sources..."
              aria-label="Rechercher dans les sources"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} aria-label="Effacer la recherche" className="p-0.5 rounded hover:bg-[var(--bg-active)]">
                <X className="h-3.5 w-3.5" style={{ color: 'var(--text-dimmed)' }} />
              </button>
            )}
          </div>
        )}
      </div>{/* end sticky header */}

      {/* ── Scrollable content ─────────────────────────────── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-3 space-y-3">
        <SourcesSummaryCard notebookId={notebookId} sourcesCount={sources.length} sourcesHash={sourcesHash} />

        <SourceListFull
          sources={sources}
          filteredSources={filteredSources}
          searchQuery={searchQuery}
          dragOver={dragOver}
          selectedSources={list.selectedSources}
          expandedSource={list.expandedSource}
          loadingPreview={list.loadingPreview}
          sourcePreview={list.sourcePreview}
          reindexingId={list.reindexingId}
          tagInput={list.tagInput}
          prefersReducedMotion={prefersReducedMotion}
          spring={spring}
          tapScale={tapScale}
          onToggleSelect={list.handleToggleSelect}
          onTogglePreview={list.handleTogglePreview}
          onReindex={list.handleReindex}
          onDelete={list.handleDelete}
          onRemoveTag={list.handleRemoveTag}
          onAddTag={list.handleAddTag}
          setTagInput={list.setTagInput}
        />
      </div>{/* end scrollable content */}

      {/* GitHub Repository Import Modal */}
      {showGitHubImport && (
        <GitHubRepositoryImportModal
          onClose={() => setShowGitHubImport(false)}
          onImportSuccess={(targetNotebookId, repository) => {
            success(`Dépôt ${repository} ingéré avec succès !`);
            if (targetNotebookId && targetNotebookId !== notebookId) {
              window.location.hash = `notebook=${targetNotebookId}`;
              window.dispatchEvent(new HashChangeEvent('hashchange'));
            } else {
              onRefresh();
            }
          }}
          defaultNotebookId={notebookId}
        />
      )}
    </div>
  );
}
