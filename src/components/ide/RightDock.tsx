import { useCallback, useEffect, useState } from 'react';
import { GripVertical } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// RightDock — zone droite unifiée et redimensionnable de l'IDE.
//
// Auparavant chaque panneau droit (recherche, MCP, agents, missions…) était un
// frère flex avec sa propre largeur fixe (260–340px) et pouvait s'empiler avec
// les autres. RightDock fournit UNE zone unique : un seul panneau y est monté à
// la fois (l'exclusivité est gérée en amont par openRightPanel), avec une largeur
// unique redimensionnable au drag et persistée dans localStorage.
// ═══════════════════════════════════════════════════════════════════════════════

const STORAGE_KEY = 'Leanna_right_dock_width';
const DEFAULT_WIDTH = 340;
const MIN_WIDTH = 260;
const MAX_WIDTH = 640;

interface RightDockProps {
  /** Le panneau à afficher (déjà sélectionné en amont). `null` = zone fermée. */
  children: React.ReactNode;
  /** Vrai si un panneau est actif (la zone doit être visible). */
  open: boolean;
}

export function RightDock({ children, open }: RightDockProps) {
  const [width, setWidth] = useState(() => {
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    if (saved && Number.isFinite(saved)) {
      return Math.min(Math.max(saved, MIN_WIDTH), MAX_WIDTH);
    }
    return DEFAULT_WIDTH;
  });
  const [resizing, setResizing] = useState(false);

  useEffect(() => {
    if (!resizing) localStorage.setItem(STORAGE_KEY, String(width));
  }, [width, resizing]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setResizing(true);
    const startX = e.clientX;
    const startWidth = width;

    const handleMove = (ev: MouseEvent) => {
      // Poignée à gauche du dock : glisser vers la gauche élargit.
      const delta = startX - ev.clientX;
      setWidth(Math.min(Math.max(startWidth + delta, MIN_WIDTH), MAX_WIDTH));
    };
    const handleUp = () => {
      setResizing(false);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [width]);

  if (!open) return null;

  return (
    <div
      className="relative flex flex-col min-h-0 flex-shrink-0"
      style={{
        width,
        borderLeft: '1px solid var(--border-base)',
        backgroundColor: 'var(--bg-panel)',
      }}
    >
      {/* Poignée de redimensionnement */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Redimensionner le panneau"
        className="group absolute top-0 bottom-0 left-0 z-10 w-1 cursor-col-resize hover:bg-[var(--accent-primary)]"
        style={{ opacity: resizing ? 0.5 : undefined }}
        onMouseDown={handleResizeStart}
        title="Redimensionner"
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
          <GripVertical size={10} style={{ color: 'var(--text-dimmed)' }} />
        </div>
      </div>

      <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
