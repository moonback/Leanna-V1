import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  History, RefreshCw, Loader2, FlagTriangleRight, Search, Wrench,
  AlertTriangle, RotateCcw, CheckCircle2, CircleDot, Target, ShieldAlert,
  Pause, Play, XCircle, Trash2, ChevronLeft, ChevronRight, SkipBack, SkipForward,
  Copy, Check, Filter, Clock, Zap, Activity, X,
} from 'lucide-react';
import { ViewHeader } from '../components/ui/ViewHeader.js';
import { missionApi } from '../services/ideApi.js';

// ─── Types mirrored from the MissionTimeTravel engine ────────────────────────

type TimelineEventType =
  | 'plan' | 'goal_start' | 'analyze' | 'action' | 'reflect'
  | 'failure' | 'replan' | 'escalate' | 'goal_complete' | 'success' | 'end';

interface StepSnapshot {
  skillName?: string;
  args?: Record<string, unknown>;
  rationale?: string;
  score?: number;
  status?: string;
  result?: unknown;
  decision?: string;
  reasoning?: string;
  confidence?: number;
  observation?: string;
  success?: string | null;
  failure?: string | null;
}
interface TimelineEvent {
  index: number;
  type: TimelineEventType;
  at?: string;
  label: string;
  goalTitle?: string;
  snapshot?: StepSnapshot;
}
interface MissionTimeline {
  missionId: string;
  title: string;
  status: string;
  events: TimelineEvent[];
}
interface MissionListItem {
  id: string;
  title: string;
  status: string;
  /** Pause suivie côté Executor (le statut reste "in_progress" pendant une pause). */
  paused?: boolean;
}

/** Statuts terminaux : plus d'action de pilotage, seule la suppression reste. */
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

const EVENT_META: Record<TimelineEventType, { icon: React.FC<{ size?: number; style?: React.CSSProperties }>; color: string; label: string }> = {
  plan:          { icon: FlagTriangleRight, color: 'var(--accent-primary)',   label: 'Plan' },
  goal_start:    { icon: Search,            color: 'var(--color-info)',        label: 'Objectif' },
  analyze:       { icon: Search,            color: 'var(--color-info)',        label: 'Analyse' },
  action:        { icon: Wrench,            color: 'var(--accent-secondary)',  label: 'Action' },
  reflect:       { icon: CircleDot,         color: 'var(--text-muted)',        label: 'Réflexion' },
  failure:       { icon: AlertTriangle,     color: 'var(--color-error)',       label: 'Échec' },
  replan:        { icon: RotateCcw,         color: 'var(--color-warning)',     label: 'Replanif.' },
  escalate:      { icon: ShieldAlert,       color: 'var(--color-warning)',     label: 'Escalade' },
  goal_complete: { icon: CheckCircle2,      color: 'var(--color-success)',     label: 'Objectif ✓' },
  success:       { icon: CheckCircle2,      color: 'var(--color-success)',     label: 'Succès' },
  end:           { icon: Target,            color: 'var(--text-muted)',        label: 'Fin' },
};

/** Couleur associée à un statut de mission (badge). */
function statusTone(status: string, paused?: boolean): string {
  if (paused) return 'var(--color-warning)';
  switch (status) {
    case 'completed': return 'var(--color-success)';
    case 'failed': return 'var(--color-error)';
    case 'cancelled': return 'var(--text-muted)';
    case 'in_progress': return 'var(--accent-primary)';
    default: return 'var(--color-info)';
  }
}

function timeOf(at?: string): string {
  if (!at) return '';
  try { return new Date(at).toISOString().slice(11, 19); } catch { return ''; }
}

/** Durée lisible entre deux timestamps ISO. */
function humanDuration(startAt?: string, endAt?: string): string {
  if (!startAt || !endAt) return '—';
  try {
    const ms = new Date(endAt).getTime() - new Date(startAt).getTime();
    if (!Number.isFinite(ms) || ms < 0) return '—';
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return rem ? `${m}m ${rem}s` : `${m}m`;
  } catch { return '—'; }
}

export default function MissionTimelineView() {
  const reduceMotion = useReducedMotion();
  const [missions, setMissions] = useState<MissionListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<MissionTimeline | null>(null);
  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [missionQuery, setMissionQuery] = useState('');
  const [typeFilters, setTypeFilters] = useState<Set<TimelineEventType>>(new Set());
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;
  const stepRefs = useRef<Map<number, HTMLLIElement>>(new Map());

  const loadMissions = useCallback(async () => {
    try {
      const data = await fetch('/api/missions').then((r) => r.json()).catch(() => null);
      const raw: Array<Record<string, unknown>> = Array.isArray(data?.missions) ? data.missions : [];
      const list: MissionListItem[] = raw.map((m) => ({
        id: String(m.id),
        title: String(m.title ?? ''),
        status: String(m.status ?? ''),
        paused: m.paused === true,
      }));
      setMissions(list);
      setSelectedId((prev) => prev ?? list[0]?.id ?? null);
    } catch { /* best-effort */ }
  }, []);

  const loadTimeline = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const data = await fetch(`/api/missions/${id}/timeline`).then((r) => r.json()).catch(() => null);
      if (data?.timeline) {
        setTimeline(data.timeline as MissionTimeline);
        setSelectedStep(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const runMissionAction = useCallback(
    async (
      missionId: string,
      op: 'pause' | 'resume' | 'cancel' | 'delete',
      optimistic: (m: MissionListItem) => MissionListItem | null,
    ) => {
      setBusyIds((prev) => new Set(prev).add(missionId));
      setMissions((prev) =>
        prev
          .map((m) => (m.id === missionId ? optimistic(m) : m))
          .filter((m): m is MissionListItem => m !== null),
      );
      try {
        if (op === 'pause') await missionApi.pauseMission(missionId);
        else if (op === 'resume') await missionApi.resumeMission(missionId);
        else if (op === 'cancel') await missionApi.cancelMission(missionId);
        else await missionApi.deleteMission(missionId);
      } finally {
        await loadMissions();
        if (op === 'delete' && selectedIdRef.current === missionId) {
          setSelectedId(null);
          setTimeline(null);
        }
        setBusyIds((prev) => {
          const next = new Set(prev);
          next.delete(missionId);
          return next;
        });
      }
    },
    [loadMissions],
  );

  useEffect(() => { void loadMissions(); }, [loadMissions]);
  useEffect(() => { if (selectedId) void loadTimeline(selectedId); }, [selectedId, loadTimeline]);

  // Live refresh: when the selected mission emits an event, reload its timeline.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { missionId?: string } | undefined;
      if (!detail?.missionId) return;
      void loadMissions();
      if (detail.missionId === selectedIdRef.current) void loadTimeline(detail.missionId);
    };
    window.addEventListener('Leanna-mission-event', handler);
    return () => window.removeEventListener('Leanna-mission-event', handler);
  }, [loadMissions, loadTimeline]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const filteredMissions = useMemo(() => {
    const q = missionQuery.trim().toLowerCase();
    if (!q) return missions;
    return missions.filter((m) => m.title.toLowerCase().includes(q) || m.status.toLowerCase().includes(q));
  }, [missions, missionQuery]);

  const events = useMemo(() => timeline?.events ?? [], [timeline]);

  /** Only event types actually present, for the filter chip row. */
  const presentTypes = useMemo(() => {
    const seen = new Set<TimelineEventType>();
    for (const ev of events) seen.add(ev.type);
    return (Object.keys(EVENT_META) as TimelineEventType[]).filter((t) => seen.has(t));
  }, [events]);

  const visibleEvents = useMemo(() => {
    if (typeFilters.size === 0) return events;
    return events.filter((ev) => typeFilters.has(ev.type));
  }, [events, typeFilters]);

  /** Mission-level stats surfaced as a compact dashboard strip. */
  const stats = useMemo(() => {
    let actions = 0, failures = 0, replans = 0;
    for (const ev of events) {
      if (ev.type === 'action') actions++;
      else if (ev.type === 'failure') failures++;
      else if (ev.type === 'replan') replans++;
    }
    const duration = humanDuration(events[0]?.at, events[events.length - 1]?.at);
    return { total: events.length, actions, failures, replans, duration };
  }, [events]);

  /** Time-travel cursor: index into the *visible* list, drives the scrubber. */
  const cursor = useMemo(() => {
    if (selectedStep === null) return visibleEvents.length - 1;
    const i = visibleEvents.findIndex((e) => e.index === selectedStep);
    return i >= 0 ? i : visibleEvents.length - 1;
  }, [selectedStep, visibleEvents]);

  const gotoCursor = useCallback((i: number) => {
    const clamped = Math.max(0, Math.min(visibleEvents.length - 1, i));
    const ev = visibleEvents[clamped];
    if (ev) setSelectedStep(ev.index);
  }, [visibleEvents]);

  // Auto-scroll the active step into view.
  useEffect(() => {
    if (selectedStep === null) return;
    const el = stepRefs.current.get(selectedStep);
    el?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
  }, [selectedStep, reduceMotion]);

  const toggleTypeFilter = useCallback((t: TimelineEventType) => {
    setTypeFilters((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  }, []);

  const selectedEvent = timeline && selectedStep !== null ? timeline.events[selectedStep] : null;
  const hasTimeline = !!timeline && visibleEvents.length > 0;

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: 'var(--bg-base)' }}>
      <ViewHeader
        title="Mission Timeline"
        icon={History}
        description="Parcours chronologique d'une mission — clique une étape ou utilise le scrubber pour « voyager » dans le temps"
        badge="Time Travel"
        actions={
          <button
            type="button"
            onClick={() => { void loadMissions(); if (selectedId) void loadTimeline(selectedId); }}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] disabled:opacity-60"
            style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border-base)' }}
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Actualiser
          </button>
        }
      />

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto flex h-full w-full max-w-7xl gap-4 px-4 py-4 lg:px-6">

          {/* Left — mission picker */}
          <aside className="flex w-60 flex-shrink-0 flex-col gap-2 overflow-hidden" aria-label="Liste des missions">
            {/* Search */}
            <div className="relative flex-shrink-0">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-dimmed)' }} />
              <input
                type="text"
                value={missionQuery}
                onChange={(e) => setMissionQuery(e.target.value)}
                placeholder="Rechercher une mission…"
                aria-label="Rechercher une mission"
                className="w-full rounded-md py-1.5 pl-8 pr-7 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
                style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-base)' }}
              />
              {missionQuery && (
                <button
                  type="button"
                  onClick={() => setMissionQuery('')}
                  aria-label="Effacer la recherche"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
                  style={{ color: 'var(--text-dimmed)' }}
                >
                  <X size={12} />
                </button>
              )}
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-0.5">
              {filteredMissions.length === 0 ? (
                <p className="px-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                  {missions.length === 0 ? 'Aucune mission. Lancez une mission pour voir sa timeline.' : 'Aucune mission ne correspond.'}
                </p>
              ) : filteredMissions.map((m) => (
                <MissionPickerItem
                  key={m.id}
                  mission={m}
                  active={m.id === selectedId}
                  busy={busyIds.has(m.id)}
                  onSelect={() => setSelectedId(m.id)}
                  onAction={runMissionAction}
                />
              ))}
            </div>
          </aside>

          {/* Middle — timeline + scrubber */}
          <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border shadow-sm" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}>
            {loading && !timeline ? (
              <p className="p-4 text-xs" style={{ color: 'var(--text-muted)' }}>Reconstruction de la timeline…</p>
            ) : timeline && events.length > 0 ? (
              <>
                {/* Stats strip */}
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: 'var(--border-base)' }}>
                  <Stat icon={Activity} label="Étapes" value={stats.total} tone="var(--accent-primary)" />
                  <Stat icon={Wrench} label="Actions" value={stats.actions} tone="var(--accent-secondary)" />
                  {stats.failures > 0 && <Stat icon={AlertTriangle} label="Échecs" value={stats.failures} tone="var(--color-error)" />}
                  {stats.replans > 0 && <Stat icon={RotateCcw} label="Replans" value={stats.replans} tone="var(--color-warning)" />}
                  <Stat icon={Clock} label="Durée" value={stats.duration} tone="var(--color-info)" />
                </div>

                {/* Type filter chips */}
                {presentTypes.length > 1 && (
                  <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5 border-b px-4 py-2" style={{ borderColor: 'var(--border-base)' }}>
                    <Filter size={12} style={{ color: 'var(--text-dimmed)' }} aria-hidden />
                    {presentTypes.map((t) => {
                      const meta = EVENT_META[t];
                      const on = typeFilters.size === 0 || typeFilters.has(t);
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => toggleTypeFilter(t)}
                          aria-pressed={typeFilters.has(t)}
                          className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
                          style={{
                            backgroundColor: `color-mix(in srgb, ${meta.color} 14%, transparent)`,
                            color: meta.color,
                            border: `1px solid color-mix(in srgb, ${meta.color} 30%, transparent)`,
                            opacity: on ? 1 : 0.4,
                          }}
                        >
                          <meta.icon size={10} />
                          {meta.label}
                        </button>
                      );
                    })}
                    {typeFilters.size > 0 && (
                      <button
                        type="button"
                        onClick={() => setTypeFilters(new Set())}
                        className="ml-1 rounded-full px-2 py-0.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
                        style={{ color: 'var(--text-dimmed)' }}
                      >
                        Tout
                      </button>
                    )}
                  </div>
                )}

                {/* Timeline list */}
                <ol className="relative flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-4">
                  {visibleEvents.map((ev, i) => {
                    const meta = EVENT_META[ev.type] ?? EVENT_META.action;
                    const Icon = meta.icon;
                    const active = selectedStep === ev.index;
                    const clickable = !!ev.snapshot;
                    // Time-travel visual: steps up to the cursor are "visited".
                    const visited = selectedStep !== null && i <= cursor;
                    return (
                      <li
                        key={ev.index}
                        ref={(el) => { if (el) stepRefs.current.set(ev.index, el); else stepRefs.current.delete(ev.index); }}
                        className="relative pl-7"
                      >
                        {i < visibleEvents.length - 1 && (
                          <span
                            aria-hidden
                            className="absolute left-[9px] top-6 h-full w-px"
                            style={{ backgroundColor: visited ? meta.color : 'var(--border-base)', opacity: visited ? 0.4 : 1 }}
                          />
                        )}
                        <span
                          aria-hidden
                          className="absolute left-0 top-2 flex h-[18px] w-[18px] items-center justify-center rounded-full"
                          style={{
                            backgroundColor: active ? meta.color : 'var(--bg-panel)',
                            border: `1.5px solid ${active ? meta.color : visited ? `color-mix(in srgb, ${meta.color} 50%, transparent)` : 'var(--border-base)'}`,
                          }}
                        >
                          <Icon size={11} style={{ color: active ? 'var(--bg-panel)' : meta.color }} />
                        </span>
                        <button
                          type="button"
                          disabled={!clickable}
                          onClick={() => clickable && setSelectedStep(active ? null : ev.index)}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] disabled:cursor-default"
                          style={{
                            backgroundColor: active ? 'var(--bg-active)' : 'transparent',
                            opacity: !visited && selectedStep !== null ? 0.5 : 1,
                          }}
                          onMouseEnter={(e) => { if (!active && clickable) e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; }}
                          onMouseLeave={(e) => { if (!active) e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                          <span className="w-14 flex-shrink-0 text-xs tabular-nums" style={{ color: 'var(--text-dimmed)' }}>{timeOf(ev.at)}</span>
                          <span
                            className="flex-shrink-0 rounded px-1.5 py-0.5 text-xs font-medium"
                            style={{ backgroundColor: `color-mix(in srgb, ${meta.color} 12%, transparent)`, color: meta.color }}
                          >
                            {meta.label}
                          </span>
                          <span className="truncate text-xs" style={{ color: 'var(--text-primary)' }}>{ev.label}</span>
                          {clickable && <ChevronRight size={13} className="ml-auto flex-shrink-0" style={{ color: active ? 'var(--accent-primary)' : 'var(--text-dimmed)' }} />}
                        </button>
                      </li>
                    );
                  })}
                </ol>

                {/* Time-travel scrubber */}
                <div className="flex flex-shrink-0 items-center gap-3 border-t px-4 py-2.5" style={{ borderColor: 'var(--border-base)' }}>
                  <div className="flex items-center gap-1">
                    <ScrubBtn label="Première étape" icon={SkipBack} disabled={cursor <= 0} onClick={() => gotoCursor(0)} />
                    <ScrubBtn label="Étape précédente" icon={ChevronLeft} disabled={cursor <= 0} onClick={() => gotoCursor(cursor - 1)} />
                    <ScrubBtn label="Étape suivante" icon={ChevronRight} disabled={cursor >= visibleEvents.length - 1} onClick={() => gotoCursor(cursor + 1)} />
                    <ScrubBtn label="Dernière étape" icon={SkipForward} disabled={cursor >= visibleEvents.length - 1} onClick={() => gotoCursor(visibleEvents.length - 1)} />
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, visibleEvents.length - 1)}
                    value={cursor < 0 ? 0 : cursor}
                    onChange={(e) => gotoCursor(Number(e.target.value))}
                    aria-label="Scrubber de time-travel"
                    className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full"
                    style={{ accentColor: 'var(--accent-primary)', backgroundColor: 'var(--bg-input)' }}
                  />
                  <span className="flex-shrink-0 text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
                    {Math.min(cursor + 1, visibleEvents.length)} / {visibleEvents.length}
                  </span>
                </div>
              </>
            ) : timeline && events.length > 0 && visibleEvents.length === 0 ? (
              <p className="p-4 text-xs" style={{ color: 'var(--text-muted)' }}>Aucune étape ne correspond au filtre actif.</p>
            ) : (
              <p className="p-4 text-xs" style={{ color: 'var(--text-muted)' }}>Sélectionnez une mission pour afficher sa timeline.</p>
            )}
          </section>

          {/* Right — step detail */}
          <aside className="w-80 flex-shrink-0 overflow-y-auto rounded-lg border p-4 shadow-sm" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }} aria-label="Détail de l'étape">
            {selectedEvent ? (
              <StepDetail
                event={selectedEvent}
                reduceMotion={!!reduceMotion}
                position={cursor + 1}
                total={visibleEvents.length}
                onPrev={cursor > 0 ? () => gotoCursor(cursor - 1) : undefined}
                onNext={cursor < visibleEvents.length - 1 ? () => gotoCursor(cursor + 1) : undefined}
                onClose={() => setSelectedStep(null)}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--accent-subtle)' }}>
                  <Zap size={18} style={{ color: 'var(--accent-secondary)' }} />
                </span>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {hasTimeline
                    ? 'Clique une étape ou utilise le scrubber pour « revenir » à cet instant : décision, outil, arguments, résultat et raisonnement.'
                    : 'Les détails d\'étape apparaîtront ici.'}
                </p>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

// ─── Small presentational helpers ───────────────────────────────────────────

function Stat({ icon: Icon, label, value, tone }: {
  icon: React.FC<{ size?: number; style?: React.CSSProperties }>;
  label: string;
  value: string | number;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-md px-2 py-1" style={{ backgroundColor: 'var(--bg-input)' }}>
      <Icon size={12} style={{ color: tone }} />
      <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{value}</span>
      <span className="text-xs" style={{ color: 'var(--text-dimmed)' }}>{label}</span>
    </div>
  );
}

function ScrubBtn({ label, icon: Icon, disabled, onClick }: {
  label: string;
  icon: React.FC<{ size?: number; style?: React.CSSProperties }>;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] disabled:opacity-30"
      style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border-base)' }}
    >
      <Icon size={14} />
    </button>
  );
}

// ─── Mission picker item + contextual controls ──────────────────────────────

function ControlButton({ title, icon: Icon, tone, disabled, onClick }: {
  title: string;
  icon: React.FC<{ size?: number; style?: React.CSSProperties }>;
  tone: 'neutral' | 'danger';
  disabled: boolean;
  onClick: () => void;
}) {
  const color = tone === 'danger' ? 'var(--color-error)' : 'var(--accent-secondary)';
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] disabled:opacity-40"
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 22%, transparent)` }}
    >
      <Icon size={12} />
    </button>
  );
}

function MissionPickerItem({ mission, active, busy, onSelect, onAction }: {
  mission: MissionListItem;
  active: boolean;
  busy: boolean;
  onSelect: () => void;
  onAction: (
    id: string,
    op: 'pause' | 'resume' | 'cancel' | 'delete',
    optimistic: (m: MissionListItem) => MissionListItem | null,
  ) => void;
}) {
  const terminal = TERMINAL_STATUSES.has(mission.status);
  const statusLabel = mission.paused && !terminal ? 'en pause' : mission.status;
  const tone = statusTone(mission.status, mission.paused);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
      className="cursor-pointer rounded-md px-2.5 py-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
      style={{
        backgroundColor: active ? 'var(--bg-active)' : 'var(--bg-panel)',
        border: `1px solid ${active ? 'var(--accent-primary)' : 'var(--border-base)'}`,
        color: 'var(--text-primary)',
        boxShadow: active ? `inset 2px 0 0 var(--accent-primary)` : undefined,
      }}
    >
      <span className="block truncate font-medium">{mission.title}</span>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span
          className="flex items-center gap-1 truncate rounded-full px-1.5 py-0.5 text-xs capitalize"
          style={{ backgroundColor: `color-mix(in srgb, ${tone} 14%, transparent)`, color: tone }}
        >
          {busy ? (
            <Loader2 size={10} className="animate-spin" />
          ) : (
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tone }} aria-hidden />
          )}
          {statusLabel}
        </span>
        <div className="flex flex-shrink-0 items-center gap-1">
          {terminal ? (
            <ControlButton
              title="Supprimer la mission"
              icon={Trash2}
              tone="danger"
              disabled={busy}
              onClick={() => onAction(mission.id, 'delete', () => null)}
            />
          ) : (
            <>
              {mission.paused ? (
                <ControlButton
                  title="Reprendre"
                  icon={Play}
                  tone="neutral"
                  disabled={busy}
                  onClick={() => onAction(mission.id, 'resume', (m) => ({ ...m, paused: false }))}
                />
              ) : (
                <ControlButton
                  title="Mettre en pause"
                  icon={Pause}
                  tone="neutral"
                  disabled={busy}
                  onClick={() => onAction(mission.id, 'pause', (m) => ({ ...m, paused: true }))}
                />
              )}
              <ControlButton
                title="Annuler la mission"
                icon={XCircle}
                tone="danger"
                disabled={busy}
                onClick={() => onAction(mission.id, 'cancel', (m) => ({ ...m, status: 'cancelled', paused: false }))}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Step detail panel ──────────────────────────────────────────────────────

/** Copy-to-clipboard button with transient confirmation. */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { /* clipboard unavailable */ }
  }, [text]);
  return (
    <button
      type="button"
      onClick={copy}
      title="Copier"
      aria-label="Copier dans le presse-papiers"
      className="rounded p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
      style={{ color: copied ? 'var(--color-success)' : 'var(--text-dimmed)' }}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

function StepDetail({ event, reduceMotion, position, total, onPrev, onNext, onClose }: {
  event: TimelineEvent;
  reduceMotion: boolean;
  position: number;
  total: number;
  onPrev?: () => void;
  onNext?: () => void;
  onClose: () => void;
}) {
  const s = event.snapshot ?? {};
  const meta = EVENT_META[event.type] ?? EVENT_META.action;

  const Row = ({ label, children, copyText }: { label: string; children: React.ReactNode; copyText?: string }) => (
    <div className="mb-2.5">
      <div className="mb-0.5 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-dimmed)' }}>{label}</p>
        {copyText && <CopyButton text={copyText} />}
      </div>
      <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{children}</div>
    </div>
  );

  return (
    <motion.div
      key={event.index}
      initial={reduceMotion ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.15 }}
    >
      {/* Header with type badge + navigation */}
      <div className="mb-3 flex items-center gap-2">
        <span
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: `color-mix(in srgb, ${meta.color} 14%, transparent)` }}
        >
          <meta.icon size={14} style={{ color: meta.color }} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold" style={{ color: meta.color }}>{meta.label}</p>
          <p className="text-xs tabular-nums" style={{ color: 'var(--text-dimmed)' }}>Étape {position} / {total}{event.at ? ` · ${timeOf(event.at)}` : ''}</p>
        </div>
        <button type="button" onClick={onClose} title="Fermer" aria-label="Fermer le détail" className="rounded p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]" style={{ color: 'var(--text-dimmed)' }}>
          <X size={14} />
        </button>
      </div>

      <h2 className="mb-3 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{event.label}</h2>

      {s.skillName && <Row label="Outil"><code>{s.skillName}</code>{s.status ? <span className="ml-1" style={{ color: 'var(--text-muted)' }}>({s.status})</span> : null}</Row>}

      {typeof s.confidence === 'number' && (
        <Row label="Confiance">
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-input)' }}>
              <div className="h-full rounded-full" style={{ width: `${Math.round(s.confidence * 100)}%`, backgroundColor: 'var(--accent-primary)' }} />
            </div>
            <span className="tabular-nums" style={{ color: 'var(--text-primary)' }}>{Math.round(s.confidence * 100)}%</span>
          </div>
        </Row>
      )}

      {s.decision && <Row label="Décision">{s.decision}</Row>}
      {s.rationale && <Row label="Justification">{s.rationale}</Row>}
      {s.reasoning && <Row label="Raisonnement">{s.reasoning}</Row>}
      {s.observation && <Row label="Observation">{s.observation}</Row>}
      {s.failure && <Row label="Échec"><span style={{ color: 'var(--color-error)' }}>{s.failure}</span></Row>}
      {s.success && <Row label="Succès"><span style={{ color: 'var(--color-success)' }}>{s.success}</span></Row>}

      {s.args && Object.keys(s.args).length > 0 && (
        <Row label="Arguments" copyText={JSON.stringify(s.args, null, 2)}>
          <pre className="overflow-x-auto rounded-md p-2 text-xs" style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-secondary)' }}>
            {JSON.stringify(s.args, null, 2)}
          </pre>
        </Row>
      )}

      {s.result !== undefined && s.result !== null && (
        <Row label="Résultat" copyText={typeof s.result === 'string' ? s.result : JSON.stringify(s.result, null, 2)}>
          <pre className="max-h-40 overflow-auto rounded-md p-2 text-xs" style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-secondary)' }}>
            {typeof s.result === 'string' ? s.result : JSON.stringify(s.result, null, 2)}
          </pre>
        </Row>
      )}

      {/* Prev / next step navigation */}
      <div className="mt-4 flex items-center gap-2 border-t pt-3" style={{ borderColor: 'var(--border-base)' }}>
        <button
          type="button"
          onClick={onPrev}
          disabled={!onPrev}
          className="flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] disabled:opacity-30"
          style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border-base)' }}
        >
          <ChevronLeft size={13} /> Précédent
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!onNext}
          className="flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] disabled:opacity-30"
          style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border-base)' }}
        >
          Suivant <ChevronRight size={13} />
        </button>
      </div>
    </motion.div>
  );
}
