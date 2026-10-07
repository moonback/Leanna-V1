/**
 * AudioOverviewPanel — Génération et lecture de podcasts IA.
 *
 * Orchestrateur mince depuis le découpage (Phase 2) :
 *  - détient l'état de configuration de génération et l'overview sélectionné ;
 *  - détient les actions réseau (générer, régénérer, supprimer, exporter) ;
 *  - délègue la lecture TTS au hook useTtsPlayer ;
 *  - rend AudioGenerator (colonne gauche) et AudioPlayer (colonne droite).
 */

import { useState, useCallback, useEffect } from 'react';
import { useToast } from '../ui/Toast.js';
import { api, apiVoid } from './api/client.js';
import { AudioGenerator } from './audio/AudioGenerator.js';
import { AudioPlayer } from './audio/AudioPlayer.js';
import { useTtsPlayer } from './audio/useTtsPlayer.js';
import type { AudioOverview, AudioSource, Tone } from './audio/types.js';

interface Props {
  notebookId: string;
  overviews: AudioOverview[];
  sources: AudioSource[];
  onRefresh: () => void;
  fullView?: boolean;
  onClose?: () => void;
  onViewDoc?: (doc: { id: string; title: string; type: string; content: string; createdAt: string }) => void;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function AudioOverviewPanel({ notebookId, overviews, sources, onRefresh, fullView = false, onViewDoc }: Props) {
  const { success, error: toastError } = useToast();

  // ─── État de génération / configuration ────────────────────────────────────
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [selectedOverview, setSelectedOverview] = useState<AudioOverview | null>(null);
  const [duration, setDuration] = useState<'short' | 'medium' | 'long'>('medium');
  const [showOptions, setShowOptions] = useState(false);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [tone, setTone] = useState<Tone>('casual');
  const [customInstructions, setCustomInstructions] = useState('');

  // ─── Lecture TTS (hook dédié) ──────────────────────────────────────────────
  const player = useTtsPlayer({ notebookId, selectedOverview, onError: toastError });

  // Initialiser la sélection de sources avec toutes les sources (une fois les
  // sources chargées). La garde `length === 0` rend l'effet idempotent : une
  // fois peuplée, il ne réécrit plus la sélection.
  useEffect(() => {
    if (selectedSourceIds.length === 0 && sources.length > 0) {
      setSelectedSourceIds(sources.map(s => s.id));
    }
  }, [sources, selectedSourceIds.length]);

  const toggleSource = useCallback((sourceId: string) => {
    setSelectedSourceIds(prev =>
      prev.includes(sourceId)
        ? prev.filter(id => id !== sourceId)
        : [...prev, sourceId]
    );
  }, []);

  const selectAllSources = useCallback(() => setSelectedSourceIds(sources.map(s => s.id)), [sources]);
  const deselectAllSources = useCallback(() => setSelectedSourceIds([]), []);

  const handleGenerate = useCallback(async (): Promise<AudioOverview | null> => {
    setGenerating(true);
    try {
      const data = await api<{ overview: AudioOverview }>(
        `/api/notebooks/${notebookId}/audio-overview`,
        {
          method: 'POST',
          json: {
            duration,
            sourceIds: selectedSourceIds.length < sources.length ? selectedSourceIds : undefined,
            tone: tone !== 'casual' ? tone : undefined,
            customInstructions: customInstructions.trim() || undefined,
          },
        },
      );
      if (data.overview.status === 'ready') {
        success('Audio Overview généré !');
        setSelectedOverview(data.overview);
        onRefresh();
        return data.overview;
      }
      toastError('Erreur lors de la génération');
      onRefresh();
      return null;
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Erreur');
      return null;
    } finally {
      setGenerating(false);
    }
  }, [notebookId, duration, selectedSourceIds, sources.length, tone, customInstructions, success, toastError, onRefresh]);

  const handleSaveToSandbox = useCallback(async () => {
    if (!selectedOverview) return;
    setDownloading(true);
    try {
      const data = await api<{ filePath: string }>(
        `/api/notebooks/${notebookId}/audio-overviews/${selectedOverview.id}/export?save=sandbox`,
      );
      success(`Script audio sauvegardé dans la sandbox : ${data.filePath}`);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setDownloading(false);
    }
  }, [notebookId, selectedOverview, success, toastError]);

  const handleDelete = useCallback(async (overviewId: string) => {
    try {
      await apiVoid(`/api/notebooks/${notebookId}/audio-overviews/${overviewId}`, {
        method: 'DELETE',
      });
      success('Audio overview supprimé');
      if (selectedOverview?.id === overviewId) {
        setSelectedOverview(null);
      }
      onRefresh();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Erreur');
    }
  }, [notebookId, selectedOverview, success, toastError, onRefresh]);

  const handleRegenerate = useCallback(async () => {
    if (!selectedOverview) return;
    const previousId = selectedOverview.id;

    // Opération atomique : on génère d'abord. L'ancien overview n'est supprimé
    // qu'une fois le nouveau obtenu, pour ne jamais perdre les deux en cas d'échec.
    const newOverview = await handleGenerate();
    if (!newOverview || newOverview.id === previousId) {
      return;
    }

    // Génération réussie : on supprime l'ancien overview en arrière-plan.
    try {
      await apiVoid(`/api/notebooks/${notebookId}/audio-overviews/${previousId}`, {
        method: 'DELETE',
      });
    } catch {
      toastError("Nouvel audio généré, mais l'ancien n'a pas pu être supprimé.");
    }
    onRefresh();
  }, [notebookId, selectedOverview, handleGenerate, toastError, onRefresh]);

  const handleDownloadScript = useCallback(() => {
    if (!selectedOverview) return;
    const blob = new Blob([`# ${selectedOverview.title}\n\n${selectedOverview.script}`], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedOverview.title.replace(/[^a-zA-Z0-9]/g, '-')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    success('Script téléchargé');
  }, [selectedOverview, success]);

  const handleSelectOverview = useCallback((ov: AudioOverview) => {
    setSelectedOverview(ov);
    if (onViewDoc && !fullView) {
      onViewDoc({ id: ov.id, title: ov.title, type: 'audio-overview', content: ov.script, createdAt: ov.createdAt });
    }
  }, [onViewDoc, fullView]);

  return (
    <div className={`h-full ${fullView ? 'flex flex-col lg:flex-row' : 'flex flex-col'}`}>
      <AudioGenerator
        fullView={fullView}
        sources={sources}
        overviews={overviews}
        selectedOverview={selectedOverview}
        duration={duration}
        setDuration={setDuration}
        showOptions={showOptions}
        setShowOptions={setShowOptions}
        tone={tone}
        setTone={setTone}
        selectedSourceIds={selectedSourceIds}
        toggleSource={toggleSource}
        selectAllSources={selectAllSources}
        deselectAllSources={deselectAllSources}
        customInstructions={customInstructions}
        setCustomInstructions={setCustomInstructions}
        generating={generating}
        onGenerate={handleGenerate}
        onSelectOverview={handleSelectOverview}
        onDelete={handleDelete}
        formatDuration={formatDuration}
      />

      {fullView && selectedOverview && (
        <AudioPlayer
          selectedOverview={selectedOverview}
          playing={player.playing}
          ttsLoading={player.ttsLoading}
          currentLineIndex={player.currentLineIndex}
          ttsProgress={player.ttsProgress}
          ttsTotalLines={player.ttsTotalLines}
          playbackSpeed={player.playbackSpeed}
          onPlay={player.playTTS}
          onStop={player.stopTTS}
          onCycleSpeed={player.cycleSpeed}
          generating={generating}
          downloading={downloading}
          onRegenerate={handleRegenerate}
          onDelete={handleDelete}
          onSaveToSandbox={handleSaveToSandbox}
          onDownloadScript={handleDownloadScript}
          formatDuration={formatDuration}
        />
      )}
    </div>
  );
}
