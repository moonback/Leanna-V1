/**
 * useSourceList — logique de la liste des sources (hors upload) : recherche,
 * sélection multiple, aperçu de contenu, ré-indexation, tags et suppression
 * (unitaire, sélection, globale).
 *
 * Extrait de SourcePanel pour alléger l'orchestrateur. `setUploading` est reçu
 * du hook useSourceUpload afin de partager l'indicateur « occupé » (les boutons
 * sont désactivés pendant toute mutation, comportement d'origine).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, apiVoid } from '../api/client.js';
import type { SourceItem } from './constants.js';

interface UseSourceListOptions {
  notebookId: string;
  sources: SourceItem[];
  onRefresh: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
  setUploading: (v: boolean) => void;
}

export function useSourceList({
  notebookId,
  sources,
  onRefresh,
  onSuccess,
  onError,
  setUploading,
}: UseSourceListOptions) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [sourcePreview, setSourcePreview] = useState<Record<string, string>>({});
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [reindexingId, setReindexingId] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState<{ sourceId: string; value: string } | null>(null);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  // Réinitialise la demande de confirmation si l'utilisateur clique ailleurs
  useEffect(() => {
    if (!confirmDeleteAll) return;
    const t = setTimeout(() => setConfirmDeleteAll(false), 4000);
    return () => clearTimeout(t);
  }, [confirmDeleteAll]);

  const filteredSources = useMemo(() => sources.filter(s => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return s.title.toLowerCase().includes(q) ||
      s.summary.toLowerCase().includes(q) ||
      s.keywords.some(k => k.toLowerCase().includes(q));
  }), [sources, searchQuery]);

  const allFilteredSelected = filteredSources.length > 0 && filteredSources.every(s => selectedSources.includes(s.id));

  const handleToggleSelect = useCallback((sourceId: string) => {
    setSelectedSources(prev =>
      prev.includes(sourceId) ? prev.filter(id => id !== sourceId) : [...prev, sourceId]
    );
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedSources(prev => {
      const allSelected = filteredSources.length > 0 && filteredSources.every(s => prev.includes(s.id));
      return allSelected ? [] : filteredSources.map(s => s.id);
    });
  }, [filteredSources]);

  const handleDelete = useCallback(async (sourceId: string) => {
    try {
      await apiVoid(`/api/notebooks/${notebookId}/sources/${sourceId}`, { method: 'DELETE' });
      onSuccess('Source supprimée');
      onRefresh();
    } catch { onError('Impossible de supprimer'); }
  }, [notebookId, onSuccess, onError, onRefresh]);

  const handleDeleteSelected = useCallback(async () => {
    if (selectedSources.length === 0) return;
    setUploading(true);
    try {
      for (const sourceId of selectedSources) {
        await apiVoid(`/api/notebooks/${notebookId}/sources/${sourceId}`, { method: 'DELETE' });
      }
      onSuccess(`${selectedSources.length} source${selectedSources.length > 1 ? 's' : ''} supprimée${selectedSources.length > 1 ? 's' : ''}`);
      setSelectedSources([]);
      onRefresh();
    } catch {
      onError('Impossible de supprimer les sources sélectionnées');
    } finally {
      setUploading(false);
    }
  }, [selectedSources, notebookId, onSuccess, onError, onRefresh, setUploading]);

  const handleDeleteAll = useCallback(async () => {
    if (sources.length === 0) return;
    if (!confirmDeleteAll) { setConfirmDeleteAll(true); return; }

    setConfirmDeleteAll(false);
    setUploading(true);
    try {
      for (const source of sources) {
        await apiVoid(`/api/notebooks/${notebookId}/sources/${source.id}`, { method: 'DELETE' });
      }
      onSuccess(`Toutes les ${sources.length} sources ont été supprimées`);
      setSelectedSources([]);
      onRefresh();
    } catch {
      onError('Impossible de supprimer toutes les sources');
    } finally {
      setUploading(false);
    }
  }, [sources, notebookId, onSuccess, onError, onRefresh, confirmDeleteAll, setUploading]);

  const handleTogglePreview = useCallback(async (sourceId: string) => {
    if (expandedSource === sourceId) {
      setExpandedSource(null);
      return;
    }
    setExpandedSource(sourceId);

    if (!sourcePreview[sourceId]) {
      setLoadingPreview(true);
      try {
        const data = await api<{ content?: string; text?: string }>(
          `/api/notebooks/${notebookId}/sources/${sourceId}/content`,
        );
        setSourcePreview(prev => ({ ...prev, [sourceId]: data.content || data.text || 'Contenu non disponible' }));
      } catch {
        setSourcePreview(prev => ({ ...prev, [sourceId]: 'Erreur de chargement' }));
      } finally {
        setLoadingPreview(false);
      }
    }
  }, [expandedSource, sourcePreview, notebookId]);

  const handleReindex = useCallback(async (sourceId: string) => {
    setReindexingId(sourceId);
    try {
      const data = await api<{ chunksCount?: number }>(
        `/api/notebooks/${notebookId}/sources/${sourceId}/reindex`,
        { method: 'POST' },
      );
      onSuccess(`Re-indexé : ${data.chunksCount || '?'} chunks générés`);
      onRefresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setReindexingId(null);
    }
  }, [notebookId, onSuccess, onError, onRefresh]);

  const handleAddTag = useCallback(async (sourceId: string, tag: string) => {
    if (!tag.trim()) return;
    try {
      await apiVoid(`/api/notebooks/${notebookId}/sources/${sourceId}/tags`, {
        method: 'POST',
        json: { tag: tag.trim() },
      });
      setTagInput(null);
      onRefresh();
    } catch {
      onError("Erreur lors de l'ajout du tag");
    }
  }, [notebookId, onError, onRefresh]);

  const handleRemoveTag = useCallback(async (sourceId: string, tag: string) => {
    try {
      await apiVoid(`/api/notebooks/${notebookId}/sources/${sourceId}/tags`, {
        method: 'DELETE',
        json: { tag },
      });
      onRefresh();
    } catch { /* ignore */ }
  }, [notebookId, onRefresh]);

  return {
    searchQuery, setSearchQuery,
    expandedSource,
    sourcePreview,
    loadingPreview,
    reindexingId,
    tagInput, setTagInput,
    selectedSources,
    confirmDeleteAll,
    filteredSources,
    allFilteredSelected,
    handleToggleSelect,
    handleSelectAll,
    handleDelete,
    handleDeleteSelected,
    handleDeleteAll,
    handleTogglePreview,
    handleReindex,
    handleAddTag,
    handleRemoveTag,
  };
}
