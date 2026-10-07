/**
 * GeneratePanel — Génération de contenu dérivé (FAQ, résumé, guide, rapports…)
 *
 * Orchestrateur mince depuis le découpage (Phase 2) :
 *  - délègue la file de génération + streaming au hook useGenerationQueue ;
 *  - détient la configuration (sélection de sources, prompt), l'état des modales
 *    et des suggestions, et le pont modalSelectedType → génération ;
 *  - rend DocTypePicker + GenerationProgress (sidebar) ou DocViewer (fullView),
 *    plus les modales Report / Infographic / Slide.
 */

import { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
import { useReducedMotion } from 'motion/react';
import { useToast } from '../ui/Toast.js';
import { useProfile } from '../../context/UserProfileContext.js';
// SlidePreviewModal (~450 lignes) n'est affichée qu'au clic sur « Diapositives ».
// Chargée paresseusement pour la sortir du bundle principal du panneau.
const SlidePreviewModal = lazy(() =>
  import('./SlidePreviewModal.js').then((m) => ({ default: m.SlidePreviewModal })),
);
import { api } from './api/client.js';
import { useGenerationQueue } from './generation/useGenerationQueue.js';
import { useReducedTransparency } from './generation/renderInfographic.js';
import { GenerationProgress } from './generation/GenerationProgress.js';
import { DocTypePicker } from './generation/DocTypePicker.js';
import { DocViewer } from './generation/DocViewer.js';
import { ReportModal } from './generation/ReportModal.js';
import { InfographicModal } from './generation/InfographicModal.js';
import type { SourceItem, DocRef } from './generation/types.js';

interface Props {
  notebookId: string;
  sources: SourceItem[];
  onRefresh: () => void;
  /** When true, renders full layout with doc viewer (for center panel) */
  fullView?: boolean;
  /** Close the full view */
  onClose?: () => void;
  /** Open a specific doc in the main center panel */
  onViewDoc?: (doc: DocRef) => void;
  /** Initial document to display when opening in fullView */
  initialDoc?: DocRef | null;
}

interface Suggestion {
  type: string;
  title: string;
  description: string;
  reason: string;
  relevance: number;
  recommendedSourceIds: string[];
}

export function GeneratePanel({ notebookId, sources, onRefresh, fullView = false, onClose, onViewDoc: _onViewDoc, initialDoc }: Props) {
  const { success, error: toastError } = useToast();
  const { profile } = useProfile();

  // ─── Configuration ────────────────────────────────────────────────────────
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [showSourceFilter, setShowSourceFilter] = useState(false);
  const [customInstructions, setCustomInstructions] = useState('');
  const [showCustomPrompt, setShowCustomPrompt] = useState(false);
  const [showQueue, setShowQueue] = useState(false);

  // ─── Suggestions ──────────────────────────────────────────────────────────
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const hasLoadedSuggestionsRef = useRef(false);

  // ─── Modales ──────────────────────────────────────────────────────────────
  const [showReportModal, setShowReportModal] = useState(false);
  const [modalSelectedType, setModalSelectedType] = useState<string | null>(null);
  const reportModalTriggerRef = useRef<HTMLButtonElement>(null);
  const [showInfographicModal, setShowInfographicModal] = useState(false);
  const infographicModalTriggerRef = useRef<HTMLButtonElement>(null);
  const [showSlideModal, setShowSlideModal] = useState(false);
  const [infraOrientation, setInfraOrientation] = useState<'portrait' | 'landscape' | 'square'>('portrait');
  const [infraStyle, setInfraStyle] = useState<string>('auto');
  const [infraDetail, setInfraDetail] = useState<'low' | 'medium' | 'high'>('medium');
  const [infraLang, setInfraLang] = useState<string>('fr');
  const [infraDescription, setInfraDescription] = useState('');

  // ─── Moteur de génération ───────────────────────────────────────────────
  const queue = useGenerationQueue({
    notebookId, sources, onRefresh,
    imageModel: profile.openrouterImageModel,
    onSuccess: success, onError: toastError,
    fullView, initialDoc, selectedSourceIds, customInstructions,
  });
  const { handleGenerate, selectedDoc } = queue;

  // Motion
  const reduceMotion = useReducedMotion();
  const modalSpring = reduceMotion
    ? { duration: 0.1, ease: 'easeOut' as const }
    : { type: 'spring' as const, bounce: 0, duration: 0.3 };
  const scrimSpring = { duration: 0.1 };
  const reducedTransparency = useReducedTransparency();
  const scrimStyle = reducedTransparency
    ? { backgroundColor: 'rgba(0,0,0,0.92)' }
    : { backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' };

  // Fermeture au clavier (Escape) + restitution du focus au déclencheur
  useEffect(() => {
    if (!showReportModal && !showInfographicModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showReportModal) {
        setShowReportModal(false);
        reportModalTriggerRef.current?.focus();
      }
      if (showInfographicModal) {
        setShowInfographicModal(false);
        infographicModalTriggerRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showReportModal, showInfographicModal]);

  // ─── Suggestions ──────────────────────────────────────────────────────────
  const loadSuggestions = useCallback(async () => {
    if (sources.length === 0) return;
    setLoadingSuggestions(true);
    try {
      const data = await api<{ suggestions?: Suggestion[] }>(
        `/api/notebooks/${notebookId}/report-suggestions`,
      );
      setSuggestions(data.suggestions || []);
    } catch { /* ignore */ }
    finally { setLoadingSuggestions(false); }
  }, [notebookId, sources.length]);

  // Chargement AUTOMATIQUE une seule fois dès qu'une source est disponible.
  useEffect(() => {
    if (hasLoadedSuggestionsRef.current) return;
    if (sources.length === 0) return;
    hasLoadedSuggestionsRef.current = true;
    loadSuggestions();
  }, [sources.length, loadSuggestions]);

  const openReportModal = useCallback(() => {
    setShowReportModal(true);
    setModalSelectedType(null);
    if (!hasLoadedSuggestionsRef.current && sources.length > 0) {
      hasLoadedSuggestionsRef.current = true;
      loadSuggestions();
    }
  }, [loadSuggestions, sources.length]);

  const handleModalGenerate = useCallback((type: string) => {
    setShowReportModal(false);
    setTimeout(() => { setModalSelectedType(type); }, 100);
  }, []);

  // Pont modal → génération
  useEffect(() => {
    if (modalSelectedType) {
      handleGenerate(modalSelectedType);
      setModalSelectedType(null);
    }
  }, [modalSelectedType, handleGenerate]);

  // Génération d'infographie depuis le modal
  const handleInfographicGenerate = useCallback(() => {
    setShowInfographicModal(false);

    const orientationMap: Record<string, string> = {
      portrait: '9:16', landscape: '16:9', square: '1:1',
    };
    const styleLabels: Record<string, string> = {
      auto: 'Sélection automatique du style visuel',
      kawaii: 'Style Kawaii : mignon, coloré, personnages arrondis, pastels',
      clay: 'Style Pâte à modeler : textures 3D, reliefs doux, ombres douces',
      sketch: 'Style Croquis : traits au crayon, hachuré, noir et blanc avec touches de couleur',
      anime: 'Style Anime : illustration japonaise, couleurs vives, détails nets',
      editorial: 'Style Éditorial : magazine haut de gamme, typographie soignée, minimaliste',
      educational: 'Style Éducatif : schémas clairs, icônes simples, annotations, pédagogique',
      bento: 'Style Grille Bento : mise en page en blocs carrés/rectangulaires bien organisés',
      bricks: 'Style Briques : sections empilées, couleurs franches, séparations nettes',
      scientific: 'Style Scientifique : graphiques, données, précision, palette sobre',
      professional: 'Style Professionnel : corporate, élégant, couleurs business (bleu, gris, blanc)',
    };
    const detailLabels: Record<string, string> = {
      low: 'Niveau de détail : minimal, très synthétique, 3-4 éléments max',
      medium: 'Niveau de détail : modéré, 5-7 sections avec quelques données clés',
      high: 'Niveau de détail : élevé, très dense, beaucoup de données et sous-sections',
    };

    const instructions = [
      `Orientation : ${orientationMap[infraOrientation]} (${infraOrientation})`,
      `Langue du texte dans l'infographie : ${infraLang === 'fr' ? 'Français' : infraLang === 'en' ? 'Anglais' : infraLang === 'es' ? 'Espagnol' : infraLang === 'ar' ? 'Arabe' : infraLang === 'de' ? 'Allemand' : infraLang}`,
      styleLabels[infraStyle],
      detailLabels[infraDetail],
      infraDescription.trim() ? `Description utilisateur : ${infraDescription.trim()}` : '',
    ].filter(Boolean).join('\n');

    setTimeout(() => {
      handleGenerate('infographic', instructions);
    }, 100);
  }, [infraOrientation, infraStyle, infraDetail, infraLang, infraDescription, handleGenerate]);

  const toggleSourceSelection = useCallback((sourceId: string) => {
    setSelectedSourceIds(prev =>
      prev.includes(sourceId) ? prev.filter(id => id !== sourceId) : [...prev, sourceId]
    );
  }, []);

  const handleSelectSuggestion = useCallback((suggestion: Suggestion) => {
    if (suggestion.recommendedSourceIds?.length > 0) {
      setSelectedSourceIds(suggestion.recommendedSourceIds);
    }
    handleModalGenerate(suggestion.type);
  }, [handleModalGenerate]);

  return (
    <div className="h-full flex flex-col">
      {/* Controls panel — hidden in fullView (doc viewer only) */}
      {!fullView && (
        <div
          className="flex-1 overflow-y-auto custom-scrollbar p-4 lg:p-5 space-y-4"
          style={{ backgroundColor: 'var(--notebook-studio-bg)' }}
        >
          <DocTypePicker
            sources={sources}
            showSourceFilter={showSourceFilter}
            setShowSourceFilter={setShowSourceFilter}
            showCustomPrompt={showCustomPrompt}
            setShowCustomPrompt={setShowCustomPrompt}
            selectedSourceIds={selectedSourceIds}
            setSelectedSourceIds={setSelectedSourceIds}
            toggleSourceSelection={toggleSourceSelection}
            customInstructions={customInstructions}
            setCustomInstructions={setCustomInstructions}
            activeGenerationIds={queue.activeGenerationIds}
            generationQueue={queue.generationQueue}
            onOpenReportModal={openReportModal}
            onGenerate={handleGenerate}
            onOpenInfographic={() => setShowInfographicModal(true)}
            reportModalTriggerRef={reportModalTriggerRef}
            infographicModalTriggerRef={infographicModalTriggerRef}
            reduceMotion={reduceMotion}
            modalSpring={modalSpring}
          />

          <GenerationProgress
            activeGenerationIds={queue.activeGenerationIds}
            generationQueue={queue.generationQueue}
            generationProgresses={queue.generationProgresses}
            showQueue={showQueue}
            setShowQueue={setShowQueue}
            onRetryTask={queue.retryTask}
            onCancelTask={queue.cancelTask}
            modalSpring={modalSpring}
          />
        </div>
      )}

      {/* Document viewer — shown in fullView mode */}
      {fullView && (
        <DocViewer
          ref={queue.contentRef}
          sources={sources}
          streamingTexts={queue.streamingTexts}
          activeGenerationIds={queue.activeGenerationIds}
          generationQueue={queue.generationQueue}
          selectedDoc={selectedDoc}
          copied={queue.copied}
          onClose={onClose}
          onImportToWorkspace={queue.handleImportToWorkspace}
          onRegenerate={queue.handleRegenerate}
          onExportMd={queue.handleExportMd}
          onCopy={queue.handleCopy}
          onOpenSlides={() => setShowSlideModal(true)}
        />
      )}

      {/* Modales */}
      <ReportModal
        show={showReportModal}
        sources={sources}
        suggestions={suggestions}
        loadingSuggestions={loadingSuggestions}
        onClose={() => { setShowReportModal(false); reportModalTriggerRef.current?.focus(); }}
        onLoadSuggestions={loadSuggestions}
        onSelectSuggestion={handleSelectSuggestion}
        onSelectType={handleModalGenerate}
        scrimSpring={scrimSpring}
        scrimStyle={scrimStyle}
        modalSpring={modalSpring}
        reduceMotion={reduceMotion}
      />

      <InfographicModal
        show={showInfographicModal}
        sources={sources}
        selectedSourceIds={selectedSourceIds}
        infraOrientation={infraOrientation}
        setInfraOrientation={setInfraOrientation}
        infraStyle={infraStyle}
        setInfraStyle={setInfraStyle}
        infraDetail={infraDetail}
        setInfraDetail={setInfraDetail}
        infraLang={infraLang}
        setInfraLang={setInfraLang}
        infraDescription={infraDescription}
        setInfraDescription={setInfraDescription}
        onClose={() => { setShowInfographicModal(false); infographicModalTriggerRef.current?.focus(); }}
        onGenerate={handleInfographicGenerate}
        scrimSpring={scrimSpring}
        scrimStyle={scrimStyle}
        modalSpring={modalSpring}
        reduceMotion={reduceMotion}
      />

      {showSlideModal && selectedDoc && (
        <Suspense fallback={null}>
          <SlidePreviewModal
            open={showSlideModal}
            onClose={() => setShowSlideModal(false)}
            notebookId={notebookId}
            doc={selectedDoc}
          />
        </Suspense>
      )}
    </div>
  );
}
