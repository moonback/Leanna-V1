import { useEffect, useMemo, useRef, useState } from 'react';
import { useSyncExternalStore } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronDown, Loader2, CheckCircle2, AlertCircle,
  Lightbulb, Pencil, ShieldCheck, Bot, Target,
} from 'lucide-react';
import type { ActivityStep, ReasoningState } from '../../hooks/useActivity.js';
import { getAgentTasks, subscribe } from '../../stores/agentActivityStore.js';

// ═══════════════════════════════════════════════════════════════════════════════
// UnifiedTimeline — timeline « en cours » unique dans le chat.
//
// Remplace le patchwork AgentProgressBar / AgentActivityOverlay /
// MultiAgentIndicator / ActivityFeed par UNE surface de rendu. Les étapes d'outils
// (source: activity de useLiveAPI) sont regroupées en trois phases repliables —
// Planification → Écriture → Vérification — et les agents actifs proviennent de
// agentActivityStore (source unique côté agents). Objectif : une seule source de
// vérité visuelle, moins de bruit.
// ═══════════════════════════════════════════════════════════════════════════════

type Phase = 'planning' | 'writing' | 'verification';

const PHASE_META: Record<Phase, { label: string; icon: typeof Lightbulb; color: string }> = {
  planning:     { label: 'Planification', icon: Lightbulb,   color: 'var(--color-warning)' },
  writing:      { label: 'Écriture',      icon: Pencil,      color: 'var(--accent-primary)' },
  verification: { label: 'Vérification',  icon: ShieldCheck, color: 'var(--color-success)' },
};

const PHASE_ORDER: Phase[] = ['planning', 'writing', 'verification'];

/** Classe un outil dans l'une des trois phases de la timeline. */
function toolToPhase(tool: string): Phase {
  if (/reason|think|plan|search|find|grep|list|analyze|memory|knowledge|get_workspace|read_file_outline/.test(tool)) {
    return 'planning';
  }
  if (/write|modify|patch|create|delete|rename|git_|commit|push|stage/.test(tool)) {
    return 'writing';
  }
  if (/test|verify|validate|read_project_file|open_project_file|lint|check/.test(tool)) {
    return 'verification';
  }
  // Par défaut : écriture (action) si non classé.
  return 'writing';
}

interface UnifiedTimelineProps {
  steps: ActivityStep[];
  reasoning?: ReasoningState;
  connected: boolean;
}

export function UnifiedTimeline({ steps, reasoning, connected }: UnifiedTimelineProps) {
  const agentTasks = useSyncExternalStore(subscribe, getAgentTasks, getAgentTasks);
  // Réduit par défaut : l'en-tête résume l'état (en cours / terminé + nb
  // d'agents). L'utilisateur déplie s'il veut le détail des phases.
  const [collapsed, setCollapsed] = useState(true);

  const activeAgents = useMemo(
    () => agentTasks.filter(t => t.status === 'running' || t.status === 'pending'),
    [agentTasks],
  );

  const phases = useMemo(() => {
    const grouped: Record<Phase, ActivityStep[]> = { planning: [], writing: [], verification: [] };
    for (const step of steps) grouped[toolToPhase(step.tool)].push(step);
    return grouped;
  }, [steps]);

  const runningCount = steps.filter(s => s.status === 'running').length;
  const doneCount = steps.filter(s => s.status === 'done').length;
  const isWorking = runningCount > 0 || reasoning?.active || activeAgents.length > 0;

  // Rien à montrer : pas connecté, ou aucune activité/agent.
  if (!connected) return null;
  if (steps.length === 0 && activeAgents.length === 0 && !reasoning?.active) return null;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ backgroundColor: 'color-mix(in srgb, var(--bg-secondary) 55%, transparent)', border: '1px solid var(--border-base)' }}
    >
      {/* En-tête repliable */}
      <button
        type="button"
        onClick={() => setCollapsed(v => !v)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-[var(--bg-hover)] transition"
        aria-expanded={!collapsed}
      >
        {isWorking ? (
          <Loader2 size={12} className="animate-spin flex-shrink-0" style={{ color: 'var(--accent-primary)' }} />
        ) : (
          <CheckCircle2 size={12} className="flex-shrink-0" style={{ color: 'var(--color-success)' }} />
        )}
        <span className="text-sm font-semibold flex-1" style={{ color: 'var(--text-secondary)' }}>
          {isWorking
            ? (runningCount > 0 ? `${runningCount} action${runningCount > 1 ? 's' : ''} en cours` : 'En cours…')
            : `${doneCount} action${doneCount > 1 ? 's' : ''} terminée${doneCount > 1 ? 's' : ''}`}
        </span>
        {activeAgents.length > 0 && (
          <span className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--color-accent-alt)' }}>
            <Bot size={11} /> {activeAgents.length}
          </span>
        )}
        <ChevronDown
          size={12}
          className={`transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}
          style={{ color: 'var(--text-dimmed)' }}
        />
      </button>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-2 pb-2 space-y-2">
              {/* Agents actifs (source unique : agentActivityStore) */}
              {activeAgents.length > 0 && (
                <div className="space-y-1 pt-1">
                  {activeAgents.map(agent => (
                    <div key={agent.id} className="flex items-center gap-2 px-2 py-1">
                      <Loader2 size={10} className="animate-spin flex-shrink-0" style={{ color: 'var(--color-accent-alt)' }} />
                      <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {agent.agentName}
                      </span>
                      <span className="text-xs truncate" style={{ color: 'var(--text-dimmed)' }}>
                        {agent.title}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Raisonnement en cours */}
              {reasoning?.active && (
                <div className="flex items-center gap-2 px-2 py-1">
                  <Target size={10} className="flex-shrink-0" style={{ color: 'var(--color-warning)' }} />
                  <span className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>
                    {reasoning.announcement ?? reasoning.strategyLabel ?? 'Analyse en cours…'}
                  </span>
                </div>
              )}

              {/* Phases : Planification → Écriture → Vérification */}
              {PHASE_ORDER.map(phase => {
                const phaseSteps = phases[phase];
                if (phaseSteps.length === 0) return null;
                return <PhaseGroup key={phase} phase={phase} steps={phaseSteps} />;
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Groupe de phase repliable ─────────────────────────────────────────────

function PhaseGroup({ phase, steps }: { phase: Phase; steps: ActivityStep[] }) {
  const meta = PHASE_META[phase];
  const Icon = meta.icon;
  const running = steps.some(s => s.status === 'running');
  const errored = steps.some(s => s.status === 'error');
  // Réduit par défaut, SAUF si la phase a une action en cours ou une erreur :
  // on ne cache jamais le travail en direct ni un échec à l'utilisateur.
  const [open, setOpen] = useState(running || errored);
  // Suit automatiquement l'activité (ouvre quand ça travaille/échoue, referme
  // quand c'est fini) TANT QUE l'utilisateur n'a pas cliqué manuellement.
  const userToggled = useRef(false);
  useEffect(() => {
    if (!userToggled.current) setOpen(running || errored);
  }, [running, errored]);

  return (
    <div className="rounded-lg overflow-hidden" style={{ backgroundColor: 'var(--bg-input)' }}>
      <button
        type="button"
        onClick={() => { userToggled.current = true; setOpen(v => !v); }}
        className="flex items-center gap-2 w-full px-2 py-1.5 text-left hover:bg-[var(--bg-hover)] transition"
        aria-expanded={open}
      >
        <Icon size={12} className="flex-shrink-0" style={{ color: meta.color }} />
        <span className="text-sm font-medium flex-1" style={{ color: 'var(--text-secondary)' }}>
          {meta.label}
        </span>
        {running ? (
          <Loader2 size={10} className="animate-spin" style={{ color: meta.color }} />
        ) : errored ? (
          <AlertCircle size={10} style={{ color: 'var(--color-error)' }} />
        ) : (
          <CheckCircle2 size={10} style={{ color: 'var(--color-success)' }} />
        )}
        <span className="text-xs font-mono tabular-nums" style={{ color: 'var(--text-dimmed)' }}>
          {steps.filter(s => s.status === 'done').length}/{steps.length}
        </span>
        <ChevronDown
          size={10}
          className={`transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
          style={{ color: 'var(--text-dimmed)' }}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="overflow-hidden"
          >
            <div className="px-2 pb-1.5 space-y-0.5">
              {steps.slice(-12).map(step => {
                const isRun = step.status === 'running';
                const isErr = step.status === 'error';
                return (
                  <div key={step.id} className="flex items-center gap-2 px-1 py-0.5">
                    {isRun ? (
                      <Loader2 size={9} className="animate-spin flex-shrink-0" style={{ color: meta.color }} />
                    ) : isErr ? (
                      <AlertCircle size={9} className="flex-shrink-0" style={{ color: 'var(--color-error)' }} />
                    ) : (
                      <CheckCircle2 size={9} className="flex-shrink-0" style={{ color: 'var(--color-success)' }} />
                    )}
                    <span
                      className="text-sm truncate"
                      style={{ color: isRun ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: isRun ? 500 : 400 }}
                    >
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
