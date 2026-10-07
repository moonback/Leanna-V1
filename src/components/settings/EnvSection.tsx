import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileCog, RefreshCw, Save, Search, CheckCircle2, AlertCircle,
  AlertTriangle, RotateCcw, KeyRound, ToggleLeft, Hash, List, Type,
  Eye, EyeOff, Loader2,
} from 'lucide-react';
import {
  Section, Field, TextInput, SecretInput, ToggleSwitch, SectionDivider,
} from './SettingsPrimitives.js';

// ─── Types (miroir de la réponse serveur) ─────────────────────────────────────

type EnvFieldType = 'secret' | 'boolean' | 'number' | 'select' | 'text';

interface EnvSelectOption {
  value: string;
  label: string;
}

interface EnvVarMeta {
  key: string;
  value: string;
  hasValue: boolean;
  preview?: string;
  sensitive: boolean;
  type: EnvFieldType;
  section: string;
  description?: string;
  options?: EnvSelectOption[];
}

interface EnvSectionData {
  title: string;
  vars: EnvVarMeta[];
}

interface EnvApiResponse {
  status: 'success' | 'error';
  sections?: EnvSectionData[];
  path?: string;
  error?: string;
}

const TYPE_ICON: Record<EnvFieldType, React.FC<any>> = {
  secret: KeyRound,
  boolean: ToggleLeft,
  number: Hash,
  select: List,
  text: Type,
};

// ─── Select natif stylé (aligné sur les primitives) ───────────────────────────

function EnvSelect({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: EnvSelectOption[];
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full rounded-xl px-3 py-2 text-xs font-mono outline-none transition-all duration-150"
      style={{
        backgroundColor: 'var(--bg-input)',
        border: '1px solid var(--border-base)',
        color: 'var(--text-primary)',
      }}
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// ─── Composant principal ───────────────────────────────────────────────────────

export function EnvSection() {
  const [sections, setSections] = useState<EnvSectionData[]>([]);
  const [envFile, setEnvFile] = useState<string>('.env');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Valeurs éditées (clé → valeur). Une clé n'apparaît que si elle a été modifiée.
  const [edits, setEdits] = useState<Record<string, string>>({});
  // Secrets révélés (déchiffrés à la demande) : clé → valeur en clair.
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  // Clés en cours de déchiffrement (spinner sur le bouton).
  const [revealing, setRevealing] = useState<Set<string>>(new Set());

  const fetchEnv = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/env');
      const data: EnvApiResponse = await res.json();
      if (data.status === 'success' && data.sections) {
        setSections(data.sections);
        if (data.path) setEnvFile(data.path);
        setEdits({});
        setRevealed({});
      } else {
        setFeedback({ type: 'error', message: data.error || 'Impossible de charger le fichier .env.' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Erreur réseau lors du chargement du .env.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEnv(); }, [fetchEnv]);

  // Valeur courante d'une clé : édition en cours > secret révélé > valeur d'origine.
  const currentValue = useCallback((v: EnvVarMeta): string => {
    if (v.key in edits) return edits[v.key];
    if (v.sensitive) return revealed[v.key] ?? '';
    return v.value;
  }, [edits, revealed]);

  const setValue = useCallback((key: string, value: string) => {
    setEdits(prev => ({ ...prev, [key]: value }));
  }, []);

  // Indique si un secret est actuellement affiché en clair.
  const isRevealed = useCallback(
    (key: string) => key in revealed || key in edits,
    [revealed, edits],
  );

  // Récupère la valeur déchiffrée d'une clé sensible auprès du serveur.
  const revealSecret = useCallback(async (key: string) => {
    // Déjà révélé → on masque (retire de revealed, sauf si édité).
    if (key in revealed) {
      setRevealed(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }
    setRevealing(prev => new Set(prev).add(key));
    try {
      const res = await fetch(`/api/env/reveal/${encodeURIComponent(key)}`);
      const data = await res.json() as { status: string; value?: string; error?: string };
      if (data.status === 'success') {
        setRevealed(prev => ({ ...prev, [key]: data.value ?? '' }));
      } else {
        setFeedback({ type: 'error', message: data.error || `Impossible de déchiffrer ${key}.` });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Erreur réseau lors du déchiffrement.' });
    } finally {
      setRevealing(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, [revealed]);

  const dirtyKeys = useMemo(() => Object.keys(edits), [edits]);
  const hasChanges = dirtyKeys.length > 0;

  const handleSave = useCallback(async () => {
    if (!hasChanges) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/env', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: edits }),
      });
      const data: EnvApiResponse & { applied?: string[]; rejected?: string[] } = await res.json();
      if (data.status === 'success') {
        if (data.sections) setSections(data.sections);
        setEdits({});
        setRevealed({});
        const n = data.applied?.length ?? 0;
        setFeedback({
          type: 'success',
          message: `${n} variable${n > 1 ? 's' : ''} enregistrée${n > 1 ? 's' : ''} ✓${
            data.rejected?.length ? ` — ${data.rejected.length} ignorée(s)` : ''
          }`,
        });
        window.dispatchEvent(new CustomEvent('Leanna-settings-saved', { detail: { requiresReconnect: true } }));
      } else {
        setFeedback({ type: 'error', message: data.error || 'Échec de la sauvegarde.' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Erreur réseau lors de la sauvegarde.' });
    } finally {
      setSaving(false);
    }
  }, [edits, hasChanges]);

  const handleDiscard = useCallback(() => {
    setEdits({});
    setRevealed({});
    setFeedback(null);
  }, []);

  // Filtrage par recherche (clé, description, section).
  const filteredSections = useMemo(() => {
    if (!query.trim()) return sections;
    const q = query.toLowerCase();
    return sections
      .map(s => ({
        ...s,
        vars: s.vars.filter(v =>
          v.key.toLowerCase().includes(q) ||
          (v.description?.toLowerCase().includes(q) ?? false) ||
          s.title.toLowerCase().includes(q)
        ),
      }))
      .filter(s => s.vars.length > 0);
  }, [sections, query]);

  const totalVars = useMemo(
    () => sections.reduce((acc, s) => acc + s.vars.length, 0),
    [sections],
  );

  if (loading) {
    return (
      <Section icon={FileCog} title="Variables d'environnement" description="Chargement du fichier .env…">
        <div className="flex items-center justify-center py-10">
          <RefreshCw className="h-6 w-6 animate-spin" style={{ color: 'var(--text-muted)' }} />
        </div>
      </Section>
    );
  }

  return (
    <Section
      icon={FileCog}
      title="Variables d'environnement"
      description={`Consultez et modifiez les variables du fichier ${envFile}. Les secrets sont chiffrés au repos et jamais affichés en clair.`}
      badge={`${totalVars} clés`}
    >
      {/* Avertissement sécurité */}
      <div
        className="flex items-start gap-2.5 rounded-xl border p-3 text-xs"
        style={{
          borderColor: 'color-mix(in srgb, var(--color-warning) 35%, transparent)',
          backgroundColor: 'color-mix(in srgb, var(--color-warning) 10%, transparent)',
          color: 'var(--color-warning)',
        }}
      >
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <span className="leading-relaxed">
          Modifier ces variables peut affecter la sécurité et le comportement du serveur.
          Un redémarrage peut être nécessaire pour certaines clés (ports, hôtes, verrous).
        </span>
      </div>

      {/* Feedback */}
      <AnimatePresence>
        {feedback && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center gap-2.5 rounded-xl border p-3 text-xs"
            style={{
              borderColor: feedback.type === 'success'
                ? 'color-mix(in srgb, var(--color-success) 35%, transparent)'
                : 'color-mix(in srgb, var(--color-error) 35%, transparent)',
              backgroundColor: feedback.type === 'success'
                ? 'color-mix(in srgb, var(--color-success) 10%, transparent)'
                : 'color-mix(in srgb, var(--color-error) 10%, transparent)',
              color: feedback.type === 'success' ? 'var(--color-success)' : 'var(--color-error)',
            }}
          >
            {feedback.type === 'success'
              ? <CheckCircle2 className="h-4 w-4 shrink-0" />
              : <AlertCircle className="h-4 w-4 shrink-0" />}
            <span className="flex-1">{feedback.message}</span>
            <button onClick={() => setFeedback(null)} className="ml-auto opacity-60 hover:opacity-100">✕</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Barre d'actions : recherche + refresh */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex flex-1 items-center">
          <Search className="absolute left-2.5 h-3.5 w-3.5 opacity-50" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Rechercher une variable…"
            className="w-full rounded-xl border px-8 py-2 text-xs outline-none transition-all"
            style={{
              backgroundColor: 'var(--bg-input)',
              borderColor: 'var(--border-base)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
        <button
          onClick={fetchEnv}
          disabled={saving}
          className="flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition hover:opacity-80 disabled:opacity-50"
          style={{ borderColor: 'var(--border-base)', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-secondary)' }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Recharger
        </button>
      </div>

      {/* Sections */}
      {filteredSections.length === 0 ? (
        <p className="py-6 text-center text-xs" style={{ color: 'var(--text-dimmed)' }}>
          Aucune variable ne correspond à « {query} ».
        </p>
      ) : (
        filteredSections.map(section => (
          <div key={section.title} className="flex flex-col">
            <SectionDivider label={section.title.toUpperCase()} />
            {section.vars.map(v => {
              const Icon = TYPE_ICON[v.type];
              const isDirty = v.key in edits;
              return (
                <Field
                  key={v.key}
                  label={v.key}
                  hint={v.description}
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5">
                      <Icon className="h-3 w-3 shrink-0" style={{ color: 'var(--text-dimmed)' }} />
                      <span className="text-xs" style={{ color: 'var(--text-dimmed)' }}>
                        {v.type === 'secret' ? 'secret chiffré' : v.type}
                      </span>
                      {isDirty && (
                        <span
                          className="ml-auto rounded-full px-1.5 py-0.5 text-xs font-medium"
                          style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}
                        >
                          modifié
                        </span>
                      )}
                    </div>

                    {v.type === 'boolean' ? (
                      <ToggleSwitch
                        label=""
                        value={/^(true|1|yes|on)$/i.test(currentValue(v))}
                        onChange={(checked) => setValue(v.key, checked ? 'true' : 'false')}
                      />
                    ) : v.type === 'select' && v.options ? (
                      <EnvSelect
                        value={currentValue(v)}
                        onChange={(val) => setValue(v.key, val)}
                        options={v.options}
                      />
                    ) : v.type === 'secret' ? (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1">
                            {isRevealed(v.key) ? (
                              <TextInput
                                value={currentValue(v)}
                                onChange={(val) => setValue(v.key, val)}
                                placeholder={v.hasValue ? '' : 'Non défini'}
                              />
                            ) : (
                              <SecretInput
                                value={currentValue(v)}
                                onChange={(val) => setValue(v.key, val)}
                                placeholder={v.hasValue ? (v.preview || '••••••••') : 'Non défini'}
                              />
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => revealSecret(v.key)}
                            disabled={revealing.has(v.key) || (v.key in edits)}
                            title={isRevealed(v.key) ? 'Masquer la valeur' : 'Révéler / déchiffrer'}
                            aria-label={isRevealed(v.key) ? 'Masquer la valeur' : 'Révéler la valeur déchiffrée'}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40"
                            style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}
                          >
                            {revealing.has(v.key)
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : isRevealed(v.key)
                                ? <EyeOff className="h-3.5 w-3.5" />
                                : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                        {isRevealed(v.key) && !(v.key in edits) && (
                          <span className="text-xs" style={{ color: 'var(--color-warning)' }}>
                            Valeur déchiffrée affichée — visible en clair à l'écran.
                          </span>
                        )}
                      </div>
                    ) : (
                      <TextInput
                        value={currentValue(v)}
                        onChange={(val) => setValue(v.key, val)}
                        placeholder={v.type === 'number' ? '0' : 'Vide'}
                        inputMode={v.type === 'number' ? 'numeric' : undefined}
                      />
                    )}
                  </div>
                </Field>
              );
            })}
          </div>
        ))
      )}

      {/* Barre de sauvegarde flottante */}
      <AnimatePresence>
        {hasChanges && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="sticky bottom-2 z-10 mt-2 flex items-center justify-between gap-3 rounded-xl border p-3 shadow-lg"
            style={{
              backgroundColor: 'var(--bg-panel)',
              borderColor: 'var(--accent-primary)',
              boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
            }}
          >
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              {dirtyKeys.length} modification{dirtyKeys.length > 1 ? 's' : ''} en attente
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDiscard}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition hover:opacity-80 disabled:opacity-50"
                style={{ borderColor: 'var(--border-strong)', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-secondary)' }}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
                style={{ backgroundColor: 'var(--accent-primary)' }}
              >
                <Save className="h-3.5 w-3.5" />
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Section>
  );
}
