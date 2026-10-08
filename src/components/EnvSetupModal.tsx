import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { KeyRound, CheckCircle2, AlertCircle, Loader2, ArrowRight, ShieldCheck } from 'lucide-react';
import { Field, SecretInput, TextInput } from './settings/SettingsPrimitives.js';
import { KEY_GROUPS, ALL_SPECS, REQUIRED_KEYS } from './envSetupKeys.js';

/**
 * EnvSetupModal — assistant de première configuration.
 *
 * Affiché APRÈS le splash (LauncherModal), uniquement si des clés principales
 * du .env ne sont pas encore renseignées. Permet de saisir les clés essentielles
 * et les enregistre via l'API /api/env (les secrets sont chiffrés au repos par
 * le serveur). Réutilise le design system existant (primitives + tokens CSS).
 *
 * Gating :
 *  - attend la fin du splash (sessionStorage 'Leanna-launcher-done') ;
 *  - ne réapparaît pas si déjà complété/ignoré (localStorage 'Leanna-env-setup-done') ;
 *  - ne s'affiche que si au moins une clé REQUISE est vide (GET /api/env).
 */

const SETUP_DONE_KEY = 'Leanna-env-setup-done';
const LAUNCHER_DONE_KEY = 'Leanna-launcher-done';
const OVERLAY_FADE = { duration: 0.25, ease: 'easeOut' as const };

interface EnvVarMeta { key: string; hasValue: boolean; }
interface EnvSectionData { title: string; vars: EnvVarMeta[]; }
interface EnvApiResponse {
  status: string;
  sections?: EnvSectionData[];
  applied?: string[];
  rejected?: string[];
  error?: string;
}

export function EnvSetupModal() {
  const shouldReduceMotion = useReducedMotion();
  const [isOpen, setIsOpen] = useState(false);
  const [checking, setChecking] = useState(true);
  const [configured, setConfigured] = useState<Record<string, boolean>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // ── Détection : launcher terminé + clés requises manquantes ─────────────────
  useEffect(() => {
    let cancelled = false;

    const decideAndLoad = async () => {
      if (localStorage.getItem(SETUP_DONE_KEY) === '1') {
        if (!cancelled) setChecking(false);
        return;
      }
      try {
        const res = await fetch('/api/env');
        const data: EnvApiResponse = await res.json();
        if (data.status !== 'success' || !data.sections) {
          if (!cancelled) setChecking(false);
          return;
        }
        const map: Record<string, boolean> = {};
        for (const section of data.sections) {
          for (const v of section.vars) map[v.key] = v.hasValue;
        }
        if (cancelled) return;
        setConfigured(map);
        setIsOpen(REQUIRED_KEYS.some(k => !map[k]));
        setChecking(false);
      } catch {
        if (!cancelled) setChecking(false);
      }
    };

    if (sessionStorage.getItem(LAUNCHER_DONE_KEY) === '1') {
      void decideAndLoad();
      return () => { cancelled = true; };
    }

    // Le launcher ne diffuse pas d'événement dédié : on sonde le flag de session.
    const interval = setInterval(() => {
      if (sessionStorage.getItem(LAUNCHER_DONE_KEY) === '1') {
        clearInterval(interval);
        void decideAndLoad();
      }
    }, 400);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const setValue = useCallback((key: string, value: string) => {
    setValues(prev => ({ ...prev, [key]: value }));
  }, []);

  // Progression des clés requises (déjà configurées OU saisies dans ce modal).
  const requiredDone = useMemo(
    () => REQUIRED_KEYS.filter(k => configured[k] || (values[k]?.trim().length ?? 0) > 0).length,
    [configured, values],
  );
  const requiredTotal = REQUIRED_KEYS.length;
  const requiredSatisfied = requiredDone === requiredTotal;

  const dismiss = useCallback(() => {
    localStorage.setItem(SETUP_DONE_KEY, '1');
    setIsOpen(false);
  }, []);

  // Fermeture au clavier (Échap) — comportement standard d'un modal.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, saving, dismiss]);

  const handleSave = useCallback(async () => {
    const updates: Record<string, string> = {};
    for (const spec of ALL_SPECS) {
      const v = values[spec.key];
      if (typeof v === 'string' && v.trim().length > 0) updates[spec.key] = v.trim();
    }

    if (Object.keys(updates).length === 0) {
      dismiss();
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/env', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      const data: EnvApiResponse = await res.json();
      if (data.status === 'success') {
        const applied = data.applied?.length ?? 0;
        const rejected = data.rejected ?? [];
        window.dispatchEvent(
          new CustomEvent('Leanna-settings-saved', { detail: { requiresReconnect: true } }),
        );
        if (rejected.length > 0) {
          setFeedback({
            type: 'error',
            message: `${applied} clé(s) enregistrée(s). Ignorée(s) : ${rejected.join(', ')} (absente(s) du .env).`,
          });
          setSaving(false);
          return;
        }
        setFeedback({
          type: 'success',
          message: `${applied} clé${applied > 1 ? 's' : ''} enregistrée${applied > 1 ? 's' : ''} ✓`,
        });
        setTimeout(() => {
          localStorage.setItem(SETUP_DONE_KEY, '1');
          setIsOpen(false);
        }, 700);
      } else {
        setFeedback({ type: 'error', message: data.error || "Échec de l'enregistrement." });
        setSaving(false);
      }
    } catch {
      setFeedback({ type: 'error', message: 'Erreur réseau lors de l’enregistrement.' });
      setSaving(false);
    }
  }, [values, dismiss]);

  if (checking || !isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={OVERLAY_FADE}
        className="fixed inset-0 z-[99999] flex items-center justify-center overflow-y-auto p-4 sm:p-6"
        style={{ backgroundColor: 'rgba(5, 7, 12, 0.74)', backdropFilter: 'blur(6px)' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="env-setup-title"
      >
        <motion.div
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 10 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          className="relative my-auto w-full max-w-2xl overflow-hidden rounded-2xl border"
          style={{
            backgroundColor: 'var(--bg-panel)',
            borderColor: 'var(--border-base)',
            boxShadow: 'var(--shadow-lg, 0 20px 60px rgba(0,0,0,0.5))',
          }}
        >
          <div className="absolute inset-x-0 top-0 h-1" style={{ background: 'linear-gradient(90deg, var(--accent-primary), transparent)' }} />

          {/* En-tête */}
          <div className="flex items-start gap-3 px-6 pb-4 pt-6">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: 'var(--accent-subtle)' }}>
              <KeyRound className="h-5 w-5" style={{ color: 'var(--accent-primary)' }} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h1 id="env-setup-title" className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Configuration des clés principales
                </h1>
                <span
                  className="flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-mono font-semibold"
                  style={{
                    backgroundColor: requiredSatisfied ? 'color-mix(in srgb, var(--color-success) 15%, transparent)' : 'var(--accent-subtle)',
                    color: requiredSatisfied ? 'var(--color-success)' : 'var(--accent-primary)',
                  }}
                >
                  {requiredDone}/{requiredTotal} requises
                </span>
              </div>
              <p className="mt-0.5 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Renseignez vos clés essentielles pour activer Leanna. Vous pourrez les modifier
                plus tard dans Paramètres → Variables .env.
              </p>
              {/* Barre de progression */}
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: requiredSatisfied ? 'var(--color-success)' : 'var(--accent-primary)' }}
                  initial={false}
                  animate={{ width: `${requiredTotal ? (requiredDone / requiredTotal) * 100 : 0}%` }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
              </div>
            </div>
          </div>

          {/* Bandeau sécurité */}
          <div className="px-6">
            <div
              className="flex items-start gap-2.5 rounded-xl border p-3 text-xs"
              style={{
                borderColor: 'color-mix(in srgb, var(--accent-primary) 30%, transparent)',
                backgroundColor: 'color-mix(in srgb, var(--accent-primary) 8%, transparent)',
                color: 'var(--text-muted)',
              }}
            >
              <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: 'var(--accent-primary)' }} />
              <span>
                Les secrets sont chiffrés au repos par le serveur et ne sont jamais affichés en
                clair. Les champs déjà configurés sont marqués comme tels.
              </span>
            </div>
          </div>

          {/* Corps : groupes de champs */}
          <div className="max-h-[52vh] overflow-y-auto px-6 py-4">
            <div className="flex flex-col gap-5">
              {KEY_GROUPS.map(group => (
                <div key={group.title} className="flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>
                      {group.title}
                    </span>
                    <div className="h-px flex-1" style={{ backgroundColor: 'var(--border-base)' }} />
                  </div>

                  {group.keys.map(spec => {
                    const already = configured[spec.key];
                    const hint = already
                      ? `✓ Déjà configurée. ${spec.hint}`
                      : spec.hint;
                    const placeholder = already
                      ? spec.secret
                        ? '•••••••• (laisser vide pour conserver)'
                        : '(laisser vide pour conserver)'
                      : spec.placeholder;

                    return (
                      <Field key={spec.key} label={spec.label} hint={hint} required={spec.required}>
                        {spec.secret ? (
                          <SecretInput
                            value={values[spec.key] ?? ''}
                            onChange={(v: string) => setValue(spec.key, v)}
                            placeholder={placeholder}
                          />
                        ) : (
                          <TextInput
                            value={values[spec.key] ?? ''}
                            onChange={(v: string) => setValue(spec.key, v)}
                            placeholder={placeholder}
                          />
                        )}
                      </Field>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Feedback */}
          <AnimatePresence>
            {feedback && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="px-6">
                <div
                  className="flex items-center gap-2 rounded-xl border p-2.5 text-xs"
                  style={{
                    borderColor:
                      feedback.type === 'success'
                        ? 'color-mix(in srgb, var(--color-success) 35%, transparent)'
                        : 'color-mix(in srgb, var(--color-error) 35%, transparent)',
                    backgroundColor:
                      feedback.type === 'success'
                        ? 'color-mix(in srgb, var(--color-success) 10%, transparent)'
                        : 'color-mix(in srgb, var(--color-error) 10%, transparent)',
                    color: feedback.type === 'success' ? 'var(--color-success)' : 'var(--color-error)',
                  }}
                >
                  {feedback.type === 'success' ? (
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  )}
                  <span>{feedback.message}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Pied : actions */}
          <div className="flex items-center justify-between gap-3 border-t px-6 py-4" style={{ borderColor: 'var(--border-base)' }}>
            <button
              type="button"
              onClick={dismiss}
              disabled={saving}
              className="text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
              style={{ color: 'var(--text-muted)' }}
            >
              Plus tard
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !requiredSatisfied}
              className="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-45"
              style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--accent-on-primary, #0a1628)' }}
            >
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Enregistrement…
                </>
              ) : (
                <>
                  Terminer
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default EnvSetupModal;
