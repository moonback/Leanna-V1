/**
 * useSourceUpload — logique d'ajout de sources (upload fichiers, drag & drop,
 * URL, texte, presse-papier, import de codebase).
 *
 * Encapsule le « cluster upload/ingest » auparavant mêlé à SourcePanel :
 * l'état des formulaires, la file d'upload, le drag & drop, et les handlers
 * réseau correspondants.
 *
 * `uploading` est exposé avec son setter car il sert aussi d'indicateur
 * « occupé » aux actions de suppression détenues par le parent (comportement
 * d'origine : les boutons sont désactivés pendant toute mutation).
 */

import { useCallback, useRef, useState } from 'react';
import { api } from '../api/client.js';
import type { UploadFileStatus } from './constants.js';

interface UseSourceUploadOptions {
  notebookId: string;
  onRefresh: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

export function useSourceUpload({ notebookId, onRefresh, onSuccess, onError }: UseSourceUploadOptions) {
  const [uploading, setUploading] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadFileStatus[]>([]);
  const [dragOver, setDragOver] = useState(false);

  // Formulaires
  const [showUrlForm, setShowUrlForm] = useState(false);
  const [showTextForm, setShowTextForm] = useState(false);
  const [url, setUrl] = useState('');
  const [textTitle, setTextTitle] = useState('');
  const [textContent, setTextContent] = useState('');

  // Import de codebase
  const [showCodebaseForm, setShowCodebaseForm] = useState(false);
  const [codebaseTitle, setCodebaseTitle] = useState('');
  const [codebaseExtensions, setCodebaseExtensions] = useState('');
  const [codebaseMaxSizeKb, setCodebaseMaxSizeKb] = useState(100);
  const [codebaseIncludeConfig, setCodebaseIncludeConfig] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  // ─── Multi-file upload ──────────────────────────────────────────────────────

  const handleMultiUpload = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    setUploading(true);
    setUploadQueue(files.map(f => ({ name: f.name, status: 'pending' })));

    if (files.length === 1) {
      const file = files[0];
      setUploadQueue([{ name: file.name, status: 'uploading' }]);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const data = await api<{ source: { title: string; wordCount: number; chunksCount: number } }>(
          `/api/notebooks/${notebookId}/sources/upload`,
          { method: 'POST', body: formData },
        );
        setUploadQueue([{ name: file.name, status: 'success' }]);
        onSuccess(`Source "${data.source.title}" ajoutée (${data.source.wordCount} mots, ${data.source.chunksCount} chunks)`);
        onRefresh();
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Upload failed';
        setUploadQueue([{ name: file.name, status: 'error', error: message }]);
        onError(message);
      }
    } else {
      setUploadQueue(files.map(f => ({ name: f.name, status: 'uploading' })));
      try {
        const formData = new FormData();
        for (const file of files) formData.append('files', file);
        const data = await api<{
          results: { filename: string; status: UploadFileStatus['status']; error?: string }[];
          successCount: number;
          errorCount: number;
          total: number;
        }>(`/api/notebooks/${notebookId}/sources/upload-multi`, { method: 'POST', body: formData });
        setUploadQueue(data.results.map((r) => ({
          name: r.filename, status: r.status, error: r.error,
        })));
        if (data.successCount > 0) {
          onSuccess(`${data.successCount}/${data.total} source(s) ajoutée(s)`);
          onRefresh();
        }
        if (data.errorCount > 0) onError(`${data.errorCount} fichier(s) en erreur`);
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Upload failed';
        setUploadQueue(files.map(f => ({ name: f.name, status: 'error', error: message })));
        onError(message);
      }
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setTimeout(() => setUploadQueue([]), 5000);
  }, [notebookId, onSuccess, onError, onRefresh]);

  // ─── Drag & Drop ───────────────────────────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.types.includes('Files')) setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setDragOver(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current = 0;
    setDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) handleMultiUpload(droppedFiles);
  }, [handleMultiUpload]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) handleMultiUpload(files);
  }, [handleMultiUpload]);

  const openFilePicker = useCallback(() => fileInputRef.current?.click(), []);

  // ─── URL / Texte ─────────────────────────────────────────────────────────

  const handleUrlIngest = useCallback(async () => {
    if (!url.trim()) return;
    setUploading(true);
    try {
      const data = await api<{ source: { title: string } }>(
        `/api/notebooks/${notebookId}/sources/url`,
        { method: 'POST', json: { url: url.trim() } },
      );
      onSuccess(`Source "${data.source.title}" ajoutée`);
      setUrl(''); setShowUrlForm(false);
      onRefresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Ingestion failed');
    } finally { setUploading(false); }
  }, [url, notebookId, onSuccess, onError, onRefresh]);

  const handleTextAdd = useCallback(async () => {
    if (!textContent.trim()) return;
    setUploading(true);
    try {
      const data = await api<{ source: { title: string } }>(
        `/api/notebooks/${notebookId}/sources/text`,
        { method: 'POST', json: { title: textTitle.trim() || undefined, content: textContent } },
      );
      onSuccess(`Source "${data.source.title}" ajoutée`);
      setTextTitle(''); setTextContent(''); setShowTextForm(false);
      onRefresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Erreur');
    } finally { setUploading(false); }
  }, [textTitle, textContent, notebookId, onSuccess, onError, onRefresh]);

  // ─── Presse-papier ─────────────────────────────────────────────────────────

  const handleClipboardPaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        onError('Le presse-papier est vide');
        return;
      }
      setTextContent(text);
      setTextTitle('Collé depuis le presse-papier');
      setShowTextForm(true);
      onSuccess('Contenu collé — vérifiez et validez');
    } catch {
      onError("Impossible d'accéder au presse-papier. Autorisez l'accès dans le navigateur.");
    }
  }, [onError, onSuccess]);

  // ─── Import de codebase ───────────────────────────────────────────────────

  const handleCodebaseImport = useCallback(async () => {
    setUploading(true);
    try {
      const extensions = codebaseExtensions.trim()
        ? codebaseExtensions.split(/[\s,;]+/).filter(Boolean).map(e => e.startsWith('.') ? e : `.${e}`)
        : undefined;

      const data = await api<{
        source: { title: string; wordCount: number };
        stats: { filesCollected: number };
      }>(`/api/notebooks/${notebookId}/sources/codebase`, {
        method: 'POST',
        json: {
          title: codebaseTitle.trim() || undefined,
          extensions,
          maxFileSizeKb: codebaseMaxSizeKb,
          includeConfig: codebaseIncludeConfig,
        },
      });
      onSuccess(
        `Codebase importé : "${data.source.title}" — ${data.stats.filesCollected} fichiers, ${data.source.wordCount.toLocaleString()} mots`
      );
      setShowCodebaseForm(false);
      setCodebaseTitle('');
      setCodebaseExtensions('');
      onRefresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Erreur serveur');
    } finally {
      setUploading(false);
    }
  }, [notebookId, codebaseTitle, codebaseExtensions, codebaseMaxSizeKb, codebaseIncludeConfig, onSuccess, onError, onRefresh]);

  // Note : l'effet onUploadProgress reste dans le parent pour conserver le
  // contrat exact avec la prop onUploadProgress (il lit uploadQueue + uploading
  // exposés ci-dessous).

  return {
    // état
    uploading, setUploading,
    uploadQueue,
    dragOver,
    showUrlForm, setShowUrlForm,
    showTextForm, setShowTextForm,
    url, setUrl,
    textTitle, setTextTitle,
    textContent, setTextContent,
    showCodebaseForm, setShowCodebaseForm,
    codebaseTitle, setCodebaseTitle,
    codebaseExtensions, setCodebaseExtensions,
    codebaseMaxSizeKb, setCodebaseMaxSizeKb,
    codebaseIncludeConfig, setCodebaseIncludeConfig,
    fileInputRef,
    // handlers
    handleMultiUpload,
    handleDragOver, handleDragEnter, handleDragLeave, handleDrop,
    handleFileInputChange, openFilePicker,
    handleUrlIngest, handleTextAdd,
    handleClipboardPaste, handleCodebaseImport,
  };
}
