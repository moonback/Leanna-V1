import {
  FlagTriangleRight, Search, Wrench, AlertTriangle, RotateCcw,
  CheckCircle2, CircleDot, Target, ShieldAlert,
} from 'lucide-react';

// ─── Types mirrored from the MissionTimeTravel engine ────────────────────────

export type TimelineEventType =
  | 'plan' | 'goal_start' | 'analyze' | 'action' | 'reflect'
  | 'failure' | 'replan' | 'escalate' | 'goal_complete' | 'success' | 'end';

export interface StepSnapshot {
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

export interface TimelineEvent {
  index: number;
  type: TimelineEventType;
  at?: string;
  label: string;
  goalTitle?: string;
  snapshot?: StepSnapshot;
}

export interface MissionTimeline {
  missionId: string;
  title: string;
  status: string;
  events: TimelineEvent[];
}

export interface MissionListItem {
  id: string;
  title: string;
  status: string;
  /** Pause suivie côté Executor (le statut reste "in_progress" pendant une pause). */
  paused?: boolean;
}

/** Statuts terminaux : plus d'action de pilotage, seule la suppression reste. */
export const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

type IconComp = React.FC<{ size?: number; style?: React.CSSProperties }>;

export const EVENT_META: Record<TimelineEventType, { icon: IconComp; color: string; label: string }> = {
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
export function statusTone(status: string, paused?: boolean): string {
  if (paused) return 'var(--color-warning)';
  switch (status) {
    case 'completed': return 'var(--color-success)';
    case 'failed': return 'var(--color-error)';
    case 'cancelled': return 'var(--text-muted)';
    case 'in_progress': return 'var(--accent-primary)';
    default: return 'var(--color-info)';
  }
}

export function timeOf(at?: string): string {
  if (!at) return '';
  try { return new Date(at).toISOString().slice(11, 19); } catch { return ''; }
}

/** Durée lisible entre deux timestamps ISO. */
export function humanDuration(startAt?: string, endAt?: string): string {
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
