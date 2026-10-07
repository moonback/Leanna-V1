import { motion, useReducedMotion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import {
  Brain, Cog, ShieldCheck, Gauge, CircleDot, AlertTriangle, Clock, CheckCircle2,
} from 'lucide-react';
import { useAgentStatus, type AgentState } from '../hooks/useAgentStatus.js';

/**
 * AgentStatusBar — persistent global strip (task-ui.md §4). Shows WHAT Leanna is
 * doing and WHY, across every screen. Read-only; derives from useAgentStatus.
 * Hidden only when truly idle + disconnected, to avoid clutter.
 */

const STATE_ICON: Record<AgentState, React.FC<{ size?: number; style?: React.CSSProperties; className?: string }>> = {
  idle: CircleDot,
  thinking: Brain,
  planning: Gauge,
  executing: Cog,
  verifying: ShieldCheck,
  blocked: AlertTriangle,
  waiting: Clock,
  completed: CheckCircle2,
};

export function AgentStatusBar() {
  const reduceMotion = useReducedMotion();
  const status = useAgentStatus();
  const navigate = useNavigate();

  // Keep it quiet when there is nothing to say.
  if (!status.active && !status.connected) return null;

  const Icon = STATE_ICON[status.state];
  const spin = status.state === 'executing' && !reduceMotion;

  return (
    <button
      type="button"
      onClick={() => navigate('/mission-control')}
      aria-label={`État de Leanna : ${status.label}. ${status.reason}. Ouvrir Mission Control.`}
      className="group flex w-full items-center gap-2.5 border-b px-4 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] lg:px-6"
      style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-base)' }}
    >
      {/* Pulsing status dot */}
      <span className="relative flex h-2.5 w-2.5 flex-shrink-0 items-center justify-center" aria-hidden>
        {status.active && !reduceMotion && (
          <motion.span
            className="absolute inline-flex h-full w-full rounded-full"
            style={{ backgroundColor: status.color }}
            animate={{ opacity: [0.6, 0, 0.6], scale: [1, 2.2, 1] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: status.color }} />
      </span>

      {/* State icon + label */}
      <span className="flex flex-shrink-0 items-center gap-1.5">
        <Icon size={13} style={{ color: status.color }} className={spin ? 'animate-spin' : undefined} />
        <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{status.label}</span>
      </span>

      {/* Reason — the "pourquoi" */}
      <span className="min-w-0 flex-1 truncate text-xs" style={{ color: 'var(--text-muted)' }}>
        {status.reason}
      </span>

      {/* Optional step progress */}
      {typeof status.progress === 'number' && (
        <span className="flex flex-shrink-0 items-center gap-1.5">
          <span className="hidden h-1 w-20 overflow-hidden rounded-full sm:block" style={{ backgroundColor: 'var(--bg-input)' }}>
            <span className="block h-full rounded-full" style={{ width: `${Math.round(status.progress * 100)}%`, backgroundColor: status.color }} />
          </span>
          <span className="text-xs tabular-nums" style={{ color: 'var(--text-dimmed)' }}>{Math.round(status.progress * 100)}%</span>
        </span>
      )}

      {!status.connected && (
        <span className="flex-shrink-0 text-xs" style={{ color: 'var(--text-dimmed)' }}>hors ligne</span>
      )}
    </button>
  );
}
