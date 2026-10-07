import { useSyncExternalStore } from 'react';
import { Bot } from 'lucide-react';
import { motion } from 'motion/react';
import { getAgentTasks, subscribe } from '../../../stores/agentActivityStore.js';
import { SidebarItem } from './SidebarItem.js';

// ═══════════════════════════════════════════════════════════════════════════════
// AgentsSidebarButton — accès direct permanent aux Agents en tête de sidebar.
//
// La fonction phare (agents/missions/flotte) était auparavant enfouie dans le
// flyout du statut agent et le menu Outils de la barre de statut. On l'expose
// ici comme une icône de premier niveau, avec un badge d'activité branché sur
// agentActivityStore (nombre d'agents en cours d'exécution).
// ═══════════════════════════════════════════════════════════════════════════════

interface AgentsSidebarButtonProps {
  active: boolean;
  onClick: () => void;
}

export function AgentsSidebarButton({ active, onClick }: AgentsSidebarButtonProps) {
  const tasks = useSyncExternalStore(subscribe, getAgentTasks, getAgentTasks);
  const activeCount = tasks.filter(
    (t) => t.status === 'running' || t.status === 'pending',
  ).length;

  return (
    <div className="relative w-full">
      <SidebarItem
        icon={Bot}
        active={active}
        onClick={onClick}
        title={activeCount > 0 ? `Agents (${activeCount} en cours)` : 'Agents'}
        dot={activeCount > 0 ? 'var(--color-accent-alt)' : undefined}
      />
      {activeCount > 0 && (
        <motion.span
          key={activeCount}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 18 }}
          className="pointer-events-none absolute top-[3px] right-[4px] min-w-[15px] h-[15px] flex items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums leading-none"
          style={{
            backgroundColor: 'var(--color-accent-alt)',
            color: 'var(--bg-base)',
            boxShadow: '0 0 8px color-mix(in srgb, var(--color-accent-alt) 55%, transparent)',
          }}
        >
          {activeCount > 99 ? '99+' : activeCount}
        </motion.span>
      )}
    </div>
  );
}
