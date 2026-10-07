/**
 * BrowserExtensionsMenu — gestion des extensions Chromium du navigateur.
 *
 * Affiche les extensions chargées pour le profil (partition) actif, permet
 * d'en charger de nouvelles (dossier décompressé) et d'en retirer. Masqué
 * hors Electron (où les extensions ne sont pas supportées).
 */

import { Loader2, Plus, Puzzle, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { BrowserExtensionInfo } from '../../types/electron.js';

interface BrowserExtensionsMenuProps {
  supported: boolean;
  extensions: BrowserExtensionInfo[];
  loading: boolean;
  error: string | null;
  onLoadExtension: () => void;
  onRemoveExtension: (id: string) => void;
}

export function BrowserExtensionsMenu({
  supported,
  extensions,
  loading,
  error,
  onLoadExtension,
  onRemoveExtension,
}: BrowserExtensionsMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  // Hors Electron, les extensions ne sont pas disponibles : on masque le bouton.
  if (!supported) return null;

  const count = extensions.length;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="relative flex items-center p-1.5 rounded transition hover:bg-[var(--bg-active)]"
        title="Extensions"
        aria-label="Gérer les extensions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Puzzle size={13} style={{ color: count > 0 ? 'var(--accent-primary)' : 'var(--text-muted)' }} />
        {count > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 flex items-center justify-center text-[9px] font-bold rounded-full"
            style={{
              minWidth: '14px',
              height: '14px',
              padding: '0 3px',
              backgroundColor: 'var(--accent-primary)',
              color: 'var(--bg-panel, #fff)',
            }}
          >
            {count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-50 rounded-lg overflow-hidden shadow-lg"
          style={{
            backgroundColor: 'var(--bg-panel, var(--bg-secondary))',
            border: '1px solid var(--border-base)',
            minWidth: '280px',
            maxHeight: '380px',
            overflowY: 'auto',
          }}
        >
          <div className="flex items-center justify-between px-2.5 py-1.5" style={{ borderBottom: '1px solid var(--border-base)' }}>
            <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Extensions</span>
            {loading && <Loader2 size={12} className="animate-spin" style={{ color: 'var(--text-muted)' }} />}
          </div>

          {error && (
            <div className="px-2.5 py-1.5 text-xs" style={{ color: 'var(--color-error)' }}>
              {error}
            </div>
          )}

          {count === 0 && !loading && !error && (
            <div className="px-2.5 py-3 text-xs text-center" style={{ color: 'var(--text-muted)' }}>
              Aucune extension chargée.
            </div>
          )}

          {extensions.map(ext => (
            <div
              key={ext.id}
              role="menuitem"
              className="flex items-center gap-2 px-2.5 py-1.5 transition hover:bg-[var(--bg-active)]"
            >
              <Puzzle size={12} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }} title={ext.name}>
                  {ext.name}
                </span>
                <span className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }} title={ext.path}>
                  v{ext.version}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onRemoveExtension(ext.id)}
                className="p-0.5 rounded hover:bg-[var(--bg-base)]"
                title="Retirer l'extension"
                aria-label={`Retirer ${ext.name}`}
              >
                <Trash2 size={11} style={{ color: 'var(--color-warning)' }} />
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={onLoadExtension}
            disabled={loading}
            className="flex items-center gap-2 w-full px-2.5 py-1.5 transition hover:bg-[var(--bg-active)] disabled:opacity-50"
            style={{ borderTop: '1px solid var(--border-base)' }}
            title="Charger une extension décompressée (dossier)"
          >
            <Plus size={12} style={{ color: 'var(--accent-primary)' }} />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Charger une extension décompressée…</span>
          </button>
        </div>
      )}
    </div>
  );
}
