/**
 * DocViewer — vue plein écran : affiche le streaming en cours, le document
 * sélectionné (avec barre d'actions) ou un état vide. Composant présentationnel.
 */

import { forwardRef, type JSX } from 'react';
import {
  Loader2, ArrowLeft, FolderInput, RefreshCw, Download, Copy, CheckCircle2,
  Presentation, Sparkles, Zap, Target, PenLine, AlertTriangle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Tooltip } from '../../ui/Tooltip.js';
import { DOC_TYPES, REPORT_TYPES, SLIDE_EXCLUDED_TYPES } from './constants.js';
import { renderGeneratedContent } from './renderHelpers.js';
import { renderInfographicContent } from './renderInfographic.js';
import type { GeneratedDoc, QueuedGeneration } from './types.js';

interface Props {
  sources: { id: string }[];
  streamingTexts: Record<string, string>;
  activeGenerationIds: Set<string>;
  generationQueue: QueuedGeneration[];
  selectedDoc: GeneratedDoc | null;
  copied: boolean;
  onClose?: () => void;
  onImportToWorkspace: (doc: GeneratedDoc) => void;
  onRegenerate: () => void;
  onExportMd: (doc: GeneratedDoc) => void;
  onCopy: (content: string) => void;
  onOpenSlides: () => void;
}

export const DocViewer = forwardRef<HTMLDivElement, Props>(function DocViewer({
  sources,
  streamingTexts,
  activeGenerationIds,
  generationQueue,
  selectedDoc,
  copied,
  onClose,
  onImportToWorkspace,
  onRegenerate,
  onExportMd,
  onCopy,
  onOpenSlides,
}, ref) {
  return (
    <div ref={ref} className="flex-1 overflow-y-auto custom-scrollbar p-5 lg:p-8 notebooklm-viewer" style={{ borderColor: 'var(--notebook-border)' }}>
      {/* Streaming view */}
      {Object.keys(streamingTexts).length > 0 && !selectedDoc && (
        <div className="space-y-5 max-w-3xl">
          <div className="flex items-center gap-2 pb-3 border-b" style={{ borderColor: 'var(--border-base)' }}>
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--accent-primary)' }} />
            <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
              {activeGenerationIds.size > 1 ? `${activeGenerationIds.size} générations en cours...` : 'Génération en cours...'}
            </span>
            <span className="text-xs ml-auto" style={{ color: 'var(--text-dimmed)' }}>
              {Object.values(streamingTexts).reduce((sum, text) => sum + text.length, 0)} caractères
            </span>
          </div>
          {activeGenerationIds.size === 1 ? (
            (() => {
              const taskId = [...activeGenerationIds][0];
              const task = generationQueue.find(t => t.id === taskId);
              const streamingText = streamingTexts[taskId] || '';
              if (!task) return null;
              return task.type === 'infographic' && streamingText.includes('data:image/')
                ? renderInfographicContent(streamingText)
                : renderGeneratedContent(streamingText);
            })()
          ) : (
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Plusieurs générations en cours. Voir la file d'attente pour les détails.
            </div>
          )}
          <span className="inline-block w-2 h-4 animate-pulse rounded-sm" style={{ backgroundColor: 'var(--accent-primary)' }} />
        </div>
      )}

      {/* Selected document view */}
      {selectedDoc && Object.keys(streamingTexts).length === 0 ? (
        <div className={`space-y-5 ${selectedDoc.type === 'mindmap' ? 'max-w-none' : 'max-w-6xl mx-auto'}`}>
          {/* Document header — sticky */}
          <div className="flex items-start gap-3 pb-6 border-b sticky top-0 z-10 pt-2 notebooklm-doc-header" style={{ borderColor: 'var(--notebook-border)', backgroundColor: 'var(--notebook-canvas, var(--bg-base))', backdropFilter: 'blur(12px)' }}>
            {onClose && (
              <Tooltip content="Retour" as="button" onClick={onClose} className="notebook-icon-button flex-shrink-0 mt-0.5">
                <ArrowLeft className="h-4 w-4" />
              </Tooltip>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                {(() => {
                  const docType = DOC_TYPES.find(t => t.key === selectedDoc.type) || REPORT_TYPES.find(t => t.key === selectedDoc.type);
                  const docColor = docType?.color || 'var(--text-muted)';
                  return (
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-bold uppercase"
                      style={{
                        backgroundColor: `color-mix(in srgb, ${docColor} 15%, transparent)`,
                        color: docColor,
                      }}
                    >
                      {docType?.label || selectedDoc.type}
                    </span>
                  );
                })()}
                <span className="text-xs" style={{ color: 'var(--text-dimmed)' }}>
                  {new Date(selectedDoc.createdAt).toLocaleString('fr-FR')}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-dimmed)' }}>
                  • {selectedDoc.content.length} chars
                </span>
              </div>
              <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                {selectedDoc.title}
              </h2>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={() => onImportToWorkspace(selectedDoc)}
                className="p-2 rounded-lg border transition-all hover:bg-[var(--bg-hover)] active:scale-95"
                style={{ borderColor: 'var(--border-base)', color: 'var(--accent-primary)' }}
                title="Importer dans le workspace"
              >
                <FolderInput className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onRegenerate}
                disabled={sources.length === 0}
                className="p-2 rounded-lg border transition-all hover:bg-[var(--bg-hover)] active:scale-95 disabled:opacity-30"
                style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}
                title="Régénérer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onExportMd(selectedDoc)}
                className="p-2 rounded-lg border transition-all hover:bg-[var(--bg-hover)] active:scale-95"
                style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}
                title="Exporter en Markdown"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onCopy(selectedDoc.content)}
                className="p-2 rounded-lg border transition-all hover:bg-[var(--bg-hover)] active:scale-95"
                style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}
                title="Copier"
              >
                {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              {!SLIDE_EXCLUDED_TYPES.has(selectedDoc.type) && (
                <button
                  onClick={onOpenSlides}
                  className="p-2 rounded-lg border transition-all hover:bg-[var(--bg-hover)] active:scale-95"
                  style={{ borderColor: 'color-mix(in srgb, var(--accent-primary) 25%, transparent)', color: 'var(--accent-primary)' }}
                  title="Générer une présentation Reveal.js"
                >
                  <Presentation className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Document content */}
          {selectedDoc.type === 'infographic' ? (
            renderInfographicContent(selectedDoc.content)
          ) : (
            renderGeneratedContent(selectedDoc.content)
          )}
        </div>
      ) : Object.keys(streamingTexts).length === 0 && (
        /* Empty state — professional landing */
        <div className="h-full flex flex-col items-center justify-center gap-6 px-8">
          <div className="relative">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'var(--accent-subtle)' }}
            >
              <Sparkles className="w-8 h-8" style={{ color: 'var(--accent-primary)' }} />
            </div>
            <div
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center shadow-md"
              style={{ backgroundColor: 'var(--bg-panel)', border: '2px solid var(--accent-primary)' }}
            >
              <span className="text-xs font-bold" style={{ color: 'var(--accent-primary)' }}>AI</span>
            </div>
          </div>

          <div className="text-center space-y-2 max-w-sm">
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              Génération intelligente
            </h3>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Transformez vos sources en documents structurés. Résumés, FAQ, guides d'étude, chronologies et plus encore.
            </p>
          </div>

          {/* Feature highlights */}
          <div className="grid grid-cols-3 gap-3 w-full max-w-sm">
            {([
              { icon: Zap, label: 'Streaming', sub: 'Temps réel' },
              { icon: Target, label: 'Sources', sub: 'Ciblé' },
              { icon: PenLine, label: 'Custom', sub: 'Instructions' },
            ] as { icon: LucideIcon; label: string; sub: string }[]).map(f => {
              const FIcon = f.icon;
              return (
                <div
                  key={f.label}
                  className="flex flex-col items-center gap-1 p-3 rounded-xl"
                  style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)' }}
                >
                  <span className="inline-flex items-center"><FIcon size={16} style={{ color: 'var(--text-muted)' }} /></span>
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{f.label}</span>
                  <span className="text-xs" style={{ color: 'var(--text-dimmed)' }}>{f.sub}</span>
                </div>
              );
            })}
          </div>

          {sources.length === 0 && (
            <p
              className="text-xs px-4 py-2 rounded-full"
              style={{ backgroundColor: 'color-mix(in srgb, var(--color-warning) 10%, transparent)', color: 'var(--color-warning)', border: '1px solid color-mix(in srgb, var(--color-warning) 25%, transparent)' }}
            >
              <span className="inline-flex items-center gap-1.5"><AlertTriangle size={13} /> Ajoutez des sources dans l'onglet Sources pour commencer</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}) as (props: Props & { ref?: React.Ref<HTMLDivElement> }) => JSX.Element;
