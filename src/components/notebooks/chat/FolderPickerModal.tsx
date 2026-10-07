/**
 * FolderPickerModal — modale « Enregistrer en Markdown » : choix du dossier de
 * destination dans la sandbox (liste ou chemin personnalisé). Présentationnel.
 */

import { motion, AnimatePresence } from 'motion/react';
import { FileDown, X, FolderOpen, Folder, Check, Loader2 } from 'lucide-react';
import { SPRING_UI } from '../motion.js';
import type { ChatMessage, SandboxFolder } from './types.js';

interface Props {
  folderPickerMsg: ChatMessage | null;
  sandboxFolders: SandboxFolder[];
  selectedFolder: string;
  setSelectedFolder: (v: string) => void;
  customFolderName: string;
  setCustomFolderName: (v: string) => void;
  savingMd: boolean;
  prefersReducedMotion: boolean | null;
  onClose: () => void;
  onSave: () => void;
}

export function FolderPickerModal({
  folderPickerMsg, sandboxFolders, selectedFolder, setSelectedFolder,
  customFolderName, setCustomFolderName, savingMd, prefersReducedMotion, onClose, onSave,
}: Props) {
  return (
    <AnimatePresence>
      {folderPickerMsg && (
        <motion.div
          initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
          animate={{ opacity: 1, backdropFilter: 'blur(4px)' }}
          exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.92, y: prefersReducedMotion ? 0 : 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.92, y: prefersReducedMotion ? 0 : 16 }}
            transition={prefersReducedMotion ? { duration: 0.1 } : SPRING_UI}
            className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
            style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border-base)' }}>
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg" style={{ backgroundColor: 'var(--accent-subtle)' }}>
                  <FileDown className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Enregistrer en Markdown
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Choisir le dossier de destination dans la sandbox
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg opacity-50 hover:opacity-100 transition-opacity"
                style={{ color: 'var(--text-muted)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Folder list */}
            <div className="px-4 py-3 max-h-56 overflow-y-auto custom-scrollbar">
              {sandboxFolders.length === 0 ? (
                <p className="text-smtext-center py-4" style={{ color: 'var(--text-dimmed)' }}>
                  Chargement des dossiers…
                </p>
              ) : (
                <div className="space-y-0.5">
                  {sandboxFolders.map(f => (
                    <button
                      key={f.path}
                      onClick={() => { setSelectedFolder(f.path); setCustomFolderName(''); }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-full text-left transition-all text-sm${
                        selectedFolder === f.path && !customFolderName
                          ? 'ring-1 ring-[var(--accent-primary)]'
                          : 'hover:bg-[var(--accent-subtle)]'
                      }`}
                      style={{
                        backgroundColor: selectedFolder === f.path && !customFolderName
                          ? 'var(--accent-subtle)'
                          : 'transparent',
                        color: 'var(--text-primary)',
                        paddingLeft: `${12 + f.depth * 16}px`,
                      }}
                    >
                      {selectedFolder === f.path && !customFolderName
                        ? <FolderOpen className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--accent-primary)' }} />
                        : <Folder className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-dimmed)' }} />
                      }
                      <span className="truncate">{f.name || '/ (racine sandbox)'}</span>
                      {selectedFolder === f.path && !customFolderName && (
                        <Check className="w-3 h-3 ml-auto flex-shrink-0" style={{ color: 'var(--accent-primary)' }} />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Custom folder input */}
            <div className="px-4 pb-3">
              <p className="text-smmb-1.5 font-medium" style={{ color: 'var(--text-muted)' }}>
                Ou saisir un chemin personnalisé
              </p>
              <input
                type="text"
                value={customFolderName}
                onChange={e => { setCustomFolderName(e.target.value); setSelectedFolder(''); }}
                placeholder="ex: docs/notes"
                className="w-full px-3 py-2 rounded-full text-smoutline-none transition-all"
                style={{
                  backgroundColor: 'var(--bg-base)',
                  border: '1px solid var(--border-base)',
                  color: 'var(--text-primary)',
                }}
                onFocus={e => (e.target.style.borderColor = 'var(--accent-primary)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border-base)')}
              />
            </div>

            {/* Destination preview */}
            {(selectedFolder !== '' || customFolderName.trim()) && (
              <div className="mx-4 mb-3 px-3 py-2 rounded-full text-xs" style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}>
                <span className="font-medium">Destination : </span>
                <span className="font-mono">
                  {customFolderName.trim() || selectedFolder || '/'}/
                </span>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 px-4 pb-4">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-full text-smfont-medium transition-all hover:opacity-80"
                style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-base)' }}
              >
                Annuler
              </button>
              <button
                onClick={onSave}
                disabled={savingMd || (selectedFolder === '' && !customFolderName.trim())}
                className="flex items-center gap-2 px-4 py-2 rounded-full text-smfont-medium transition-all disabled:opacity-40 hover:opacity-90 active:scale-95"
                style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}
              >
                {savingMd ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileDown className="w-3.5 h-3.5" />
                )}
                {savingMd ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
