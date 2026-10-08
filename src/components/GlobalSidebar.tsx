/**
 * GlobalSidebar — Navigation globale moderne de Leanna (remplace la
 * UnifiedSidebar en contexte "global").
 *
 * Conforme à la vision task-ui.md : exposer des *capacités*, pas l'architecture
 * interne. Barre verticale repliable (icônes ↔ étiquettes), groupée par domaine :
 *
 *   Pilotage    : Mission Control · Missions (timeline) · Simulation
 *   Intelligence: Agent Swarm · Pourquoi ? (explainability) · Autonomie
 *   Travail     : IDE · Automatisations · Notebooks · Documents · GitHub
 *   Mémoire     : Mémoires · Historique · Listes
 *   Observabilité: Coûts & Tokens
 *   Pied        : Paramètres
 *
 * Entièrement token-stylée, accessible (clavier/focus/aria), reduced-motion,
 * et pilotée par react-router. L'état d'agent live est affiché en tête.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Milestone, FlaskConical, Network, HelpCircle, Gauge,
  Code2, Zap, NotebookPen, FileText, Github, BrainCircuit, History, ListChecks,
  BarChart2, Settings, PanelLeftClose, PanelLeftOpen,
  Power, MessageCircle, Mic, MicOff, Sparkles, Bot, ArrowLeft, LogOut,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext.js';
import { useAgentStatus } from '../hooks/useAgentStatus.js';
import { sidebarSections } from '../config/ideSidebarConfig.js';
import type { UnifiedSidebarProps } from './sidebar/types.js';

interface NavItem { id: string; path: string; label: string; icon: LucideIcon }
interface NavGroup { id: string; label: string; items: NavItem[] }

/** Tool item for IDE mode: toggles a panel rather than navigating. */
interface ToolItem {
  id: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}
interface ToolGroup { id: string; label: string; items: ToolItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'assistante', label: 'Assistante',
    items: [
      { id: 'chat', path: '/chat', label: 'Chat', icon: MessageCircle },
    ],
  },
  {
    id: 'pilotage', label: 'Pilotage',
    items: [
      { id: 'mission-control', path: '/mission-control', label: 'Mission Control', icon: LayoutDashboard },
      { id: 'mission-timeline', path: '/mission-timeline', label: 'Missions', icon: Milestone },
      { id: 'mission-simulation', path: '/mission-simulation', label: 'Simulation', icon: FlaskConical },
    ],
  },
  {
    id: 'intelligence', label: 'Intelligence',
    items: [
      { id: 'agent-swarm', path: '/agent-swarm', label: 'Agent Swarm', icon: Network },
      { id: 'explainability', path: '/explainability', label: 'Pourquoi ?', icon: HelpCircle },
      { id: 'autonomy', path: '/autonomy', label: 'Autonomie', icon: Gauge },
    ],
  },
  {
    id: 'travail', label: 'Travail',
    items: [
      { id: 'ide', path: '/ide', label: 'IDE', icon: Code2 },
      { id: 'automation', path: '/automation', label: 'Automatisations', icon: Zap },
      { id: 'notebooks', path: '/notebooks', label: 'Notebooks', icon: NotebookPen },
      { id: 'documents', path: '/documents', label: 'Documents', icon: FileText },
      { id: 'github', path: '/github', label: 'GitHub', icon: Github },
    ],
  },
  {
    id: 'memoire', label: 'Mémoire',
    items: [
      { id: 'memories', path: '/memories', label: 'Mémoires', icon: BrainCircuit },
      { id: 'history', path: '/history', label: 'Historique', icon: History },
      { id: 'lists', path: '/lists', label: 'Listes', icon: ListChecks },
    ],
  },
  {
    id: 'observabilite', label: 'Observabilité',
    items: [
      { id: 'observability', path: '/observability', label: 'Coûts & Tokens', icon: BarChart2 },
    ],
  },
];

const COLLAPSE_KEY = 'leanna_global_sidebar_collapsed';

/** Build IDE tool groups from the shared config, bound to the IDE props. */
function buildToolGroups(props: GlobalSidebarProps): ToolGroup[] {
  const p = props as unknown as Record<string, unknown>;
  const connected = Boolean(props.assistantConnected);
  const groups: ToolGroup[] = [];

  for (const section of sidebarSections) {
    const items: ToolItem[] = [];
    for (const config of section.items) {
      // Flatten submenus into their children; buttons map directly.
      const leaves = config.type === 'submenu' ? (config.children ?? []) : [config];
      for (const leaf of leaves) {
        if (!leaf.actionKey) continue;
        const onClick = p[leaf.actionKey] as (() => void) | undefined;
        if (typeof onClick !== 'function') continue;
        const active = leaf.stateKey ? Boolean(p[leaf.stateKey]) : false;
        const disabled = Boolean(leaf.requiresAssistant) && !connected;
        items.push({ id: leaf.id, label: leaf.label, icon: leaf.icon, active, disabled, onClick });
      }
    }
    if (items.length > 0) groups.push({ id: section.id, label: section.label ?? '', items });
  }
  return groups;
}

export type GlobalSidebarProps = { variant?: 'global' | 'ide' } & Partial<Omit<UnifiedSidebarProps, 'context'>>;

export function GlobalSidebar(props: GlobalSidebarProps = {}) {
  const mode: 'global' | 'ide' = props.variant === 'ide' ? 'ide' : 'global';
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const reduceMotion = useReducedMotion();
  const { theme } = useTheme();
  const agent = useAgentStatus();

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [collapsed]);

  const isActive = useCallback(
    (path: string) => (path === '/ide' ? pathname === '/' || pathname === '/ide' : pathname === path),
    [pathname],
  );

  const handleQuit = () => {
    window.close();
  };

  const toolGroups = mode === 'ide' ? buildToolGroups(props) : [];

  const width = collapsed ? 56 : 220;

  return (
    <nav
      aria-label="Navigation Leanna"
      className="flex h-full flex-shrink-0 flex-col border-r"
      style={{ width, borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-secondary)', transition: reduceMotion ? undefined : 'width 0.18s ease' }}
    >
      {/* Brand + collapse toggle */}
      <div className="flex items-center gap-2 px-3 py-3" style={{ height: 56 }}>
        <span
          aria-hidden
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-sm font-bold"
          style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-secondary)' }}
        >
          L
        </span>
        {!collapsed && (
          <span className="flex-1 truncate text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Leanna{mode === 'ide' ? ' · IDE' : ''}
          </span>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Déplier la navigation' : 'Replier la navigation'}
          className="rounded-md p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
          style={{ color: 'var(--text-dimmed)' }}
        >
          {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>
      </div>

      {/* Pastille d'état de l'agent — clic = retour à Mission Control.
          Sert aussi de bascule IDE → Mission Control (plus de bouton redondant). */}
      {mode === 'ide' && (
        <button
          type="button"
          onClick={() => navigate('/mission-control')}
          title="Ouvrir Mission Control"
          aria-label={`État de Leanna : ${agent.label}. Ouvrir Mission Control.`}
          className="mx-2 mb-2 flex items-center gap-2 rounded-md px-2 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
          style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)' }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-panel)'; }}
        >
          <span className="relative flex h-2 w-2 flex-shrink-0 items-center justify-center" aria-hidden>
            {agent.active && !reduceMotion && (
              <motion.span
                className="absolute inline-flex h-full w-full rounded-full"
                style={{ backgroundColor: agent.color }}
                animate={{ opacity: [0.6, 0, 0.6], scale: [1, 2.2, 1] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}
            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: agent.color }} />
          </span>
          {!collapsed && (
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{agent.label}</span>
              <span className="block truncate text-xs" style={{ color: 'var(--text-muted)' }}>{agent.reason}</span>
              {/* Barre de progression — affichée quand une mission expose un pourcentage. */}
              {typeof agent.progress === 'number' && (
                <span className="mt-1 block h-0.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'var(--border-base)' }} aria-hidden>
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${Math.round(Math.min(1, Math.max(0, agent.progress)) * 100)}%`,
                      backgroundColor: agent.color,
                      transition: reduceMotion ? undefined : 'width 0.3s ease',
                    }}
                  />
                </span>
              )}
            </span>
          )}
          <ArrowLeft size={13} className="flex-shrink-0" style={{ color: 'var(--text-dimmed)' }} aria-hidden />
        </button>
      )}

      {/* Assistant connect/mute block — parité IDE (mode="ide" uniquement) */}
      {mode === 'ide' && (
        <IdeAssistantBlock
          collapsed={collapsed}
          connected={Boolean(props.assistantConnected)}
          working={Boolean(props.assistantWorking)}
          muted={Boolean(props.assistantMuted)}
          sessionMode={props.mode === 'ask' ? 'ask' : 'full'}
          onConnect={props.onConnectAssistant}
          onDisconnect={props.onDisconnectAssistant}
          onToggleChat={props.onToggleChat}
          onMuteToggle={props.onMuteToggle}
          onToggleMode={props.onToggleMode}
        />
      )}

      {/* Grouped navigation (global routes) or tools (IDE) */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {mode === 'ide' ? (
          toolGroups.map((group) => (
            <div key={group.id} className="mb-1.5">
              {!collapsed && (
                <p className="px-4 pb-1.5 pt-3 text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>
                  {group.label}
                </p>
              )}
              <ul className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <NavButton
                      item={{ id: item.id, path: '', label: item.label, icon: item.icon }}
                      active={item.active}
                      disabled={item.disabled}
                      collapsed={collapsed}
                      onClick={item.onClick}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))
        ) : (
          NAV_GROUPS.map((group) => (
            <div key={group.id} className="mb-1.5">
              {!collapsed && (
                <p className="px-4 pb-1.5 pt-3 text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>
                  {group.label}
                </p>
              )}
              <ul className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <NavButton item={item} active={isActive(item.path)} collapsed={collapsed} onClick={() => navigate(item.path)} />
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>

      {/* Footer — settings */}
      <div className="border-t mt-auto px-3 py-3" style={{ borderColor: 'var(--border-base)' }}>
        <div className="flex items-center gap-1">
          <div className="flex-1">
            <NavButton
              item={{ id: 'settings', path: '/settings', label: 'Paramètres', icon: Settings }}
              active={pathname === '/settings'}
              collapsed={collapsed}
              onClick={() => navigate('/settings')}
            />
          </div>
          <button
            type="button"
            onClick={handleQuit}
            title={collapsed ? 'Quitter' : undefined}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <LogOut size={16} className="flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
            <span className="sr-only">Quitter</span>
          </button>
        </div>
      </div>

      {/* Theme marker (invisible, keeps theme reactive for tooling) */}
      <span data-theme-marker={theme} className="sr-only" aria-hidden />
    </nav>
  );
}

function IdeAssistantBlock({
  collapsed, connected, working, muted, sessionMode,
  onConnect, onDisconnect, onToggleChat, onMuteToggle, onToggleMode,
}: {
  collapsed: boolean;
  connected: boolean;
  working: boolean;
  muted: boolean;
  sessionMode: 'full' | 'ask';
  onConnect?: () => void;
  onDisconnect?: () => void;
  onToggleChat?: () => void;
  onMuteToggle?: () => void;
  onToggleMode?: () => void;
}) {
  const dotColor = !connected ? 'var(--text-dimmed)' : working ? 'var(--accent-primary)' : muted ? 'var(--color-warning)' : 'var(--color-success)';

  // Petit bouton d'action réutilisable pour la rangée de contrôles.
  const Ctrl = ({ icon: Icon, label, onClick, active, tone }: { icon: LucideIcon; label: string; onClick?: () => void; active?: boolean; tone?: string }) => (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-7 flex-1 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
      style={{ backgroundColor: active ? 'var(--bg-active)' : 'var(--bg-input)', color: tone ?? 'var(--text-secondary)', border: '1px solid var(--border-base)' }}
    >
      <Icon size={13} />
    </button>
  );

  if (!connected) {
    // Un seul CTA : connecter l'assistant.
    return (
      <div className="mx-2 mb-2">
        <button
          type="button"
          onClick={onConnect}
          title="Connecter l'assistant IA"
          aria-label="Connecter l'assistant IA"
          className="flex w-full items-center justify-center gap-2 rounded-md px-2 py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
          style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-secondary)', border: '1px solid var(--border-base)' }}
        >
          <Bot size={14} />
          {!collapsed && <span>Connecter l'IA</span>}
        </button>
      </div>
    );
  }

  if (collapsed) {
    // Replié : état (clic = chat) + micro.
    return (
      <div className="mx-2 mb-2 flex flex-col gap-1">
        <Ctrl icon={MessageCircle} label="Chat IA" onClick={onToggleChat} active={working} tone="var(--accent-primary)" />
        <Ctrl icon={muted ? MicOff : Mic} label={muted ? 'Réactiver le micro' : 'Couper le micro'} onClick={onMuteToggle} tone={muted ? 'var(--color-warning)' : undefined} />
      </div>
    );
  }

  return (
    <div className="mx-2 mb-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-base)] shadow-sm overflow-hidden">
      <div className="px-3 py-2 flex items-center justify-between border-b border-[var(--border-base)] bg-[var(--bg-panel)]/50">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2 items-center justify-center">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: dotColor }} />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ backgroundColor: dotColor }} />
          </span>
          <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--text-primary)' }}>
            {working ? 'En cours' : muted ? 'En pause' : 'Connecté'}
          </span>
        </div>
        <button
          type="button"
          onClick={onToggleMode}
          title={sessionMode === 'full' ? 'Mode : Complet' : 'Mode : Question'}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
          style={{ color: 'var(--text-dimmed)', border: '1px solid var(--border-base)' }}
        >
          {sessionMode === 'full' ? 'Full' : 'Ask'}
        </button>
      </div>
      <div className="p-2 grid grid-cols-4 gap-1">
        <Ctrl icon={MessageCircle} label="Chat IA" onClick={onToggleChat} active={working} tone="var(--accent-primary)" />
        <Ctrl icon={muted ? MicOff : Mic} label={muted ? 'Réactiver le micro' : 'Couper le micro'} onClick={onMuteToggle} tone={muted ? 'var(--color-warning)' : undefined} />
        <Ctrl icon={Sparkles} label={sessionMode === 'full' ? 'Mode Complet' : 'Mode Question'} onClick={onToggleMode} />
        <Ctrl icon={Power} label="Déconnecter l'assistant" onClick={onDisconnect} tone="var(--color-error)" />
      </div>
    </div>
  );

}

function NavButton({ item, active, collapsed, onClick, disabled = false }: { item: NavItem; active: boolean; collapsed: boolean; onClick: () => void; disabled?: boolean }) {
  const Icon = item.icon;
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-current={active ? 'page' : undefined}
        title={collapsed ? item.label : disabled ? `${item.label} (nécessite l'assistant connecté)` : undefined}
        className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] disabled:cursor-not-allowed disabled:opacity-40"
        style={{
          backgroundColor: active ? 'var(--bg-active)' : 'transparent',
          color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        }}
        onMouseEnter={(e) => { if (!active && !disabled) e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; }}
        onMouseLeave={(e) => { if (!active) e.currentTarget.style.backgroundColor = 'transparent'; }}
      >
        {active && (
          <span aria-hidden className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r" style={{ backgroundColor: 'var(--accent-primary)' }} />
        )}
        <Icon size={16} className="flex-shrink-0" style={{ color: active ? 'var(--accent-primary)' : 'var(--text-muted)' }} />
        {!collapsed && <span className="truncate text-sm font-medium">{item.label}</span>}
      </button>
      {collapsed && (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100"
          style={{ backgroundColor: 'var(--bg-panel)', color: 'var(--text-primary)', border: '1px solid var(--border-base)' }}
        >
          {item.label}
        </span>
      )}
    </div>
  );
}
