/**
 * NotebookChat — Chat Q&A groundé sur les sources du notebook
 *
 * Interface de conversation avec citations, streaming SSE, suggestions,
 * deep dive, rendu markdown, et UX amélioré.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import { BookOpen } from 'lucide-react';
import { useToast } from '../ui/Toast.js';
import { api } from './api/client.js';
import type { ChatMessage, SandboxFolder } from './chat/types.js';
import { SLASH_COMMANDS, CONTEXT_SUGGESTIONS, PERSONALITIES } from './chat/constants.js';
import { errorMessage } from './utils.js';
import { useChatStream } from './chat/useChatStream.js';
import { useChatThreads } from './chat/useChatThreads.js';
import { useTts } from './chat/useTts.js';
import { ThreadBar } from './chat/ThreadBar.js';
import { MessageList } from './chat/MessageList.js';
import { Composer } from './chat/Composer.js';
import { FolderPickerModal } from './chat/FolderPickerModal.js';
import { NotebookVoicePanel } from './chat/NotebookVoicePanel.js';

interface Props {
  notebookId: string;
  hasSources: boolean;
  sources?: { id: string; title: string }[];
  onRefresh?: () => void;
}

export function NotebookChat({ notebookId, hasSources, sources = [], onRefresh }: Props) {
  const { error: toastError, success: toastSuccess } = useToast();
  const prefersReducedMotion = useReducedMotion();

  // ─── État composer / UI détenu par le parent ──────────────────────────────
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionOffset, setSuggestionOffset] = useState(0);
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [followUpOffset, setFollowUpOffset] = useState(0);
  const [showCitations, setShowCitations] = useState<string | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [showSourceFilter, setShowSourceFilter] = useState(false);
  const [personality, setPersonality] = useState<string>('default');
  const [showPersonalityMenu, setShowPersonalityMenu] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  // Folder Picker (save as MD)
  const [folderPickerMsg, setFolderPickerMsg] = useState<ChatMessage | null>(null);
  const [sandboxFolders, setSandboxFolders] = useState<SandboxFolder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [customFolderName, setCustomFolderName] = useState('');
  const [savingMd, setSavingMd] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // ─── Moteur de chat (messages, streaming, FIFO, générateurs, persistance) ──
  const stream = useChatStream({
    notebookId, sources, onRefresh,
    selectedSources, personality, activeThreadId, setFollowUps,
    onSuccess: toastSuccess, onError: toastError,
  });
  const {
    messages, setMessages,
    loading, loadingHistory, streamingText, deepDiveProgress, queuedCount,
    hoveredCitation, setHoveredCitation,
    copiedMsgId, editingMsgId, editingContent, setEditingContent, feedbackMap,
    inputRef,
    handleSend, handleRetry, handleEditStart, handleEditCancel, handleEditSubmit,
    handleDeepDive, handleCompare, handleInsights, handleClear, handleStopStreaming,
    handleCopy, handleFeedback, handleExport, handleSaveToNote,
    fetchCitationChunk, openFolderPickerData, saveMessageMarkdown,
  } = stream;

  // ─── Threads ───────────────────────────────────────────────────────────────
  const {
    threads, showThreadList, setShowThreadList,
    handleNewThread, handleSwitchThread, handleDeleteThread,
  } = useChatThreads({
    notebookId, activeThreadId, setActiveThreadId,
    setMessages, setStreamingText: stream.setStreamingText,
    setFollowUps,
  });

  // ─── TTS ─────────────────────────────────────────────────────────────────
  const { speakingMsgId, handleTTS } = useTts();

  // Charger les suggestions une seule fois au montage
  const suggestionsLoadedRef = useRef(false);
  useEffect(() => {
    if (!hasSources || suggestionsLoadedRef.current) return;
    suggestionsLoadedRef.current = true;
    (async () => {
      try {
        const data = await api<{ suggestions?: string[] }>(
          `/api/notebooks/${notebookId}/chat/suggestions`,
        );
        setSuggestions(data.suggestions || []);
      } catch { /* ignore */ }
    })();
  }, [notebookId, hasSources]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    setShowScrollBtn(!atBottom && messages.length > 3);
  }, [messages.length]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Close context menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (showContextMenu && !target.closest?.('.context-menu-container')) {
        setShowContextMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showContextMenu]);

  // ─── Folder picker (save as MD) ────────────────────────────────────────────
  const openFolderPicker = useCallback(async (msg: ChatMessage) => {
    setFolderPickerMsg(msg);
    setSelectedFolder('');
    setCustomFolderName('');
    setSandboxFolders(await openFolderPickerData());
  }, [openFolderPickerData]);

  const handleSaveAsMarkdown = useCallback(async () => {
    if (!folderPickerMsg) return;
    setSavingMd(true);
    try {
      const folder = customFolderName.trim() ? customFolderName.trim() : selectedFolder;
      const filePath = await saveMessageMarkdown(folderPickerMsg.id, folder || undefined);
      const { ideApi } = await import('../../services/ideApi.js');
      ideApi.invalidateCache();
      window.dispatchEvent(new CustomEvent('Leanna-sandbox-changed'));
      toastSuccess(`✓ Sauvegardé : ${filePath}`);
      setFolderPickerMsg(null);
    } catch (e: unknown) {
      toastError(`Erreur : ${errorMessage(e)}`);
    } finally {
      setSavingMd(false);
    }
  }, [folderPickerMsg, selectedFolder, customFolderName, saveMessageMarkdown, toastError, toastSuccess]);

  // ─── Source filter (composer) ──────────────────────────────────────────────
  const toggleSourceFilter = useCallback((sourceId: string) => {
    setSelectedSources(prev =>
      prev.includes(sourceId) ? prev.filter(id => id !== sourceId) : [...prev, sourceId]
    );
  }, []);

  const clearSourceFilter = useCallback(() => {
    setSelectedSources([]);
    setShowSourceFilter(false);
  }, []);

  // ─── Slash commands / personalités (dérivés) ──────────────────────────────
  const slashCommands = SLASH_COMMANDS;
  const contextSuggestions = CONTEXT_SUGGESTIONS;
  const showSlashMenu = input.startsWith('/') && !input.includes(' ');
  const filteredSlashCommands = showSlashMenu
    ? slashCommands.filter(c => c.cmd.startsWith(input.toLowerCase()))
    : [];
  const personalities = PERSONALITIES;
  const currentPersonality = personalities.find(p => p.id === personality) || personalities[0];

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, []);

  // Envoi depuis le composer : vide le champ puis délègue au moteur.
  const submitInput = useCallback(() => {
    const q = input.trim();
    if (!q) return;
    setInput('');
    handleSend(q);
  }, [input, handleSend]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitInput();
    }
  }, [submitInput]);

  // ─── Empty state: no sources ───────────────────────────────────────────────

  if (!hasSources) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-5 p-8">
        <div className="notebook-empty-state-icon">
          <BookOpen className="w-6 h-6" />
        </div>
        <div className="text-center space-y-2">
          <p className="text-base font-medium" style={{ color: 'var(--text-primary)' }}>
            Ajoutez des sources pour commencer
          </p>
          <p className="text-sm max-w-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Importez des documents dans le panneau Sources, puis posez des questions ici.
            L'IA répondra en citant les passages pertinents.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-transparent">
      <ThreadBar
        threads={threads}
        activeThreadId={activeThreadId}
        showThreadList={showThreadList}
        setShowThreadList={setShowThreadList}
        messages={messages}
        onSwitchThread={handleSwitchThread}
        onDeleteThread={handleDeleteThread}
        onNewThread={handleNewThread}
        prefersReducedMotion={prefersReducedMotion}
        voiceSlot={
          <NotebookVoicePanel
            notebookId={notebookId}
            selectedSources={selectedSources}
            prefersReducedMotion={prefersReducedMotion}
            onError={toastError}
            onInfo={toastSuccess}
            onDocumentGenerated={() => {
              // On NE recharge PAS tout le notebook ici : loadNotebook() repasse par
              // l'état "loading" qui démonte NotebookChat → coupe la session vocale.
              // Les panneaux concernés (Historique, barre de progression) se
              // rafraîchissent via ces CustomEvents ciblés, sans remontage.
              window.dispatchEvent(new CustomEvent('notebook-generated-docs-changed', { detail: { notebookId } }));
            }}
          />
        }
      />

      <MessageList
        scrollContainerRef={scrollContainerRef}
        messagesEndRef={messagesEndRef}
        onScroll={handleScroll}
        loadingHistory={loadingHistory}
        messages={messages}
        suggestions={suggestions}
        suggestionOffset={suggestionOffset}
        setSuggestionOffset={setSuggestionOffset}
        followUps={followUps}
        followUpOffset={followUpOffset}
        setFollowUpOffset={setFollowUpOffset}
        streamingText={streamingText}
        deepDiveProgress={deepDiveProgress}
        loading={loading}
        showScrollBtn={showScrollBtn}
        hoveredCitation={hoveredCitation}
        prefersReducedMotion={prefersReducedMotion}
        onSend={handleSend}
        onStopStreaming={handleStopStreaming}
        scrollToBottom={scrollToBottom}
        editingMsgId={editingMsgId}
        editingContent={editingContent}
        setEditingContent={setEditingContent}
        copiedMsgId={copiedMsgId}
        speakingMsgId={speakingMsgId}
        feedbackMap={feedbackMap}
        showCitations={showCitations}
        setShowCitations={setShowCitations}
        setHoveredCitation={setHoveredCitation}
        onCopy={handleCopy}
        onRetry={handleRetry}
        onTTS={handleTTS}
        onSaveToNote={handleSaveToNote}
        onOpenFolderPicker={openFolderPicker}
        onFeedback={handleFeedback}
        onEditStart={handleEditStart}
        onEditCancel={handleEditCancel}
        onEditSubmit={handleEditSubmit}
        onFetchCitation={fetchCitationChunk}
      />

      <Composer
        sources={sources}
        input={input}
        setInput={setInput}
        inputRef={inputRef}
        loading={loading}
        queuedCount={queuedCount}
        messages={messages}
        selectedSources={selectedSources}
        showSourceFilter={showSourceFilter}
        setShowSourceFilter={setShowSourceFilter}
        toggleSourceFilter={toggleSourceFilter}
        clearSourceFilter={clearSourceFilter}
        showSlashMenu={showSlashMenu}
        filteredSlashCommands={filteredSlashCommands}
        showContextMenu={showContextMenu}
        setShowContextMenu={setShowContextMenu}
        contextSuggestions={contextSuggestions}
        personalities={personalities}
        personality={personality}
        setPersonality={setPersonality}
        showPersonalityMenu={showPersonalityMenu}
        setShowPersonalityMenu={setShowPersonalityMenu}
        currentPersonality={currentPersonality}
        prefersReducedMotion={prefersReducedMotion}
        onInputChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onSubmit={submitInput}
        onSend={handleSend}
        onDeepDive={() => { const q = input; setInput(''); handleDeepDive(q); }}
        onInsights={handleInsights}
        onCompare={handleCompare}
        onExport={handleExport}
        onClear={handleClear}
      />

      <FolderPickerModal
        folderPickerMsg={folderPickerMsg}
        sandboxFolders={sandboxFolders}
        selectedFolder={selectedFolder}
        setSelectedFolder={setSelectedFolder}
        customFolderName={customFolderName}
        setCustomFolderName={setCustomFolderName}
        savingMd={savingMd}
        prefersReducedMotion={prefersReducedMotion}
        onClose={() => setFolderPickerMsg(null)}
        onSave={handleSaveAsMarkdown}
      />
    </div>
  );
}
