import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bot,
  Clock,
  Code2,
  ExternalLink,
  Globe,
  History,
  Home,
  Loader2,
  Lock,
  RefreshCw,
  Search,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { BrowserProfileSwitcher } from './BrowserProfileSwitcher.js';
import { BrowserExtensionsMenu } from './BrowserExtensionsMenu.js';
import type { BrowserHistoryEntry } from './useBrowserHistory.js';
import type { BrowserProfile } from './useBrowserProfiles.js';
import type { BrowserExtensionInfo } from '../../types/electron.js';

interface BrowserToolbarProps {
  pageTitle: string;
  assistantNavActive: boolean;
  currentUrl: string;
  inputValue: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  onClose: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
  onInputChange: (value: string) => void;
  onInputKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onRefresh: () => void;
  onHome: () => void;
  onOpenExternal: () => void;
  /** Zoom. */
  zoomPercent: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  /** Recherche dans la page. */
  onToggleFind: () => void;
  /** Bascule les outils de développement de la page. */
  onToggleDevTools: () => void;
  /** Fournit les suggestions d'autocomplétion pour une saisie. */
  getSuggestions: (query: string) => BrowserHistoryEntry[];
  /** Navigue vers l'URL d'une suggestion sélectionnée. */
  onSelectSuggestion: (url: string) => void;
  /** Efface l'intégralité de l'historique de navigation. */
  onClearHistory: () => void;
  /** Profils de navigation disponibles. */
  profiles: BrowserProfile[];
  /** Profil actuellement actif. */
  activeProfile: BrowserProfile;
  /** Bascule vers un autre profil (remonte le webview). */
  onSwitchProfile: (id: string) => void;
  /** Crée un nouveau profil isolé. */
  onCreateProfile: (name: string) => BrowserProfile;
  /** Renomme un profil existant. */
  onRenameProfile: (id: string, name: string) => void;
  /** Supprime un profil (sauf le profil par défaut). */
  onDeleteProfile: (id: string) => void;
  /** true si les extensions Chromium sont disponibles (Electron). */
  extensionsSupported: boolean;
  /** Extensions chargées pour le profil actif. */
  extensions: BrowserExtensionInfo[];
  /** Opération d'extension en cours. */
  extensionsLoading: boolean;
  /** Dernière erreur d'extension (ou null). */
  extensionsError: string | null;
  /** Charge une extension décompressée (sélecteur de dossier). */
  onLoadExtension: () => void;
  /** Retire une extension par identifiant. */
  onRemoveExtension: (id: string) => void;
}

/** Retire le protocole et le www. pour un affichage plus lisible. */
function prettifyUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/^www\./, '');
}

export function BrowserToolbar({
  pageTitle,
  assistantNavActive,
  currentUrl,
  inputValue,
  loading,
  canGoBack,
  canGoForward,
  onClose,
  inputRef,
  onInputChange,
  onInputKeyDown,
  onGoBack,
  onGoForward,
  onRefresh,
  onHome,
  onOpenExternal,
  zoomPercent,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onToggleFind,
  onToggleDevTools,
  getSuggestions,
  onSelectSuggestion,
  onClearHistory,
  profiles,
  activeProfile,
  onSwitchProfile,
  onCreateProfile,
  onRenameProfile,
  onDeleteProfile,
  extensionsSupported,
  extensions,
  extensionsLoading,
  extensionsError,
  onLoadExtension,
  onRemoveExtension,
}: BrowserToolbarProps) {
  const secure = currentUrl.startsWith('https://');

  const [focused, setFocused] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  // Suggestions recalculées à chaque frappe. On n'affiche pas de suggestion
  // identique à la saisie exacte (évite une entrée redondante).
  const suggestions = useMemo(() => {
    if (!focused) return [];
    const list = getSuggestions(inputValue);
    return list.filter(s => s.url !== inputValue.trim());
  }, [focused, inputValue, getSuggestions]);

  const open = focused && suggestions.length > 0;

  // Réinitialiser le surlignage quand la liste change ou se ferme.
  useEffect(() => {
    setHighlightIndex(-1);
  }, [inputValue, focused]);

  // Fermer le menu si on clique en dehors.
  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  const commitSuggestion = (entry: BrowserHistoryEntry) => {
    onInputChange(entry.url);
    setFocused(false);
    setHighlightIndex(-1);
    onSelectSuggestion(entry.url);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (open) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setHighlightIndex(i => (i + 1) % suggestions.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setHighlightIndex(i => (i <= 0 ? suggestions.length - 1 : i - 1));
        return;
      }
      if (event.key === 'Enter' && highlightIndex >= 0) {
        event.preventDefault();
        commitSuggestion(suggestions[highlightIndex]);
        return;
      }
      if (event.key === 'Escape') {
        // Première échappée : fermer juste le menu, sans réinitialiser l'URL.
        event.preventDefault();
        event.stopPropagation();
        setFocused(false);
        setHighlightIndex(-1);
        return;
      }
    }
    // Sinon, déléguer au panel (Enter = naviguer, Escape = restaurer l'URL).
    onInputKeyDown(event);
  };

  return (
    <div className="flex flex-col gap-2 px-2.5 py-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-base)', backgroundColor: 'var(--bg-panel)' }}>
      <div className="flex items-center justify-between gap-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Globe size={14} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
          <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }} title={pageTitle || 'Navigateur'}>
            {pageTitle || 'Navigateur'}
          </span>
          {assistantNavActive && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{
              backgroundColor: 'var(--color-accent-alt-subtle)',
              color: 'var(--color-accent-alt)',
              border: '1px solid color-mix(in srgb, var(--color-accent-alt) 30%, transparent)',
            }}>
              <Bot size={10} />
              Leanna
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <BrowserExtensionsMenu
            supported={extensionsSupported}
            extensions={extensions}
            loading={extensionsLoading}
            error={extensionsError}
            onLoadExtension={onLoadExtension}
            onRemoveExtension={onRemoveExtension}
          />
          <BrowserProfileSwitcher
            profiles={profiles}
            activeProfile={activeProfile}
            onSwitchProfile={onSwitchProfile}
            onCreateProfile={onCreateProfile}
            onRenameProfile={onRenameProfile}
            onDeleteProfile={onDeleteProfile}
          />
          <button type="button" onClick={onClose} className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-[var(--bg-active)] transition" title="Fermer le navigateur" aria-label="Fermer le navigateur">
            <X size={14} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-0.5">
        <ToolbarButton label="Page précédente" onClick={onGoBack} disabled={!canGoBack}><ArrowLeft size={13} /></ToolbarButton>
        <ToolbarButton label="Page suivante" onClick={onGoForward} disabled={!canGoForward}><ArrowRight size={13} /></ToolbarButton>
        <ToolbarButton label={loading ? 'Arrêter le chargement' : 'Actualiser'} onClick={onRefresh}>
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
        </ToolbarButton>
        <ToolbarButton label="Page d'accueil" onClick={onHome}><Home size={13} /></ToolbarButton>
        <ToolbarButton label="Rechercher dans la page (Ctrl+F)" onClick={onToggleFind}><Search size={13} /></ToolbarButton>
        <ToolbarButton label="Ouvrir dans une nouvelle fenêtre" onClick={onOpenExternal}><ExternalLink size={13} /></ToolbarButton>

        <div ref={containerRef} className="relative flex flex-1 min-w-0">
          <div className="flex flex-1 items-center gap-1.5 min-w-0 rounded-full px-3 py-1.5" style={{
            backgroundColor: 'var(--bg-input, var(--bg-secondary))',
            border: `1px solid ${assistantNavActive ? 'var(--accent-primary)' : focused ? 'var(--border-focus)' : 'var(--border-base)'}`,
            boxShadow: assistantNavActive
              ? '0 0 0 3px var(--accent-subtle)'
              : focused
                ? '0 0 0 3px var(--accent-subtle)'
                : 'none',
            transition: 'border-color 0.15s, box-shadow 0.15s',
          }}>
            {secure ? (
              <Lock size={11} style={{ color: 'var(--color-success)', flexShrink: 0 }} aria-label="Connexion sécurisée (HTTPS)" />
            ) : (
              <AlertTriangle size={11} style={{ color: 'var(--color-warning)', flexShrink: 0 }} aria-label="Connexion non sécurisée (HTTP)" />
            )}
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={event => onInputChange(event.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setFocused(true)}
              className="flex-1 bg-transparent outline-none text-sm min-w-0"
              style={{ color: 'var(--text-primary)' }}
              placeholder="Entrez une URL ou une recherche…"
              aria-label="Barre d'adresse"
              aria-autocomplete="list"
              aria-expanded={open}
              aria-controls="browser-url-suggestions"
              role="combobox"
              spellCheck={false}
            />
          </div>

          {open && (
            <ul
              id="browser-url-suggestions"
              role="listbox"
              className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg overflow-hidden shadow-lg"
              style={{
                backgroundColor: 'var(--bg-panel, var(--bg-secondary))',
                border: '1px solid var(--border-base)',
                maxHeight: '320px',
                overflowY: 'auto',
              }}
            >
              {suggestions.map((entry, index) => {
                const active = index === highlightIndex;
                return (
                  <li
                    key={entry.url}
                    role="option"
                    aria-selected={active}
                    // onMouseDown plutôt que onClick : évite que le blur de
                    // l'input ne ferme le menu avant que la sélection s'exécute.
                    onMouseDown={e => { e.preventDefault(); commitSuggestion(entry); }}
                    onMouseEnter={() => setHighlightIndex(index)}
                    className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer transition"
                    style={{ backgroundColor: active ? 'var(--bg-active)' : 'transparent' }}
                  >
                    {entry.visitCount > 1
                      ? <History size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                      : <Clock size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
                    <div className="flex flex-col min-w-0 flex-1">
                      {entry.title && (
                        <span className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                          {entry.title}
                        </span>
                      )}
                      <span className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                        {prettifyUrl(entry.url)}
                      </span>
                    </div>
                  </li>
                );
              })}
              <li
                role="option"
                aria-selected={false}
                onMouseDown={e => { e.preventDefault(); onClearHistory(); setFocused(false); }}
                className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer transition hover:bg-[var(--bg-active)]"
                style={{ borderTop: '1px solid var(--border-base)' }}
              >
                <Trash2 size={12} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Effacer l'historique de navigation</span>
              </li>
            </ul>
          )}
        </div>

        <span className="w-px h-5 mx-1 flex-shrink-0" style={{ backgroundColor: 'var(--border-base)' }} aria-hidden="true" />

        <ToolbarButton label="Dézoomer" onClick={onZoomOut}><ZoomOut size={13} /></ToolbarButton>
        <button
          type="button"
          onClick={onZoomReset}
          className="h-7 px-1.5 rounded-lg transition hover:bg-[var(--bg-active)] text-xs font-medium tabular-nums"
          style={{ color: zoomPercent === 100 ? 'var(--text-muted)' : 'var(--accent-primary)', minWidth: 42 }}
          title="Réinitialiser le zoom"
          aria-label={`Zoom ${zoomPercent} %, cliquer pour réinitialiser`}
        >
          {zoomPercent}%
        </button>
        <ToolbarButton label="Zoomer" onClick={onZoomIn}><ZoomIn size={13} /></ToolbarButton>
        <ToolbarButton label="Outils de développement" onClick={onToggleDevTools}><Code2 size={13} /></ToolbarButton>
      </div>
    </div>
  );
}

function ToolbarButton({ label, onClick, disabled, children, active = false }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center w-7 h-7 rounded-lg transition hover:bg-[var(--bg-active)] disabled:opacity-30 disabled:cursor-not-allowed"
      style={active ? { backgroundColor: 'var(--btn-active-bg, var(--accent-subtle))' } : undefined}
      title={label}
      aria-label={label}
    >
      <span style={{ color: active ? 'var(--accent-primary)' : 'var(--text-muted)', display: 'inline-flex' }}>{children}</span>
    </button>
  );
}
