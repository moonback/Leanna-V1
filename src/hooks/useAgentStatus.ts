import { useEffect, useState } from 'react';
import { useAutonomyTimeline } from './useAutonomyTimeline.js';

/**
 * useAgentStatus — derives a single, human-readable agent state for the global
 * status bar (task-ui.md §4 "barre d'état permanente de l'agent").
 *
 * It fuses two live sources already wired in the app:
 *   - the autonomy WebSocket (`useAutonomyTimeline`): runtime status + health,
 *   - mission events (`window 'Leanna-mission-event'`): the richer "what is it
 *     doing right now" signal (plan/analyze/action/test/failure/complete).
 *
 * Mission events win when a mission is actively running, because they carry the
 * concrete "pourquoi" (reason) the user wants to see; otherwise we fall back to
 * the autonomy runtime status. Purely observational — no commands are sent.
 */

export type AgentState =
  | 'idle'
  | 'thinking'
  | 'planning'
  | 'executing'
  | 'verifying'
  | 'blocked'
  | 'waiting'
  | 'completed';

export interface AgentStatus {
  state: AgentState;
  /** Short label for the dot/badge. */
  label: string;
  /** Why Leanna is in this state (concrete, one line). */
  reason: string;
  /** Semantic CSS token for the state color. */
  color: string;
  /** Optional step progress 0..1 when a mission exposes it. */
  progress?: number;
  /** True while anything meaningful is happening (bar should be prominent). */
  active: boolean;
  /** Live connection to the autonomy channel. */
  connected: boolean;
}

const STATE_META: Record<AgentState, { label: string; color: string }> = {
  idle:      { label: 'Au repos',    color: 'var(--color-success)' },
  thinking:  { label: 'Réflexion',   color: 'var(--color-info)' },
  planning:  { label: 'Planification', color: 'var(--accent-primary)' },
  executing: { label: 'Exécution',   color: 'var(--accent-secondary)' },
  verifying: { label: 'Vérification', color: 'var(--color-info)' },
  blocked:   { label: 'Bloqué',      color: 'var(--color-error)' },
  waiting:   { label: 'En attente',  color: 'var(--color-warning)' },
  completed: { label: 'Terminé',     color: 'var(--color-success)' },
};

/** Map an autonomy runtime status string to an AgentState. */
function fromAutonomy(status: string | undefined, health: string | undefined): AgentState {
  if (health === 'degraded') return 'blocked';
  switch (status) {
    case 'executing': return 'executing';
    case 'watching': return 'thinking';
    case 'idle': return 'idle';
    case 'sleeping': return 'idle';
    case 'error': return 'blocked';
    case 'stopping': return 'waiting';
    default: return 'idle';
  }
}

interface MissionSignal {
  state: AgentState;
  reason: string;
  progress?: number;
  /** Terminal missions stop winning over autonomy after a short grace period. */
  terminal: boolean;
  at: number;
}

/** Map a mission event name + data to a state + reason. */
function fromMissionEvent(event: string, data: Record<string, unknown>): MissionSignal | null {
  const title = typeof data.title === 'string' ? data.title : '';
  const progress = typeof data.progress === 'number' ? data.progress : undefined;
  const now = Date.now();
  const base = (state: AgentState, reason: string, terminal = false): MissionSignal => ({ state, reason, progress, terminal, at: now });

  switch (event) {
    case 'mission_started':
    case 'mission_plan':
      return base('planning', title ? `Planification : ${title}` : 'Planification de la mission');
    case 'mission_dryrun':
      return base('planning', title ? `Simulation : ${title}` : 'Simulation (dry-run)');
    case 'goal_started':
    case 'action_planned':
      return base('thinking', title ? `Analyse : ${title}` : 'Analyse en cours');
    case 'action_started':
    case 'action_completed': {
      const skill = typeof data.skill === 'string' ? data.skill : typeof data.action === 'string' ? data.action : '';
      const verify = /test|typecheck|lint|verify/i.test(skill);
      return base(verify ? 'verifying' : 'executing', skill ? `${verify ? 'Vérification' : 'Exécution'} : ${skill}` : 'Exécution en cours');
    }
    case 'approval_required':
      return base('waiting', 'En attente de votre approbation');
    case 'mission_failed':
    case 'action_denied':
      return base('blocked', title ? `Échec : ${title}` : 'Mission bloquée', true);
    case 'mission_completed':
      return base('completed', title ? `Terminé : ${title}` : 'Mission terminée', true);
    default:
      return null;
  }
}

/** How long a terminal mission signal stays shown before falling back. */
const TERMINAL_GRACE_MS = 6000;

export function useAgentStatus(): AgentStatus {
  const { state: autonomy, connection } = useAutonomyTimeline({ enabled: true });
  const [mission, setMission] = useState<MissionSignal | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { event?: string } & Record<string, unknown>;
      if (!detail?.event) return;
      const signal = fromMissionEvent(detail.event, detail);
      if (signal) setMission(signal);
    };
    window.addEventListener('Leanna-mission-event', handler);
    return () => window.removeEventListener('Leanna-mission-event', handler);
  }, []);

  // Expire a stale terminal mission signal so the bar returns to autonomy state.
  useEffect(() => {
    if (!mission?.terminal) return;
    const t = setTimeout(() => setMission(null), TERMINAL_GRACE_MS);
    return () => clearTimeout(t);
  }, [mission]);

  // A running (non-terminal) mission wins; a terminal one wins only briefly.
  const missionWins = mission && (!mission.terminal || Date.now() - mission.at < TERMINAL_GRACE_MS);

  let state: AgentState;
  let reason: string;
  let progress: number | undefined;

  if (missionWins && mission) {
    state = mission.state;
    reason = mission.reason;
    progress = mission.progress;
  } else {
    state = fromAutonomy(autonomy?.status, autonomy?.health);
    reason =
      autonomy?.health === 'degraded'
        ? (autonomy.recentFailures?.[0] ?? 'Le runtime signale une anomalie')
        : state === 'executing'
          ? `${autonomy?.activeTasks ?? 0} tâche(s) autonome(s) en cours`
          : state === 'thinking'
            ? "Observation de l'environnement"
            : 'Autonomie en veille';
  }

  const meta = STATE_META[state];
  const active = state !== 'idle';

  return {
    state,
    label: meta.label,
    reason,
    color: meta.color,
    progress,
    active,
    connected: connection === 'open',
  };
}
