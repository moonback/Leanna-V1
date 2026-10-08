import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileCog, RefreshCw, Save, Search, CheckCircle2, AlertCircle,
  AlertTriangle, RotateCcw, KeyRound, ToggleLeft, Hash, List, Type,
  Eye, EyeOff, Loader2, ChevronDown, Copy, Check, Undo2, Filter, X,
} from 'lucide-react';
import {
  Section, Field, TextInput, SecretInput, ToggleSwitch,
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

const TYPE_LABEL: Record<EnvFieldType, string> = {
  secret: 'secret chiffré',
  boolean: 'booléen',
  number: 'nombre',
  select: 'choix',
  text: 'texte',
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

// ─── Bouton d'action compact (copier, réinitialiser…) ─────────────────────────

function IconButton({ onClick, title, disabled, children, tone = 'muted' }: {
  onClick: () => void; title: string; disabled?: boolean;
  children: React.ReactNode; tone?: 'muted' | 'accent' | 'warning';
}) {
  const color = tone === 'accent'
    ? 'var(--accent-primary)'
    : tone === 'warning'
      ? 'var(--color-warning)'
      : 'var(--text-muted)';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ borderColor: 'var(--border-base)', color }}
    >
      {children}
    </button>
  );
}

// ─── Composant principal ───────────────────────────────────────────────────────

export function EnvSection() {
  const [sections, setSections] = useState<EnvSectionData[]>([]);
  const [envFile, setEnvFile] = useState<string>('.env');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [modifiedOnly, setModifiedOnly] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Valeurs éditées (clé → valeur). Une clé n'apparaît que si elle a été modifiée.
  const [edits, setEdits] = useState<Record<string, string>>({});
  // Secrets révélés (déchiffrés à la demande) : clé → valeur en clair.
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  // Clés en cours de déchiffrement (spinner sur le bouton).
  const [revealing, setRevealing] = useState<Set<string>>(new Set());
  // Sections repliées (titre → true si repliée).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // Clé copiée récemment (affiche un ✓ transitoire).
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Index clé → valeur d'origine (pour reset par champ et détection de dirty réel).
  const originalByKey = useMemo(() => {
    const map: Record<string, EnvVarMeta> = {};
    for (const s of sections) for (const v of s.vars) map[v.key] = v;
    return map;
  }, [sections]);

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

  // Auto-dismiss du feedback de succès après quelques secondes.
  useEffect(() => {
    if (feedback?.type === 'success') {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
      feedbackTimer.current = setTimeout(() => setFeedback(null), 4000);
    }
    return () => { if (feedbackTimer.current) clearTimeout(feedbackTimer.current); };
  }, [feedback]);

  // Valeur courante d'une clé : édition en cours > secret révélé > valeur d'origine.
  const currentValue = useCallback((v: EnvVarMeta): string => {
    if (v.key in edits) return edits[v.key];
    if (v.sensitive) return revealed[v.key] ?? '';
    return v.value;
  }, [edits, revealed]);

  const setValue = useCallback((key: string, value: string) => {
    setEdits(prev => ({ ...prev, [key]: value }));
  }, []);

  // Réinitialise un champ à sa valeur d'origine (retire l'édition).
  const resetField = useCallback((key: string) => {
    setEdits(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  // Indique si un secret est actuellement affiché en clair.
  const isRevealed = useCallback(
    (key: string) => key in revealed || key in edits,
    [revealed, edits],
  );

  // Copie une valeur dans le presse-papiers (y compris secrets révélés / édités).
  const copyValue = useCallback(async (v: EnvVarMeta) => {
    let text = '';
    if (v.key in edits) text = edits[v.key];
    else if (v.sensitive) text = revealed[v.key] ?? '';
    else text = v.value;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(v.key);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      setFeedback({ type: 'error', message: 'Impossible de copier dans le presse-papiers.' });
    }
  }, [edits, revealed]);

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

  // Validation légère : repère les champs number non numériques.
  const invalidKeys = useMemo(() => {
    const bad = new Set<string>();
    for (const key of dirtyKeys) {
      const meta = originalByKey[key];
      if (meta?.type === 'number') {
        const val = edits[key].trim();
        if (val !== '' && !/^-?\d+(\.\d+)?$/.test(val)) bad.add(key);
      }
    }
    return bad;
  }, [dirtyKeys, edits, originalByKey]);

  const hasInvalid = invalidKeys.size > 0;

  const handleSave = useCallback(async () => {
    if (!hasChanges || hasInvalid) return;
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
  }, [edits, hasChanges, hasInvalid]);

  const handleDiscard = useCallback(() => {
    setEdits({});
    setRevealed({});
    setFeedback(null);
  }, []);

  // Raccourci clavier Ctrl/Cmd+S pour enregistrer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        if (hasChanges && !hasInvalid && !saving) {
          e.preventDefault();
          handleSave();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasChanges, hasInvalid, saving, handleSave]);

  // Avertit avant de quitter la page avec des modifications non enregistrées.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasChanges) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasChanges]);

  const toggleCollapse = useCallback((title: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title); else next.add(title);
      return next;
    });
  }, []);

  // Filtrage par recherche (clé, description, section) + filtre "modifiées".
  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sections
      .map(s => ({
        ...s,
        vars: s.vars.filter(v => {
          if (modifiedOnly && !(v.key in edits)) return false;
          if (!q) return true;
          return (
            v.key.toLowerCase().includes(q) ||
            (v.description?.toLowerCase().includes(q) ?? false) ||
            s.title.toLowerCase().includes(q)
          );
        }),
      }))
      .filter(s => s.vars.length > 0);
  }, [sections, query, modifiedOnly, edits]);

  const totalVars = useMemo(
    () => sections.reduce((acc, s) => acc + s.vars.length, 0),
    [sections],
  );

  const matchCount = useMemo(
    () => filteredSections.reduce((acc, s) => acc + s.vars.length, 0),
    [filteredSections],
  );

  const allCollapsed = filteredSections.length > 0 && filteredSections.every(s => collapsed.has(s.title));
  const toggleAll = useCallback(() => {
    if (allCollapsed) setCollapsed(new Set());
    else setCollapsed(new Set(filteredSections.map(s => s.title)));
  }, [allCollapsed, filteredSections]);

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
            <button onClick={() => setFeedback(null)} className="ml-auto opacity-60 hover:opacity-100" aria-label="Fermer">
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Barre d'actions : recherche + filtres + refresh (sticky) */}
      <div
        className="sticky top-0 z-20 flex flex-col gap-2 rounded-xl py-1 sm:flex-row sm:items-center"
        style={{ backgroundColor: 'var(--bg-panel)' }}
      >
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
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2.5 opacity-50 hover:opacity-100"
              style={{ color: 'var(--text-muted)' }}
              aria-label="Effacer la recherche"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <button
          onClick={() => setModifiedOnly(m => !m)}
          disabled={!hasChanges}
          title={modifiedOnly ? 'Afficher toutes les variables' : 'Afficher seulement les variables modifiées'}
          className="flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            borderColor: modifiedOnly ? 'var(--accent-primary)' : 'var(--border-base)',
            color: modifiedOnly ? 'var(--accent-primary)' : 'var(--text-secondary)',
            backgroundColor: modifiedOnly ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
          }}
        >
          <Filter className="h-3.5 w-3.5" />
          Modifiées{hasChanges ? ` (${dirtyKeys.length})` : ''}
        </button>

        <button
          onClick={toggleAll}
          disabled={filteredSections.length === 0}
          className="flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition hover:opacity-80 disabled:opacity-40"
          style={{ borderColor: 'var(--border-base)', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-secondary)' }}
        >
          <ChevronDown
            className="h-3.5 w-3.5 transition-transform"
            style={{ transform: allCollapsed ? 'rotate(-90deg)' : 'none' }}
          />
          {allCollapsed ? 'Tout déplier' : 'Tout replier'}
        </button>

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

      {/* Compteur de résultats */}
      {(query.trim() || modifiedOnly) && (
        <p className="text-xs" style={{ color: 'var(--text-dimmed)' }}>
          {matchCount} variable{matchCount > 1 ? 's' : ''} affichée{matchCount > 1 ? 's' : ''} sur {totalVars}
        </p>
      )}

      {/* Sections */}
      {filteredSections.length === 0 ? (
        <p className="py-6 text-center text-xs" style={{ color: 'var(--text-dimmed)' }}>
          {modifiedOnly && !query.trim()
            ? 'Aucune variable modifiée pour le moment.'
            : `Aucune variable ne correspond à « ${query} ».`}
        </p>
      ) : (
        filteredSections.map(section => {
          const isCollapsed = collapsed.has(section.title);
          const sectionDirty = section.vars.filter(v => v.key in edits).length;
          return (
            <div key={section.title} className="flex flex-col">
              {/* En-tête de section cliquable */}
              <button
                type="button"
                onClick={() => toggleCollapse(section.title)}
                className="group flex items-center gap-3 py-2 text-left"
                aria-expanded={!isCollapsed}
              >
                <ChevronDown
                  className="h-3.5 w-3.5 shrink-0 transition-transform duration-200"
                  style={{
                    color: 'var(--text-dimmed)',
                    transform: isCollapsed ? 'rotate(-90deg)' : 'none',
                  }}
                />
                <span className="text-xs font-mono tracking-wider font-bold" style={{ color: 'var(--text-dimmed)' }}>
                  {section.title.toUpperCase()}
                </span>
                <span
                  className="rounded-full px-1.5 py-0.5 text-xs font-mono"
                  style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
                >
                  {section.vars.length}
                </span>
                {sectionDirty > 0 && (
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: 'var(--accent-primary)' }}
                    title={`${sectionDirty} modification(s) dans cette section`}
                  />
                )}
                <div className="h-px flex-1" style={{ backgroundColor: 'var(--border-base)' }} />
              </button>

              <AnimatePresence initial={false}>
                {!isCollapsed && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ overflow: 'hidden' }}
                  >
                    {section.vars.map(v => {
                      const Icon = TYPE_ICON[v.type];
                      const isDirty = v.key in edits;
                      const isInvalid = invalidKeys.has(v.key);
                      const canCopy = isDirty || !v.sensitive || v.key in revealed;
                      return (
                        <Field key={v.key} label={v.key} hint={v.description}>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5">
                              <Icon className="h-3 w-3 shrink-0" style={{ color: 'var(--text-dimmed)' }} />
                              <span className="text-xs" style={{ color: 'var(--text-dimmed)' }}>
                                {TYPE_LABEL[v.type]}
                              </span>
                              {!v.hasValue && !isDirty && (
                                <span className="text-xs italic" style={{ color: 'var(--text-dimmed)' }}>
                                  · non défini
                                </span>
                              )}
                              {isDirty && (
                                <button
                                  type="button"
                                  onClick={() => resetField(v.key)}
                                  className="ml-auto flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium transition hover:opacity-80"
                                  style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}
                                  title="Réinitialiser ce champ à sa valeur d'origine"
                                >
                                  <Undo2 className="h-2.5 w-2.5" />
                                  modifié
                                </button>
                              )}
                            </div>

                            {v.type === 'boolean' ? (
                              <ToggleSwitch
                                label=""
                                value={/^(true|1|yes|on)$/i.test(currentValue(v))}
                                onChange={(checked) => setValue(v.key, checked ? 'true' : 'false')}
                              />
                            ) : v.type === 'select' && v.options ? (
                              <div className="flex items-center gap-1.5">
                                <div className="flex-1">
                                  <EnvSelect
                                    value={currentValue(v)}
                                    onChange={(val) => setValue(v.key, val)}
                                    options={v.options}
                                  />
                                </div>
                                <IconButton
                                  onClick={() => copyValue(v)}
                                  title="Copier la valeur"
                                  disabled={!currentValue(v)}
                                >
                                  {copiedKey === v.key ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                </IconButton>
                              </div>
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
                                  <IconButton
                                    onClick={() => revealSecret(v.key)}
                                    disabled={revealing.has(v.key) || (v.key in edits)}
                                    title={isRevealed(v.key) ? 'Masquer la valeur' : 'Révéler / déchiffrer'}
                                  >
                                    {revealing.has(v.key)
                                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      : isRevealed(v.key)
                                        ? <EyeOff className="h-3.5 w-3.5" />
                                        : <Eye className="h-3.5 w-3.5" />}
                                  </IconButton>
                                  <IconButton
                                    onClick={() => copyValue(v)}
                                    title={canCopy ? 'Copier la valeur' : 'Révélez le secret pour le copier'}
                                    disabled={!canCopy || !currentValue(v)}
                                  >
                                    {copiedKey === v.key ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                  </IconButton>
                                </div>
                                {isRevealed(v.key) && !(v.key in edits) && (
                                  <span className="text-xs" style={{ color: 'var(--color-warning)' }}>
                                    Valeur déchiffrée affichée — visible en clair à l'écran.
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1.5">
                                  <div className="flex-1">
                                    <TextInput
                                      value={currentValue(v)}
                                      onChange={(val) => setValue(v.key, val)}
                                      placeholder={v.type === 'number' ? '0' : 'Vide'}
                                      inputMode={v.type === 'number' ? 'numeric' : undefined}
                                      style={isInvalid ? {
                                        backgroundColor: 'var(--bg-input)',
                                        border: '1px solid var(--color-error)',
                                        color: 'var(--text-primary)',
                                      } : undefined}
                                    />
                                  </div>
                                  <IconButton
                                    onClick={() => copyValue(v)}
                                    title="Copier la valeur"
                                    disabled={!currentValue(v)}
                                  >
                                    {copiedKey === v.key ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                  </IconButton>
                                </div>
                                {isInvalid && (
                                  <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-error)' }}>
                                    <AlertCircle className="h-3 w-3" />
                                    Valeur numérique attendue.
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </Field>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })
      )}

      {/* Barre de sauvegarde flottante */}
      <AnimatePresence>
        {hasChanges && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="sticky bottom-2 z-10 mt-2 flex flex-col gap-2 rounded-xl border p-3 shadow-lg sm:flex-row sm:items-center sm:justify-between"
            style={{
              backgroundColor: 'var(--bg-panel)',
              borderColor: hasInvalid ? 'var(--color-error)' : 'var(--accent-primary)',
              boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
            }}
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                {dirtyKeys.length} modification{dirtyKeys.length > 1 ? 's' : ''} en attente
                {hasInvalid && (
                  <span style={{ color: 'var(--color-error)' }}>
                    {' '}· {invalidKeys.size} invalide{invalidKeys.size > 1 ? 's' : ''}
                  </span>
                )}
              </span>
              <span className="truncate font-mono text-xs" style={{ color: 'var(--text-dimmed)' }}>
                {dirtyKeys.join(', ')}
              </span>
            </div>
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
                disabled={saving || hasInvalid}
                title={hasInvalid ? 'Corrigez les champs invalides avant d\'enregistrer' : 'Enregistrer (Ctrl/Cmd+S)'}
                className="flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: 'var(--accent-primary)' }}
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Section>
  );
}
