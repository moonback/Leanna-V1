/**
 * UploadToolbar — chips d'actions d'ajout de source (Uploader / URL / Texte /
 * Coller / GitHub / Codebase) et les formulaires associés (URL, Texte,
 * Codebase). Composant présentationnel piloté par le hook useSourceUpload.
 */

import type { SpringTransition, TapScaleProps } from '../motionTypes.js';
import { motion, AnimatePresence } from 'motion/react';
import {
  Upload, Globe, Type, ClipboardPaste, Github, FolderCode, Loader2,
} from 'lucide-react';
import { ACCEPTED_EXTENSIONS } from './constants.js';
import type { useSourceUpload } from './useSourceUpload.js';

type UploadApi = ReturnType<typeof useSourceUpload>;

interface Props {
  upload: UploadApi;
  onOpenGitHub: () => void;
  spring: SpringTransition;
  tapScale: TapScaleProps;
}

export function UploadToolbar({ upload, onOpenGitHub, spring, tapScale }: Props) {
  const {
    uploading,
    fileInputRef, handleFileInputChange, openFilePicker,
    showUrlForm, setShowUrlForm, url, setUrl, handleUrlIngest,
    showTextForm, setShowTextForm, textTitle, setTextTitle, textContent, setTextContent, handleTextAdd,
    showCodebaseForm, setShowCodebaseForm,
    codebaseTitle, setCodebaseTitle, codebaseExtensions, setCodebaseExtensions,
    codebaseMaxSizeKb, setCodebaseMaxSizeKb, codebaseIncludeConfig, setCodebaseIncludeConfig,
    handleCodebaseImport, handleClipboardPaste,
  } = upload;

  return (
    <>
      {/* Actions row */}
      <div className="flex items-center gap-2 flex-wrap">
        <motion.button
          {...tapScale}
          onClick={openFilePicker}
          disabled={uploading}
          className="notebook-fab disabled:opacity-50"
          style={{ padding: '7px 12px', fontSize: '12px' }}
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          Uploader
        </motion.button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS}
          onChange={handleFileInputChange}
          className="hidden"
        />

        <motion.button
          {...tapScale}
          onClick={() => { setShowUrlForm(!showUrlForm); setShowTextForm(false); setShowCodebaseForm(false); }}
          className={`notebook-chip ${showUrlForm ? 'notebook-chip--active' : ''}`}
          style={showUrlForm ? { borderColor: 'var(--notebook-accent)', color: 'var(--notebook-accent)', background: 'var(--notebook-accent-surface)' } : {}}
        >
          <Globe className="w-3.5 h-3.5" />
          URL
        </motion.button>

        <motion.button
          {...tapScale}
          onClick={() => { setShowTextForm(!showTextForm); setShowUrlForm(false); setShowCodebaseForm(false); }}
          className={`notebook-chip ${showTextForm ? 'notebook-chip--active' : ''}`}
          style={showTextForm ? { borderColor: 'var(--notebook-accent)', color: 'var(--notebook-accent)', background: 'var(--notebook-accent-surface)' } : {}}
        >
          <Type className="w-3.5 h-3.5" />
          Texte
        </motion.button>

        <motion.button
          {...tapScale}
          onClick={handleClipboardPaste}
          className="notebook-chip"
          title="Coller depuis le presse-papier"
        >
          <ClipboardPaste className="w-3.5 h-3.5" />
          Coller
        </motion.button>

        <motion.button
          {...tapScale}
          onClick={onOpenGitHub}
          className="notebook-chip"
          title="Importer un dépôt GitHub"
          style={{ borderColor: 'var(--border-base)', color: 'var(--text-primary)' }}
        >
          <Github className="w-3.5 h-3.5" />
          GitHub
        </motion.button>

        <motion.button
          {...tapScale}
          onClick={() => { setShowCodebaseForm(!showCodebaseForm); setShowUrlForm(false); setShowTextForm(false); }}
          className={`notebook-chip ${showCodebaseForm ? 'notebook-chip--active' : ''}`}
          style={showCodebaseForm ? { borderColor: 'var(--notebook-accent)', color: 'var(--notebook-accent)', background: 'var(--notebook-accent-surface)' } : {}}
          title="Importer le codebase du workspace"
        >
          <FolderCode className="w-3.5 h-3.5" />
          Codebase
        </motion.button>
      </div>

      {/* URL Form */}
      <AnimatePresence>
        {showUrlForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring}
            className="overflow-hidden"
          >
            <div className="p-5 rounded-2xl border space-y-3"
              style={{ backgroundColor: 'var(--notebook-card-bg)', borderColor: 'var(--notebook-border)' }}>
              <div className="flex items-center gap-2 mb-1">
                <Globe className="w-4 h-4" style={{ color: 'var(--notebook-accent)' }} />
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Importer une URL</p>
              </div>
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleUrlIngest()}
                placeholder="https://example.com/article..."
                // autoFocus justifié : le champ apparaît après sélection de
                // l'onglet URL ; focus immédiat attendu pour la saisie.
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-shadow focus:ring-2"
                style={{ backgroundColor: 'var(--notebook-surface-muted)', border: '1px solid var(--notebook-border)', color: 'var(--text-primary)' }}
              />
              <div className="flex gap-2">
                <motion.button
                  {...tapScale}
                  onClick={handleUrlIngest}
                  disabled={!url.trim() || uploading}
                  className="notebook-fab disabled:opacity-40"
                  style={{ padding: '8px 16px', fontSize: '13px' }}
                >
                  {uploading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Ingestion…</> : 'Importer'}
                </motion.button>
                <button
                  onClick={() => { setShowUrlForm(false); setUrl(''); }}
                  className="notebook-chip"
                >
                  Annuler
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Text Form */}
      <AnimatePresence>
        {showTextForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring}
            className="overflow-hidden"
          >
            <div className="p-5 rounded-2xl border space-y-3"
              style={{ backgroundColor: 'var(--notebook-card-bg)', borderColor: 'var(--notebook-border)' }}>
              <div className="flex items-center gap-2 mb-1">
                <Type className="w-4 h-4" style={{ color: 'var(--notebook-accent)' }} />
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Ajouter du texte</p>
              </div>
              <input
                type="text"
                value={textTitle}
                onChange={e => setTextTitle(e.target.value)}
                placeholder="Titre (optionnel)"
                className="w-full px-4 py-2.5 rounded-full text-sm outline-none transition-shadow focus:ring-2"
                style={{ backgroundColor: 'var(--notebook-surface-muted)', border: '1px solid var(--notebook-border)', color: 'var(--text-primary)' }}
              />
              <div className="relative">
                <textarea
                  value={textContent}
                  onChange={e => setTextContent(e.target.value)}
                  placeholder="Collez votre texte ici..."
                  rows={6}
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none transition-shadow focus:ring-2"
                  style={{ backgroundColor: 'var(--notebook-surface-muted)', border: '1px solid var(--notebook-border)', color: 'var(--text-primary)' }}
                />
                {textContent && (
                  <span className="absolute bottom-2 right-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                    ~{textContent.split(/\s+/).filter(Boolean).length} mots
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <motion.button
                  {...tapScale}
                  onClick={handleTextAdd}
                  disabled={!textContent.trim() || uploading}
                  className="notebook-fab disabled:opacity-40"
                  style={{ padding: '8px 16px', fontSize: '13px' }}
                >
                  {uploading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Ajout…</> : 'Ajouter'}
                </motion.button>
                <button
                  onClick={() => { setShowTextForm(false); setTextTitle(''); setTextContent(''); }}
                  className="notebook-chip"
                >
                  Annuler
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Codebase Import Form */}
      <AnimatePresence>
        {showCodebaseForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring}
            className="overflow-hidden"
          >
            <div className="p-5 rounded-2xl border space-y-4"
              style={{ backgroundColor: 'var(--notebook-card-bg)', borderColor: 'var(--notebook-border)' }}>
              <div className="flex items-center gap-2">
                <FolderCode className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--notebook-accent)' }} />
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Importer le codebase du workspace</p>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Scanne tous les fichiers texte du projet actif et les consolide en un seul document Markdown indexé dans ce notebook.
              </p>

              <input
                type="text"
                value={codebaseTitle}
                onChange={e => setCodebaseTitle(e.target.value)}
                placeholder="Titre de la source (optionnel)"
                className="w-full px-4 py-2.5 rounded-full text-sm outline-none transition-shadow focus:ring-2"
                style={{ backgroundColor: 'var(--notebook-surface-muted)', border: '1px solid var(--notebook-border)', color: 'var(--text-primary)' }}
              />

              <div>
                <label htmlFor="codebase-extensions" className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Extensions à inclure <span style={{ color: 'var(--text-dimmed)' }}>(vide = toutes les extensions texte)</span>
                </label>
                <input
                  id="codebase-extensions"
                  type="text"
                  value={codebaseExtensions}
                  onChange={e => setCodebaseExtensions(e.target.value)}
                  placeholder=".ts .tsx .js .py .md ..."
                  className="w-full px-4 py-2.5 rounded-full text-sm outline-none font-mono transition-shadow focus:ring-2"
                  style={{ backgroundColor: 'var(--notebook-surface-muted)', border: '1px solid var(--notebook-border)', color: 'var(--text-primary)' }}
                />
              </div>

              <div className="flex items-center gap-6 flex-wrap">
                <div>
                  <label htmlFor="codebase-max-size" className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    Taille max par fichier
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="codebase-max-size"
                      type="number"
                      min={10}
                      max={500}
                      value={codebaseMaxSizeKb}
                      onChange={e => setCodebaseMaxSizeKb(Number(e.target.value))}
                      className="w-20 px-3 py-2 rounded-full text-sm outline-none text-center transition-shadow focus:ring-2"
                      style={{ backgroundColor: 'var(--notebook-surface-muted)', border: '1px solid var(--notebook-border)', color: 'var(--text-primary)' }}
                    />
                    <span className="text-xs" style={{ color: 'var(--text-dimmed)' }}>Ko</span>
                  </div>
                </div>

                <label htmlFor="codebase-include-config" className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    id="codebase-include-config"
                    type="checkbox"
                    checked={codebaseIncludeConfig}
                    onChange={e => setCodebaseIncludeConfig(e.target.checked)}
                    className="w-3.5 h-3.5 rounded accent-[var(--notebook-accent)]"
                  />
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Inclure les fichiers de config
                    <span className="block text-xs" style={{ color: 'var(--text-dimmed)' }}>package.json, tsconfig.json…</span>
                  </span>
                </label>
              </div>

              <div className="flex gap-2">
                <motion.button
                  {...tapScale}
                  onClick={handleCodebaseImport}
                  disabled={uploading}
                  className="notebook-fab disabled:opacity-40"
                  style={{ padding: '8px 16px', fontSize: '13px' }}
                >
                  {uploading
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Scan en cours…</>
                    : <><FolderCode className="w-3.5 h-3.5" /> Importer le codebase</>
                  }
                </motion.button>
                <button
                  onClick={() => { setShowCodebaseForm(false); setCodebaseTitle(''); setCodebaseExtensions(''); }}
                  className="notebook-chip"
                >
                  Annuler
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
