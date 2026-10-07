import { useCallback, useEffect, useState } from 'react';
import { GripVertical } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// ExplorerDock — enveloppe redimensionnable de l'explorateur de fichiers.
//
// L'explorateur avait une largeur fixe (260px) sans redimensionnement ni
// persistance, contrairement au chat (déjà redimensionnable) et à la zone droite
// (RightDock). ExplorerDock harmonise : poignée de drag à droite + largeur
// persistée, et expose la largeur courante via onWidthChange pour que les autres
// zones (BottomDock) restent alignées.
// ═══════════════════════════════════════════════════════════════════════════════

const STORAGE_KEY = 'Leanna_explorer_width';
export const EXPLORER_DEFAULT_WIDTH = 260;
const MIN_WIDTH = 180;
const MAX_WIDTH = 520;

export function getExplorerWidth(): number {
  const saved = Number(localStorage.getItem(STORAGE_KEY));
  if (saved && Number.isFinite(saved)) {
    return Math.min(Math.max(saved, MIN_WIDTH), MAX_WIDTH);
  }
  return EXPLORER_DEFAULT_WIDTH;
}

interface ExplorerDockProps {
  width: number;
  onWidthChange: (width: number) => void;
  /** Reçoit la largeur (l'explorateur applique lui-même `width`). */
  children: (width: number) => React.ReactNode;
}

export function ExplorerDock({ width, onWidthChange, children }: ExplorerDockProps) {
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
      // Poignée à droite de l'explorateur : glisser vers la droite élargit.
      const delta = ev.clientX - startX;
      onWidthChange(Math.min(Math.max(startWidth + delta, MIN_WIDTH), MAX_WIDTH));
    };
    const handleUp = () => {
      setResizing(false);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [width, onWidthChange]);

  return (
    <div className="relative flex h-full flex-shrink-0">
      {children(width)}

      {/* Poignée de redimensionnement (bord droit) */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Redimensionner l'explorateur"
        className="group absolute top-0 bottom-0 right-0 z-10 w-1 cursor-col-resize hover:bg-[var(--accent-primary)]"
        style={{ opacity: resizing ? 0.5 : undefined }}
        onMouseDown={handleResizeStart}
        title="Redimensionner"
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
          <GripVertical size={10} style={{ color: 'var(--text-dimmed)' }} />
        </div>
      </div>
    </div>
  );
}
