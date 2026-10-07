import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { FileIcon } from './FileIcon.js';
import { Tooltip } from '../ui/Tooltip.js';
import {
  Search, X, CaseSensitive, Regex, ChevronRight,
  ChevronDown, Loader2,
} from 'lucide-react';

// ── Auth helpers ───────────────────────────────────────────────────────────

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('Leanna_api_token');
  return token ? { 'x-Leanna-token': token } : {};
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface SearchMatch {
  file: string;
  line: number;
  column: number;
  preview: string;
}

interface SearchResultGroup {
  file: string;
  matches: SearchMatch[];
  expanded: boolean;
}

interface GlobalSearchProps {
  onOpenFile: (path: string, line?: number, column?: number) => void;
  onClose: () => void;
}

// ── Flat list of navigable items ───────────────────────────────────────────

interface FlatItem {
  kind: 'file' | 'match';
  file: string;
  match?: SearchMatch;
  /** Stable id for aria-activedescendant */
  id: string;
}

function buildFlatItems(groups: SearchResultGroup[]): FlatItem[] {
  const items: FlatItem[] = [];
  for (const g of groups) {
    items.push({ kind: 'file', file: g.file, id: `gs-file-${g.file}` });
    if (g.expanded) {
      for (let i = 0; i < g.matches.length; i++) {
        items.push({
          kind: 'match',
          file: g.file,
          match: g.matches[i],
          id: `gs-match-${g.file}-${i}`,
        });
      }
    }
  }
  return items;
}

// ── Highlight matched text ─────────────────────────────────────────────────

function HighlightedLine({ text, query, caseSensitive }: {
  text: string;
  query: string;
  caseSensitive: boolean;
}) {
  if (!query) return <span>{text}</span>;

  const flags = caseSensitive ? 'g' : 'gi';
  try {
    const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    const parts: React.ReactNode[] = [];
    let last = 0;
    let match: RegExpExecArray | null;

    while ((match = re.exec(text)) !== null) {
      if (match.index > last) parts.push(text.slice(last, match.index));
      parts.push(
        <mark
          key={match.index}
          style={{ backgroundColor: 'rgba(255,200,0,0.3)', color: 'inherit', borderRadius: 2 }}
        >
          {match[0]}
        </mark>
      );
      last = re.lastIndex;
      if (!re.global) break;
    }

    if (last < text.length) parts.push(text.slice(last));
    return <>{parts}</>;
  } catch {
    return <span>{text}</span>;
  }
}

// ── Component ──────────────────────────────────────────────────────────────

export function GlobalSearch({ onOpenFile, onClose }: GlobalSearchProps) {
  const [query, setQuery]                 = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex]           = useState(false);
  const [loading, setLoading]             = useState(false);
  const [groups, setGroups]               = useState<SearchResultGroup[]>([]);
  const [totalMatches, setTotalMatches]   = useState(0);
  const [error, setError]                 = useState<string | null>(null);
  /** Index into the flat navigable list; -1 = nothing selected */
  const [activeIdx, setActiveIdx]         = useState(-1);

  const inputRef    = useRef<HTMLInputElement>(null);
  const listRef     = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** AbortController for the current in-flight search request */
  const abortRef    = useRef<AbortController | null>(null);

  const listboxId  = useId();
  const inputId    = useId();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Flat list rebuilt on every groups change
  const flatItems = buildFlatItems(groups);
  const activeItem = activeIdx >= 0 && activeIdx < flatItems.length
    ? flatItems[activeIdx]
    : null;

  // Scroll active item into view
  useEffect(() => {
    if (!activeItem) return;
    const el = document.getElementById(activeItem.id);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeItem]);

  // ── Search ─────────────────────────────────────────────────────────────────

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setGroups([]);
      setTotalMatches(0);
      setError(null);
      setActiveIdx(-1);
      return;
    }

    // Cancel any in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setActiveIdx(-1);

    try {
      const response = await fetch('/api/ide/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ query: q, caseSensitive, regex: useRegex }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const results: SearchMatch[] = data.results ?? [];

      const byFile = new Map<string, SearchMatch[]>();
      for (const r of results) {
        if (!byFile.has(r.file)) byFile.set(r.file, []);
        byFile.get(r.file)!.push(r);
      }

      setGroups(
        [...byFile.entries()].map(([file, matches]) => ({
          file,
          matches,
          expanded: true,
        }))
      );
      setTotalMatches(results.length);
    } catch (e: any) {
      if (e.name === 'AbortError') return; // requête annulée — pas d'erreur UI
      setError(e.message || 'Erreur inconnue');
    } finally {
      // Only clear loading if this controller is still current
      if (abortRef.current === controller) {
        setLoading(false);
        abortRef.current = null;
      }
    }
  }, [caseSensitive, useRegex]);

  // Abort on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(query), 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, caseSensitive, useRegex, runSearch]);

  // Toggle group expand
  const toggleGroup = useCallback((file: string) => {
    setGroups(prev => prev.map(g =>
      g.file === file ? { ...g, expanded: !g.expanded } : g
    ));
    setActiveIdx(-1);
  }, []);

  // ── Keyboard navigation ────────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const flat = buildFlatItems(groups);

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        onClose();
        return;

      case 'ArrowDown': {
        e.preventDefault();
        setActiveIdx(prev => {
          const next = prev < flat.length - 1 ? prev + 1 : 0;
          return next;
        });
        return;
      }

      case 'ArrowUp': {
        e.preventDefault();
        setActiveIdx(prev => {
          const next = prev > 0 ? prev - 1 : flat.length - 1;
          return next;
        });
        return;
      }

      case 'Enter': {
        e.preventDefault();
        if (activeIdx < 0 || activeIdx >= flat.length) return;
        const item = flat[activeIdx];
        if (item.kind === 'file') {
          // Toggle expand/collapse
          toggleGroup(item.file);
        } else if (item.match) {
          onOpenFile(item.match.file, item.match.line, item.match.column);
          onClose();
        }
        return;
      }

      default:
        break;
    }
  }, [groups, activeIdx, onClose, onOpenFile, toggleGroup]);

  return (
    <div
      className="flex h-full flex-col"
      style={{ color: 'var(--text-primary)' }}
      onKeyDown={handleKeyDown}
      /* Trap key events before they bubble to the IDE */
    >
      {/* Header */}
      <div
        className="flex items-center justify-between border-b px-3 py-2"
        style={{ borderColor: 'var(--border-base)' }}
      >
        <span
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: 'var(--text-muted)' }}
          id={`${inputId}-label`}
        >
          Recherche
        </span>
        <button
          onClick={onClose}
          className="rounded p-1 hover:bg-[var(--bg-active)]"
          aria-label="Fermer la recherche"
        >
          <X size={13} style={{ color: 'var(--text-muted)' }} />
        </button>
      </div>

      {/* Combobox input + options */}
      <div className="p-2 space-y-1.5" role="search" aria-label="Recherche dans les fichiers">
        <div
          className="flex items-center gap-1.5 rounded-lg border px-2 py-1.5"
          style={{ borderColor: 'var(--border-base)', backgroundColor: 'rgba(255,255,255,0.04)' }}
        >
          {loading
            ? <Loader2 size={13} className="animate-spin" style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
            : <Search size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} aria-hidden="true" />
          }
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={groups.length > 0}
            aria-controls={listboxId}
            aria-activedescendant={activeItem?.id}
            aria-label="Terme de recherche"
            aria-busy={loading}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher dans les fichiers..."
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--text-primary)' }}
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button
              onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              className="rounded p-0.5 hover:bg-[var(--bg-active)]"
              aria-label="Effacer la recherche"
            >
              <X size={11} style={{ color: 'var(--text-muted)' }} />
            </button>
          )}

          {/* Options */}
          <div
            className="flex items-center gap-0.5 border-l pl-1.5"
            style={{ borderColor: 'var(--border-base)' }}
            role="group"
            aria-label="Options de recherche"
          >
            <Tooltip
              content="Respecter la casse"
              as="button"
              onClick={() => setCaseSensitive(v => !v)}
              aria-pressed={caseSensitive}
              aria-label="Respecter la casse"
              className={`rounded p-1 text-xs transition ${caseSensitive ? 'bg-[var(--accent-primary)]/30' : 'hover:bg-[var(--bg-active)]'}`}
              style={{ color: caseSensitive ? 'var(--accent-primary)' : 'var(--text-muted)' }}
            >
              <CaseSensitive size={12} aria-hidden="true" />
            </Tooltip>
            <Tooltip
              content="Expression régulière"
              as="button"
              onClick={() => setUseRegex(v => !v)}
              aria-pressed={useRegex}
              aria-label="Utiliser une expression régulière"
              className={`rounded p-1 text-xs transition ${useRegex ? 'bg-[var(--accent-primary)]/30' : 'hover:bg-[var(--bg-active)]'}`}
              style={{ color: useRegex ? 'var(--accent-primary)' : 'var(--text-muted)' }}
            >
              <Regex size={12} aria-hidden="true" />
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Results summary — announced to screen readers */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="px-3 pb-1 text-xs"
        style={{ color: 'var(--text-muted)' }}
      >
        {query && !loading && (
          error
            ? <span className="text-red-400">{error}</span>
            : `${totalMatches} résultat${totalMatches !== 1 ? 's' : ''} dans ${groups.length} fichier${groups.length !== 1 ? 's' : ''}`
        )}
      </div>

      {/* Results list */}
      <div
        ref={listRef}
        id={listboxId}
        role="listbox"
        aria-label="Résultats de recherche"
        aria-multiselectable="false"
        className="flex-1 overflow-y-auto"
      >
        {flatItems.length === 0 ? null : flatItems.map((item, idx) => {
          const isActive = idx === activeIdx;

          if (item.kind === 'file') {
            const group = groups.find(g => g.file === item.file)!;
            return (
              <div
                key={item.id}
                id={item.id}
                role="option"
                aria-selected={isActive}
                aria-expanded={group.expanded}
                className={`flex w-full items-center gap-1.5 px-2 py-1 text-left text-xs cursor-pointer select-none ${
                  isActive ? 'bg-[var(--bg-active)]' : 'hover:bg-[var(--bg-active)]'
                }`}
                onClick={() => toggleGroup(item.file)}
                onMouseEnter={() => setActiveIdx(idx)}
              >
                {group.expanded
                  ? <ChevronDown size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} aria-hidden="true" />
                  : <ChevronRight size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} aria-hidden="true" />
                }
                <FileIcon filePath={item.file} size={13} />
                <span className="flex-1 truncate font-medium" style={{ color: 'var(--text-primary)' }}>
                  {item.file.split('/').pop()}
                </span>
                <span
                  className="rounded-full px-1.5 py-0.5 text-sm"
                  style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: 'var(--text-muted)' }}
                  aria-label={`${group.matches.length} correspondance${group.matches.length !== 1 ? 's' : ''}`}
                >
                  {group.matches.length}
                </span>
              </div>
            );
          }

          // kind === 'match'
          const match = item.match!;
          return (
            <div
              key={item.id}
              id={item.id}
              role="option"
              aria-selected={isActive}
              aria-label={`Ligne ${match.line} : ${match.preview.trim()}`}
              className={`flex w-full items-start gap-2 px-3 py-1 text-left cursor-pointer select-none ${
                isActive ? 'bg-[var(--bg-active)]' : 'hover:bg-[var(--bg-active)]'
              }`}
              style={{ paddingLeft: '28px' }}
              onClick={() => { onOpenFile(match.file, match.line, match.column); onClose(); }}
              onMouseEnter={() => setActiveIdx(idx)}
            >
              <span
                className="mt-0.5 shrink-0 w-7 text-right text-xs"
                style={{ color: 'var(--text-muted)' }}
                aria-hidden="true"
              >
                {match.line}
              </span>
              <span className="truncate font-mono text-xs" style={{ color: 'var(--text-primary)' }}>
                <HighlightedLine
                  text={match.preview.trimStart()}
                  query={query}
                  caseSensitive={caseSensitive}
                />
              </span>
            </div>
          );
        })}

        {/* Empty states */}
        {!loading && query && groups.length === 0 && !error && (
          <div
            role="status"
            className="flex flex-col items-center justify-center py-8 text-sm"
            style={{ color: 'var(--text-muted)' }}
          >
            <Search size={24} className="mb-2 opacity-30" aria-hidden="true" />
            Aucun résultat pour «{query}»
          </div>
        )}

        {!query && (
          <div className="flex flex-col items-center justify-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>
            <Search size={24} className="mb-2 opacity-20" aria-hidden="true" />
            Entrez un terme pour chercher
          </div>
        )}
      </div>
    </div>
  );
}
