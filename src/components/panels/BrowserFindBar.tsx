/**
 * BrowserFindBar — barre « rechercher dans la page » du navigateur intégré.
 *
 * S'appuie sur `webview.findInPage` / `stopFindInPage` (câblés dans
 * BrowserPanel). Affiche le compteur de correspondances et permet de naviguer
 * entre les occurrences (Entrée / Maj+Entrée, boutons précédent/suivant).
 */

import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface BrowserFindBarProps {
  query: string;
  matches: { active: number; total: number } | null;
  onChange: (text: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

export function BrowserFindBar({ query, matches, onChange, onNext, onPrev, onClose }: BrowserFindBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus automatique à l'ouverture.
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const label = query
    ? matches && matches.total > 0
      ? `${matches.active}/${matches.total}`
      : '0/0'
    : '';

  const noMatch = !!query && (!matches || matches.total === 0);

  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-2 flex-shrink-0"
      style={{ borderBottom: '1px solid var(--border-base)', backgroundColor: 'var(--bg-panel)' }}
      role="search"
    >
      <div
        className="flex flex-1 min-w-0 items-center gap-1.5 rounded-full px-3 py-1.5"
        style={{ backgroundColor: 'var(--bg-input, var(--bg-secondary))', border: '1px solid var(--border-base)' }}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); if (e.shiftKey) onPrev(); else onNext(); }
            else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
          }}
          placeholder="Rechercher dans la page…"
          aria-label="Rechercher dans la page"
          spellCheck={false}
          className="flex-1 min-w-0 bg-transparent outline-none text-sm"
          style={{ color: 'var(--text-primary)' }}
        />
        <span
          className="text-xs tabular-nums flex-shrink-0"
          style={{ color: noMatch ? 'var(--color-error)' : 'var(--text-muted)', minWidth: 36, textAlign: 'right' }}
        >
          {label}
        </span>
      </div>
      <button type="button" onClick={onPrev} disabled={!query} className="flex items-center justify-center w-7 h-7 rounded-lg transition hover:bg-[var(--bg-active)] disabled:opacity-30" title="Précédent (Maj+Entrée)" aria-label="Occurrence précédente">
        <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} />
      </button>
      <button type="button" onClick={onNext} disabled={!query} className="flex items-center justify-center w-7 h-7 rounded-lg transition hover:bg-[var(--bg-active)] disabled:opacity-30" title="Suivant (Entrée)" aria-label="Occurrence suivante">
        <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
      </button>
      <button type="button" onClick={onClose} className="flex items-center justify-center w-7 h-7 rounded-lg transition hover:bg-[var(--bg-active)]" title="Fermer la recherche" aria-label="Fermer la recherche">
        <X size={14} style={{ color: 'var(--text-muted)' }} />
      </button>
    </div>
  );
}
