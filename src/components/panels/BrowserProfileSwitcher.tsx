/**
 * BrowserProfileSwitcher — sélecteur de profil de navigation.
 *
 * Chaque profil possède sa propre session Electron (cookies / cache /
 * stockage isolés) via une partition dédiée. Ce composant permet de
 * basculer entre profils, d'en créer, d'en renommer et d'en supprimer.
 */

import { Check, Pencil, Plus, Trash2, User } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { BrowserProfile } from './useBrowserProfiles.js';

interface BrowserProfileSwitcherProps {
  profiles: BrowserProfile[];
  activeProfile: BrowserProfile;
  onSwitchProfile: (id: string) => void;
  onCreateProfile: (name: string) => BrowserProfile;
  onRenameProfile: (id: string, name: string) => void;
  onDeleteProfile: (id: string) => void;
}

export function BrowserProfileSwitcher({
  profiles,
  activeProfile,
  onSwitchProfile,
  onCreateProfile,
  onRenameProfile,
  onDeleteProfile,
}: BrowserProfileSwitcherProps) {
  const [open, setOpen] = useState(false);
  /** Id du profil en cours de renommage (null = aucun). */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  /** true quand on saisit le nom d'un nouveau profil. */
  const [creating, setCreating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Fermer le menu au clic extérieur.
  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setEditingId(null);
        setCreating(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  // Focus programmatique sur le champ d'édition quand il apparaît
  // (remplace l'attribut autoFocus, déconseillé pour l'accessibilité).
  useEffect(() => {
    if (editingId || creating) {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }
  }, [editingId, creating]);

  const startRename = (profile: BrowserProfile) => {
    setEditingId(profile.id);
    setDraftName(profile.name);
    setCreating(false);
  };

  const commitRename = () => {
    if (editingId) onRenameProfile(editingId, draftName);
    setEditingId(null);
    setDraftName('');
  };

  const commitCreate = () => {
    const name = draftName.trim();
    if (name) {
      const profile = onCreateProfile(name);
      onSwitchProfile(profile.id);
    }
    setCreating(false);
    setDraftName('');
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded transition hover:bg-[var(--bg-active)]"
        title={`Profil : ${activeProfile.name}`}
        aria-label={`Profil de navigation : ${activeProfile.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <User size={12} style={{ color: 'var(--accent-primary)' }} />
        <span className="text-xs max-w-[90px] truncate" style={{ color: 'var(--text-muted)' }}>
          {activeProfile.name}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-50 rounded-lg overflow-hidden shadow-lg"
          style={{
            backgroundColor: 'var(--bg-panel, var(--bg-secondary))',
            border: '1px solid var(--border-base)',
            minWidth: '220px',
            maxHeight: '360px',
            overflowY: 'auto',
          }}
        >
          <div className="px-2.5 py-1.5 text-xs font-semibold" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-base)' }}>
            Profils de navigation
          </div>

          {profiles.map(profile => {
            const isActive = profile.id === activeProfile.id;
            const isEditing = editingId === profile.id;
            return (
              <div
                key={profile.id}
                role="menuitem"
                className="flex items-center gap-2 px-2.5 py-1.5 transition hover:bg-[var(--bg-active)]"
                style={{ backgroundColor: isActive && !isEditing ? 'var(--bg-active)' : 'transparent' }}
              >
                {isEditing ? (
                  <>
                    <input
                      ref={editInputRef}
                      type="text"
                      value={draftName}
                      onChange={e => setDraftName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitRename();
                        else if (e.key === 'Escape') { setEditingId(null); setDraftName(''); }
                      }}
                      className="flex-1 bg-transparent outline-none text-xs min-w-0 rounded px-1 py-0.5"
                      style={{ color: 'var(--text-primary)', border: '1px solid var(--border-base)' }}
                      aria-label="Nom du profil"
                    />
                    <button type="button" onClick={commitRename} className="p-0.5 rounded hover:bg-[var(--bg-base)]" title="Valider" aria-label="Valider le nom">
                      <Check size={12} style={{ color: 'var(--color-success)' }} />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => { onSwitchProfile(profile.id); setOpen(false); }}
                      className="flex items-center gap-2 flex-1 min-w-0 text-left"
                      title={`Basculer vers ${profile.name}`}
                    >
                      <User size={12} style={{ color: isActive ? 'var(--accent-primary)' : 'var(--text-muted)', flexShrink: 0 }} />
                      <span className="text-xs truncate" style={{ color: 'var(--text-primary)' }}>{profile.name}</span>
                      {isActive && <Check size={11} style={{ color: 'var(--color-success)', flexShrink: 0 }} />}
                    </button>
                    <button type="button" onClick={() => startRename(profile)} className="p-0.5 rounded hover:bg-[var(--bg-base)]" title="Renommer" aria-label={`Renommer ${profile.name}`}>
                      <Pencil size={11} style={{ color: 'var(--text-muted)' }} />
                    </button>
                    {profile.id !== 'default' && (
                      <button type="button" onClick={() => onDeleteProfile(profile.id)} className="p-0.5 rounded hover:bg-[var(--bg-base)]" title="Supprimer" aria-label={`Supprimer ${profile.name}`}>
                        <Trash2 size={11} style={{ color: 'var(--color-warning)' }} />
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}

          <div style={{ borderTop: '1px solid var(--border-base)' }}>
            {creating ? (
              <div className="flex items-center gap-2 px-2.5 py-1.5">
                <input
                  ref={editInputRef}
                  type="text"
                  value={draftName}
                  onChange={e => setDraftName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitCreate();
                    else if (e.key === 'Escape') { setCreating(false); setDraftName(''); }
                  }}
                  placeholder="Nom du profil…"
                  className="flex-1 bg-transparent outline-none text-xs min-w-0 rounded px-1 py-0.5"
                  style={{ color: 'var(--text-primary)', border: '1px solid var(--border-base)' }}
                  aria-label="Nom du nouveau profil"
                />
                <button type="button" onClick={commitCreate} className="p-0.5 rounded hover:bg-[var(--bg-base)]" title="Créer" aria-label="Créer le profil">
                  <Check size={12} style={{ color: 'var(--color-success)' }} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { setCreating(true); setDraftName(''); setEditingId(null); }}
                className="flex items-center gap-2 w-full px-2.5 py-1.5 transition hover:bg-[var(--bg-active)]"
                title="Créer un nouveau profil isolé"
              >
                <Plus size={12} style={{ color: 'var(--accent-primary)' }} />
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Nouveau profil</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
