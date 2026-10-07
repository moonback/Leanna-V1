import { useCallback, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Users, Loader2, Network, AlertTriangle, Search, DraftingCompass, Code2,
  FlaskConical, ShieldCheck, Eye, Gauge, FileText, ArrowDown, Lightbulb,
  Copy, Check, RotateCcw, Sparkles, Play, LayoutList, GitBranch, History, X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ViewHeader } from '../components/ui/ViewHeader.js';

// ─── Types mirrored from the SwarmComposer (agent_compose_swarm) ─────────────

type SwarmStage = 'research' | 'design' | 'build' | 'verify' | 'review' | 'security' | 'optimize' | 'document';
interface SwarmMember { role: string; stage: SwarmStage; rationale: string }
interface SwarmComposition {
  objective: string;
  members: SwarmMember[];
  pipeline: string[];
  summary: string;
}

const STAGE_META: Record<SwarmStage, { label: string; icon: React.FC<{ size?: number; style?: React.CSSProperties }>; color: string }> = {
  research:  { label: 'Recherche',     icon: Search,          color: 'var(--color-info)' },
  design:    { label: 'Conception',    icon: DraftingCompass, color: 'var(--accent-primary)' },
  build:     { label: 'Implémentation', icon: Code2,          color: 'var(--accent-secondary)' },
  verify:    { label: 'Vérification',  icon: FlaskConical,    color: 'var(--color-info)' },
  review:    { label: 'Revue',         icon: Eye,             color: 'var(--color-warning)' },
  security:  { label: 'Sécurité',      icon: ShieldCheck,     color: 'var(--color-error)' },
  optimize:  { label: 'Optimisation',  icon: Gauge,           color: 'var(--accent-secondary)' },
  document:  { label: 'Documentation', icon: FileText,        color: 'var(--text-muted)' },
};

/** Exemples d'objectifs pour amorcer la composition. */
const PRESETS: string[] = [
  'Optimise les performances de mon application',
  'Ajoute une authentification sécurisée',
  'Migre la base de données vers PostgreSQL',
  'Documente et teste le module de paiement',
];

type ViewMode = 'pipeline' | 'grouped';

export default function AgentSwarmView() {
  const reduceMotion = useReducedMotion();
  const navigate = useNavigate();
  const [objective, setObjective] = useState('');
  const [composition, setComposition] = useState<SwarmComposition | null>(null);
  const [loading, setLoading] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('pipeline');
  const [recent, setRecent] = useState<string[]>([]);
  const objectiveRef = useRef<HTMLTextAreaElement>(null);

  const compose = useCallback(async () => {
    if (!objective.trim()) return;
    const obj = objective.trim();
    setLoading(true); setError(null); setComposition(null);
    try {
      const res = await fetch('/api/agents/compose-swarm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objective: obj }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) { setError(data?.error ?? 'Échec de la composition.'); return; }
      setComposition({ objective: data.objective, members: data.members ?? [], pipeline: data.pipeline ?? [], summary: data.summary ?? '' });
      // Historise l'objectif (session, max 6, sans doublon).
      setRecent((prev) => [obj, ...prev.filter((o) => o !== obj)].slice(0, 6));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [objective]);

  const launchMission = useCallback(async () => {
    if (!composition) return;
    setLaunching(true); setError(null);
    try {
      const res = await fetch('/api/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: composition.objective, description: composition.objective }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) { setError(data?.error ?? 'Échec du lancement.'); return; }
      navigate('/mission-timeline');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLaunching(false);
    }
  }, [composition, navigate]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void compose(); }
  }, [compose]);

  const copyComposition = useCallback(async () => {
    if (!composition) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(composition, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  }, [composition]);

  /** Membres regroupés par étape, dans l'ordre du pipeline. */
  const groupedMembers = useMemo(() => {
    if (!composition) return [];
    const order = composition.pipeline.length
      ? composition.pipeline
      : (Object.keys(STAGE_META) as SwarmStage[]);
    const byStage = new Map<string, SwarmMember[]>();
    for (const m of composition.members) {
      const arr = byStage.get(m.stage) ?? [];
      arr.push(m);
      byStage.set(m.stage, arr);
    }
    return order
      .filter((s) => byStage.has(s))
      .map((stage) => ({ stage: stage as SwarmStage, members: byStage.get(stage)! }));
  }, [composition]);

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: 'var(--bg-base)' }}>
      <ViewHeader
        title="Agent Swarm"
        icon={Network}
        description="Leanna compose dynamiquement l'équipe d'agents adaptée à l'objectif, puis la dissout après la mission"
        badge="Composition"
        actions={composition ? (
          <button
            type="button"
            onClick={copyComposition}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
            style={{ backgroundColor: 'var(--bg-input)', color: copied ? 'var(--color-success)' : 'var(--text-secondary)', border: '1px solid var(--border-base)' }}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copié' : 'Copier'}
          </button>
        ) : undefined}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-6">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">

          {/* Objective input */}
          <section className="rounded-lg border p-4 shadow-sm" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="swarm-objective" className="block text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-dimmed)' }}>Objectif</label>
              <span className="text-xs tabular-nums" style={{ color: 'var(--text-dimmed)' }}>{objective.length} car.</span>
            </div>
            <textarea
              id="swarm-objective"
              ref={objectiveRef}
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ex : Optimise les performances de mon application"
              rows={2}
              className="w-full resize-none rounded-md px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
              style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-base)' }}
            />

            {!objective && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <Lightbulb size={12} style={{ color: 'var(--text-dimmed)' }} aria-hidden />
                {PRESETS.map((pst) => (
                  <button
                    key={pst}
                    type="button"
                    onClick={() => { setObjective(pst); objectiveRef.current?.focus(); }}
                    className="rounded-full px-2 py-0.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
                    style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border-base)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-input)'; }}
                  >
                    {pst.length > 36 ? `${pst.slice(0, 36)}…` : pst}
                  </button>
                ))}
              </div>
            )}

            {/* Objectifs récents (session) */}
            {!objective && recent.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <History size={12} style={{ color: 'var(--text-dimmed)' }} aria-hidden />
                {recent.map((r) => (
                  <span
                    key={r}
                    className="group flex items-center gap-1 rounded-full py-0.5 pl-2 pr-1 text-xs"
                    style={{ backgroundColor: 'color-mix(in srgb, var(--accent-primary) 10%, transparent)', color: 'var(--accent-secondary)', border: '1px solid color-mix(in srgb, var(--accent-primary) 24%, transparent)' }}
                  >
                    <button
                      type="button"
                      onClick={() => { setObjective(r); objectiveRef.current?.focus(); }}
                      className="focus-visible:outline-none"
                      title={r}
                    >
                      {r.length > 32 ? `${r.slice(0, 32)}…` : r}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecent((prev) => prev.filter((o) => o !== r))}
                      aria-label="Retirer de l'historique"
                      className="rounded-full p-0.5 opacity-60 hover:opacity-100 focus-visible:outline-none"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-xs" style={{ color: 'var(--text-dimmed)' }}>
                <kbd className="rounded px-1 py-0.5" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)' }}>Ctrl</kbd>
                {' + '}
                <kbd className="rounded px-1 py-0.5" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)' }}>↵</kbd>
                {' pour composer'}
              </span>
              <button
                type="button"
                onClick={() => void compose()}
                disabled={loading || !objective.trim()}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] disabled:opacity-50"
                style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--bg-base)' }}
              >
                {loading ? <Loader2 size={13} className="animate-spin" /> : <Users size={13} />}
                {loading ? 'Composition…' : 'Composer l\'équipe'}
              </button>
            </div>
          </section>

          {error && (
            <div className="flex items-center gap-2 rounded-md p-3 text-xs" style={{ backgroundColor: 'var(--color-error-subtle)', color: 'var(--color-error)' }}>
              <AlertTriangle size={14} /> {error}
            </div>
          )}

          {loading && !composition && <SkeletonSwarm reduceMotion={!!reduceMotion} />}

          <AnimatePresence mode="wait">
            {composition && composition.members.length > 0 && (
              <motion.div
                key={composition.objective}
                initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: reduceMotion ? 0 : 0.18 }}
                className="flex flex-col gap-4"
              >
                {/* Summary */}
                {composition.summary && (
                  <div className="flex items-start gap-2 rounded-lg border p-3 text-xs" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--accent-subtle)', color: 'var(--text-secondary)' }}>
                    <Sparkles size={14} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--accent-secondary)' }} />
                    <p>{composition.summary}</p>
                  </div>
                )}

                {/* Pipeline stats + stage chips + view toggle */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs" style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-secondary)' }}>
                    <Users size={12} style={{ color: 'var(--accent-primary)' }} />
                    <span className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{composition.members.length}</span> agents
                  </span>
                  <span className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs" style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-secondary)' }}>
                    <GitBranch size={12} style={{ color: 'var(--accent-secondary)' }} />
                    <span className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{groupedMembers.length}</span> étapes
                  </span>
                  {composition.pipeline.map((stage, i) => {
                    const meta = STAGE_META[stage as SwarmStage] ?? STAGE_META.build;
                    return (
                      <span key={`${stage}-${i}`} className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: `color-mix(in srgb, ${meta.color} 12%, transparent)`, color: meta.color }}>
                        <meta.icon size={10} /> {meta.label}
                      </span>
                    );
                  })}

                  {/* View mode toggle */}
                  <div className="ml-auto flex items-center gap-0.5 rounded-md p-0.5" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)' }}>
                    <ModeTab active={viewMode === 'pipeline'} icon={LayoutList} label="Pipeline" onClick={() => setViewMode('pipeline')} />
                    <ModeTab active={viewMode === 'grouped'} icon={GitBranch} label="Par étape" onClick={() => setViewMode('grouped')} />
                  </div>
                </div>

                {/* Members — pipeline (séquentiel) ou groupé par étape */}
                {viewMode === 'pipeline' ? (
                  <ol className="flex flex-col items-stretch gap-0">
                    {composition.members.map((m, i) => {
                      const meta = STAGE_META[m.stage] ?? STAGE_META.build;
                      const Icon = meta.icon;
                      return (
                        <li key={`${m.role}-${i}`} className="flex flex-col items-center">
                          <motion.div
                            className="w-full rounded-lg border p-3 shadow-sm"
                            style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)', borderLeft: `3px solid ${meta.color}` }}
                            initial={reduceMotion ? false : { opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: reduceMotion ? 0 : 0.2, delay: reduceMotion ? 0 : i * 0.04 }}
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: `color-mix(in srgb, ${meta.color} 12%, transparent)` }}>
                                <Icon size={15} style={{ color: meta.color }} />
                                <span className="absolute -left-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold" style={{ backgroundColor: meta.color, color: 'var(--bg-base)' }}>{i + 1}</span>
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{m.role}</span>
                                  <span className="rounded-full px-1.5 py-0.5 text-xs font-medium" style={{ backgroundColor: `color-mix(in srgb, ${meta.color} 12%, transparent)`, color: meta.color }}>{meta.label}</span>
                                </div>
                                <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>{m.rationale}</p>
                              </div>
                            </div>
                          </motion.div>
                          {i < composition.members.length - 1 && (
                            <ArrowDown size={14} style={{ color: 'var(--text-dimmed)', margin: '2px 0' }} aria-hidden />
                          )}
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <div className="flex flex-col gap-3">
                    {groupedMembers.map(({ stage, members }, gi) => {
                      const meta = STAGE_META[stage] ?? STAGE_META.build;
                      return (
                        <motion.section
                          key={stage}
                          className="rounded-lg border p-3 shadow-sm"
                          style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}
                          initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: reduceMotion ? 0 : 0.18, delay: reduceMotion ? 0 : gi * 0.05 }}
                        >
                          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em]" style={{ color: meta.color }}>
                            <meta.icon size={12} /> {meta.label}
                            <span className="ml-auto rounded-full px-1.5 py-0.5 text-xs normal-case tracking-normal" style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-dimmed)' }}>{members.length}</span>
                          </h3>
                          <ul className="flex flex-col gap-1.5">
                            {members.map((m, i) => (
                              <li key={`${m.role}-${i}`} className="flex items-start gap-2">
                                <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: meta.color }} aria-hidden />
                                <div className="min-w-0">
                                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{m.role}</span>
                                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{m.rationale}</p>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </motion.section>
                      );
                    })}
                  </div>
                )}

                <p className="text-xs italic" style={{ color: 'var(--text-dimmed)' }}>
                  L'équipe est dissoute automatiquement à la fin de la mission.
                </p>

                {/* Action buttons */}
                <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 py-1">
                  <button
                    type="button"
                    onClick={() => void compose()}
                    disabled={loading}
                    className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] disabled:opacity-50"
                    style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border-base)' }}
                  >
                    <RotateCcw size={13} /> Recomposer
                  </button>
                  <button
                    type="button"
                    onClick={() => void launchMission()}
                    disabled={launching}
                    className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] disabled:opacity-50"
                    style={{ backgroundColor: 'var(--color-success)', color: 'var(--bg-base)' }}
                  >
                    {launching ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                    Lancer la mission
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function ModeTab({ active, icon: Icon, label, onClick }: {
  active: boolean;
  icon: React.FC<{ size?: number; style?: React.CSSProperties }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={label}
      className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
      style={{ backgroundColor: active ? 'var(--bg-active)' : 'transparent', color: active ? 'var(--text-primary)' : 'var(--text-muted)' }}
    >
      <Icon size={12} /> {label}
    </button>
  );
}

function SkeletonSwarm({ reduceMotion }: { reduceMotion: boolean }) {
  const pulse = reduceMotion ? '' : 'animate-pulse';
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className={`h-16 rounded-lg ${pulse}`} style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)' }} />
      ))}
      <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>Composition de l'équipe…</p>
    </div>
  );
}
