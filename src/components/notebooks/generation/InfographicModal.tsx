/**
 * InfographicModal — modal de configuration d'infographie (orientation, langue,
 * style visuel, niveau de détail, description). Composant présentationnel ;
 * l'état de configuration infra* est détenu par le parent.
 */

import { motion, AnimatePresence } from 'motion/react';
import { Lightbulb, X, Smartphone, Monitor, Square } from 'lucide-react';
import type { SpringTransition, ScrimStyle } from '../motionTypes.js';

interface Props {
  show: boolean;
  sources: { id: string }[];
  selectedSourceIds: string[];
  infraOrientation: 'portrait' | 'landscape' | 'square';
  setInfraOrientation: (v: 'portrait' | 'landscape' | 'square') => void;
  infraStyle: string;
  setInfraStyle: (v: string) => void;
  infraDetail: 'low' | 'medium' | 'high';
  setInfraDetail: (v: 'low' | 'medium' | 'high') => void;
  infraLang: string;
  setInfraLang: (v: string) => void;
  infraDescription: string;
  setInfraDescription: (v: string) => void;
  onClose: () => void;
  onGenerate: () => void;
  scrimSpring: SpringTransition;
  scrimStyle: ScrimStyle;
  modalSpring: SpringTransition;
  reduceMotion: boolean | null;
}

export function InfographicModal({
  show, sources, selectedSourceIds,
  infraOrientation, setInfraOrientation,
  infraStyle, setInfraStyle,
  infraDetail, setInfraDetail,
  infraLang, setInfraLang,
  infraDescription, setInfraDescription,
  onClose, onGenerate,
  scrimSpring, scrimStyle, modalSpring, reduceMotion,
}: Props) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={scrimSpring}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={scrimStyle}
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={reduceMotion ? { opacity: 0 } : { scale: 0.95, opacity: 0, y: 10 }}
            animate={reduceMotion ? { opacity: 1 } : { scale: 1, opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { scale: 0.95, opacity: 0, y: 10 }}
            transition={modalSpring}
            className="w-full max-w-xl rounded-2xl border shadow-2xl overflow-hidden"
            style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border-base)' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: 'color-mix(in srgb, var(--color-warning) 15%, transparent)' }}>
                  <Lightbulb className="w-4.5 h-4.5" style={{ color: 'var(--color-warning)' }} />
                </div>
                <div>
                  <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Créer une infographie</h3>
                  <p className="text-xs" style={{ color: 'var(--text-dimmed)' }}>Générée par IA à partir de vos sources</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
                style={{ color: 'var(--text-muted)' }}
                // autoFocus justifié : point d'entrée du focus-trap à l'ouverture
                // de la modale (bouton de fermeture), focus attendu.
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-5 max-h-[65vh] overflow-y-auto custom-scrollbar">
              {/* Orientation */}
              <div className="notebooklm-prose max-w-none space-y-5">
                <p className="text-xs font-semibold" style={{ color: 'var(--text-dimmed)' }}>Choisissez une orientation</p>
                <div className="flex gap-2">
                  {([
                    { key: 'portrait' as const, label: 'Portrait', icon: Smartphone },
                    { key: 'landscape' as const, label: 'Paysage', icon: Monitor },
                    { key: 'square' as const, label: 'Carré', icon: Square },
                  ]).map(opt => {
                    const OIcon = opt.icon;
                    return (
                    <button
                      key={opt.key}
                      onClick={() => setInfraOrientation(opt.key)}
                      className="flex-1 flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl text-xs font-medium transition-all"
                      style={{
                        backgroundColor: infraOrientation === opt.key ? 'color-mix(in srgb, var(--color-warning) 12%, transparent)' : 'var(--bg-base)',
                        color: infraOrientation === opt.key ? 'var(--color-warning)' : 'var(--text-muted)',
                        border: `1.5px solid ${infraOrientation === opt.key ? 'var(--color-warning)' : 'var(--border-base)'}`,
                      }}
                    >
                      <span className="inline-flex items-center"><OIcon size={18} /></span>
                      {opt.label}
                    </button>
                    );
                  })}
                </div>
              </div>

              {/* Langue */}
              <div className="notebooklm-prose max-w-none space-y-5">
                <p className="text-xs font-semibold" style={{ color: 'var(--text-dimmed)' }}>Langue</p>
                <div className="flex gap-1.5 flex-wrap">
                  {([
                    { key: 'fr', label: 'Français', flag: '🇫🇷' },
                    { key: 'en', label: 'English', flag: '🇬🇧' },
                    { key: 'es', label: 'Español', flag: '🇪🇸' },
                    { key: 'de', label: 'Deutsch', flag: '🇩🇪' },
                    { key: 'ar', label: 'العربية', flag: '🇸🇦' },
                    { key: 'pt', label: 'Português', flag: '🇧🇷' },
                    { key: 'it', label: 'Italiano', flag: '🇮🇹' },
                    { key: 'zh', label: '中文', flag: '🇨🇳' },
                    { key: 'ja', label: '日本語', flag: '🇯🇵' },
                  ]).map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => setInfraLang(opt.key)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all"
                      style={{
                        backgroundColor: infraLang === opt.key ? 'color-mix(in srgb, var(--color-warning) 12%, transparent)' : 'var(--bg-base)',
                        color: infraLang === opt.key ? 'var(--color-warning)' : 'var(--text-muted)',
                        border: `1px solid ${infraLang === opt.key ? 'var(--color-warning)' : 'var(--border-base)'}`,
                      }}
                    >
                      <span>{opt.flag}</span>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Style visuel */}
              <div className="notebooklm-prose max-w-none space-y-5">
                <p className="text-xs font-semibold" style={{ color: 'var(--text-dimmed)' }}>Choisissez un style visuel</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    { key: 'auto', label: 'Sélection auto', emoji: '✨' },
                    { key: 'kawaii', label: 'Kawaii', emoji: '🌸' },
                    { key: 'clay', label: 'Pâte à modeler', emoji: '🎨' },
                    { key: 'sketch', label: 'Croquis', emoji: '✏️' },
                    { key: 'anime', label: 'Anime', emoji: '🎌' },
                    { key: 'editorial', label: 'Éditorial', emoji: '📰' },
                    { key: 'educational', label: 'Éducatif', emoji: '📚' },
                    { key: 'bento', label: 'Grille Bento', emoji: '🍱' },
                    { key: 'bricks', label: 'Briques', emoji: '🧱' },
                    { key: 'scientific', label: 'Scientifique', emoji: '🔬' },
                    { key: 'professional', label: 'Professionnel', emoji: '💼' },
                  ]).map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => setInfraStyle(opt.key)}
                      className="flex items-center gap-2 px-2.5 py-2 rounded-full text-xs font-medium transition-all"
                      style={{
                        backgroundColor: infraStyle === opt.key ? 'color-mix(in srgb, var(--color-warning) 12%, transparent)' : 'var(--bg-base)',
                        color: infraStyle === opt.key ? 'var(--color-warning)' : 'var(--text-muted)',
                        border: `1px solid ${infraStyle === opt.key ? 'var(--color-warning)' : 'var(--border-base)'}`,
                      }}
                    >
                      <span>{opt.emoji}</span>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Niveau de détail */}
              <div className="notebooklm-prose max-w-none space-y-5">
                <p className="text-xs font-semibold" style={{ color: 'var(--text-dimmed)' }}>Niveau de détail</p>
                <div className="flex gap-2">
                  {([
                    { key: 'low' as const, label: 'Minimal', desc: '3-4 éléments' },
                    { key: 'medium' as const, label: 'Modéré', desc: '5-7 sections' },
                    { key: 'high' as const, label: 'Dense', desc: 'Très détaillé' },
                  ]).map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => setInfraDetail(opt.key)}
                      className="flex-1 flex flex-col items-center gap-0.5 px-3 py-2.5 rounded-full text-xs font-medium transition-all"
                      style={{
                        backgroundColor: infraDetail === opt.key ? 'color-mix(in srgb, var(--color-warning) 12%, transparent)' : 'var(--bg-base)',
                        color: infraDetail === opt.key ? 'var(--color-warning)' : 'var(--text-muted)',
                        border: `1.5px solid ${infraDetail === opt.key ? 'var(--color-warning)' : 'var(--border-base)'}`,
                      }}
                    >
                      <span className="font-semibold">{opt.label}</span>
                      <span className="text-xs opacity-60">{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Sources */}
              {sources.length > 1 && (
                <div className="notebooklm-prose max-w-none space-y-5">
                  <p className="text-xs font-semibold" style={{ color: 'var(--text-dimmed)' }}>
                    Sources ({selectedSourceIds.length || sources.length}/{sources.length})
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-dimmed)' }}>
                    {selectedSourceIds.length === 0 ? 'Toutes les sources seront utilisées' : `${selectedSourceIds.length} source(s) sélectionnée(s)`}
                  </p>
                </div>
              )}

              {/* Description personnalisée */}
              <div className="notebooklm-prose max-w-none space-y-5">
                <p className="text-xs font-semibold" style={{ color: 'var(--text-dimmed)' }}>
                  Décrivez l'infographie que vous souhaitez créer
                </p>
                <textarea
                  value={infraDescription}
                  onChange={(e) => setInfraDescription(e.target.value)}
                  placeholder="Ex: Une infographie sur les tendances du marché avec des statistiques clés, un comparatif visuel des acteurs principaux..."
                  className="w-full px-3 py-2.5 rounded-full text-xs resize-none leading-relaxed"
                  style={{
                    backgroundColor: 'var(--bg-base)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-base)',
                  }}
                  rows={3}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t flex items-center justify-between" style={{ borderColor: 'var(--border-base)' }}>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-full text-xs font-medium transition-all hover:bg-[var(--bg-hover)]"
                style={{ color: 'var(--text-muted)' }}
              >
                Annuler
              </button>
              <button
                onClick={onGenerate}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold transition-all active:scale-95 shadow-sm"
                style={{ backgroundColor: 'var(--color-warning)', color: 'white' }}
              >
                <Lightbulb className="w-3.5 h-3.5" />
                Générer l'infographie
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
