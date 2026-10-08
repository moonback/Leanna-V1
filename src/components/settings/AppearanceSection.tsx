import { useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Palette, Check, Moon, Sun, Zap, BookOpen, Eye, Pipette } from 'lucide-react';
import { useProfile } from '../../context/UserProfileContext.js';
import { Section, Field, ToggleSwitch } from './SettingsPrimitives.js';
import { ACCENTS, FONTS } from './constants.js';

// Palette d'accents : les 5 de base (tokens) + variantes distinctes en hex.
// (Les anciennes entrées « Indigo/Teal/Orange » réutilisaient des tokens déjà
//  présents — elles produisaient des pastilles visuellement identiques.)
const EXTENDED_ACCENTS = [
  ...ACCENTS,
  { label: 'Indigo',  value: '#6366f1' },
  { label: 'Teal',    value: '#14b8a6' },
  { label: 'Orange',  value: '#f97316' },
  { label: 'Fuchsia', value: '#d946ef' },
  { label: 'Lime',    value: '#84cc16' },
];

export function AppearanceSection() {
  const { profile, setField } = useProfile();

  const applyAccent = useCallback((color: string) => {
    setField('accentColor', color);
    document.documentElement.style.setProperty('--accent-primary', color);
  }, [setField]);

  const applyFont = useCallback((font: string) => {
    setField('fontFamily', font);
    document.documentElement.style.setProperty('--font-sans', font);
  }, [setField]);

  // La couleur courante est « personnalisée » si elle ne figure pas dans la palette.
  const isCustomAccent = useMemo(
    () => !EXTENDED_ACCENTS.some(a => a.value === profile.accentColor),
    [profile.accentColor],
  );
  // Valeur hex pour <input type="color"> (ne gère pas les var(...) : fallback).
  const customHex = /^#[0-9a-fA-F]{6}$/.test(profile.accentColor) ? profile.accentColor : '#0ea5e9';

  return (
    <Section
      icon={Palette}
      title="Apparence"
      description="Personnalisez le thème, la couleur d'accent et les éléments d'interface"
    >
      {/* Theme */}
      <Field label="Thème d'interface">
        <div role="radiogroup" aria-label="Thème" className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {([
            { id: 'dark',          label: 'Sombre',        icon: Moon,     desc: 'Idéal pour la nuit' },
            { id: 'light',         label: 'Clair',         icon: Sun,      desc: 'Lumineux et épuré' },
            { id: 'cyberpunk',     label: 'Cyberpunk',     icon: Zap,      desc: 'Néon futuriste' },
            { id: 'sepia',         label: 'Lecture Sepia', icon: BookOpen, desc: 'Chaud & confortable' },
            { id: 'high-contrast', label: 'Haut Contraste',icon: Eye,      desc: 'Accessibilité optimale' },
          ] as const).map(t => {
            const isActive = profile.theme === t.id;
            return (
              <motion.button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={isActive}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  setField('theme', t.id);
                  document.documentElement.setAttribute('data-theme', t.id);
                }}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all duration-200"
                style={{
                  backgroundColor: isActive ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
                  border: `1.5px solid ${isActive ? 'var(--accent-primary)' : 'var(--border-base)'}`,
                  boxShadow: isActive ? '0 2px 8px color-mix(in srgb, var(--accent-primary) 15%, transparent)' : 'none',
                }}
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-lg flex-shrink-0"
                  style={{ backgroundColor: isActive ? 'var(--accent-primary)' : 'var(--bg-panel)' }}>
                  <t.icon className="h-3.5 w-3.5" style={{ color: isActive ? 'white' : 'var(--text-muted)' }} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate"
                    style={{ color: isActive ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
                    {t.label}
                  </p>
                  <p className="text-xs truncate" style={{ color: 'var(--text-dimmed)' }}>{t.desc}</p>
                </div>
              </motion.button>
            );
          })}
        </div>
      </Field>

      {/* Accent color */}
      <Field label="Couleur d'accent" hint="Appliquée immédiatement à toute l'interface.">
        <div className="flex flex-wrap gap-2.5 items-start">
          {EXTENDED_ACCENTS.map(a => {
            const isActive = profile.accentColor === a.value;
            return (
              <div key={`${a.label}-${a.value}`} className="relative flex flex-col items-center gap-1">
                <motion.button
                  type="button"
                  onClick={() => applyAccent(a.value)}
                  whileHover={{ scale: 1.15, y: -2 }}
                  whileTap={{ scale: 0.9 }}
                  className="relative w-8 h-8 rounded-full flex-shrink-0 transition-all duration-200"
                  style={{
                    backgroundColor: a.value,
                    outline: isActive ? `3px solid ${a.value}` : 'none',
                    outlineOffset: 2.5,
                    boxShadow: isActive ? `0 4px 12px ${a.value}66` : `0 2px 6px ${a.value}33`,
                  }}
                  aria-label={`Accent ${a.label}`}
                  title={a.label}
                >
                  <AnimatePresence>
                    {isActive && (
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        className="absolute inset-0 flex items-center justify-center"
                      >
                        <Check className="w-3.5 h-3.5 text-white drop-shadow-sm" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.button>
                <span className="text-xs" style={{ color: 'var(--text-dimmed)' }}>{a.label}</span>
              </div>
            );
          })}

          {/* Sélecteur personnalisé */}
          <div className="relative flex flex-col items-center gap-1">
            <label
              htmlFor="accent-custom-color"
              className="relative flex h-8 w-8 flex-shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full transition-all duration-200"
              style={{
                background: 'conic-gradient(from 180deg, #ef4444, #f59e0b, #84cc16, #14b8a6, #0ea5e9, #6366f1, #d946ef, #ef4444)',
                outline: isCustomAccent ? `3px solid ${profile.accentColor}` : 'none',
                outlineOffset: 2.5,
                boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
              }}
              title="Couleur personnalisée"
            >
              <Pipette className="h-3.5 w-3.5 text-white drop-shadow" />
              <input
                id="accent-custom-color"
                type="color"
                value={customHex}
                onChange={e => applyAccent(e.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
                aria-label="Choisir une couleur d'accent personnalisée"
              />
            </label>
            <span className="text-xs" style={{ color: 'var(--text-dimmed)' }}>Perso</span>
          </div>
        </div>

        {isCustomAccent && (
          <span className="mt-1.5 inline-block font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
            {profile.accentColor}
          </span>
        )}
      </Field>

      {/* Font family */}
      <Field label="Police de l'interface" hint="Appliquée immédiatement à toute l'interface.">
        <div role="radiogroup" aria-label="Police" className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {FONTS.map(f => {
            const isActive = profile.fontFamily === f.value;
            return (
              <motion.button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={isActive}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => applyFont(f.value)}
                className="flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition-all duration-200"
                style={{
                  backgroundColor: isActive ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
                  border: `1.5px solid ${isActive ? 'var(--accent-primary)' : 'var(--border-base)'}`,
                  boxShadow: isActive ? '0 2px 8px color-mix(in srgb, var(--accent-primary) 15%, transparent)' : 'none',
                }}
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate"
                    style={{ fontFamily: f.value, color: isActive ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
                    {f.label}
                  </p>
                  <p className="text-xs truncate" style={{ color: 'var(--text-dimmed)' }}>{f.desc}</p>
                </div>
                {isActive && <Check className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--accent-primary)' }} />}
              </motion.button>
            );
          })}
        </div>
        {/* Aperçu de la police sélectionnée */}
        <div
          className="mt-2 rounded-xl border px-3 py-2.5"
          style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-secondary)' }}
        >
          <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>Aperçu</p>
          <p className="mt-0.5 text-sm" style={{ fontFamily: profile.fontFamily, color: 'var(--text-primary)' }}>
            The quick brown fox — 0123456789
          </p>
        </div>
      </Field>

      {/* Floating Orb toggle */}
      <div className="pt-1" style={{ borderTop: '1px solid var(--border-base)' }}>
        <ToggleSwitch
          value={profile.floatingOrb}
          onChange={v => setField('floatingOrb', v)}
          label="Orb flottant"
          hint="Bouton déplaçable pour contrôler Leanna depuis n'importe quelle page"
        />
      </div>
    </Section>
  );
}
