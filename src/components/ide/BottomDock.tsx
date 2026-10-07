import { useCallback, useEffect, useState } from 'react';
import { GripHorizontal } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// BottomDock — enveloppe partagée de la zone basse de l'IDE (Terminal / Logs).
//
// Terminal et Logs occupent désormais la MÊME zone basse, ancrée en bas de la
// fenêtre (au-dessus de la barre de statut) et alignée sur la colonne de travail
// (décalée de la sidebar + explorateur). La hauteur est partagée entre les deux
// contenus et persistée : basculer de Terminal à Logs conserve la hauteur.
//
// Note d'implémentation : on garde `position: fixed; bottom` (comme le faisait
// déjà le terminal docké) plutôt que de réintégrer la zone dans le flux flex,
// afin de ne pas perturber le rendu du terminal existant.
// ═══════════════════════════════════════════════════════════════════════════════

const STORAGE_KEY = 'Leanna_bottom_dock_height';
const DEFAULT_HEIGHT = 320;
const MIN_HEIGHT = 140;
const MAX_HEIGHT_VH = 0.8; // 80% de la hauteur de fenêtre

const SIDEBAR_WIDTH = 56;

export function getBottomDockHeight(): number {
  const saved = Number(localStorage.getItem(STORAGE_KEY));
  if (saved && Number.isFinite(saved)) return saved;
  return DEFAULT_HEIGHT;
}

interface BottomDockProps {
  /** Vrai si l'explorateur de fichiers est ouvert (décalage gauche). */
  showExplorer?: boolean;
  /** Largeur actuelle de l'explorateur, pour aligner le bord gauche. */
  explorerWidth?: number;
  children: React.ReactNode;
}

export function BottomDock({ showExplorer, explorerWidth = 0, children }: BottomDockProps) {
  const [height, setHeight] = useState(() => getBottomDockHeight());
  const [resizing, setResizing] = useState(false);

  useEffect(() => {
    if (!resizing) localStorage.setItem(STORAGE_KEY, String(height));
  }, [height, resizing]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setResizing(true);
    const startY = e.clientY;
    const startHeight = height;
    const maxH = window.innerHeight * MAX_HEIGHT_VH;

    const handleMove = (ev: MouseEvent) => {
      // Poignée en haut du dock : glisser vers le haut agrandit.
      const delta = startY - ev.clientY;
      setHeight(Math.min(Math.max(startHeight + delta, MIN_HEIGHT), maxH));
    };
    const handleUp = () => {
      setResizing(false);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [height]);

  const left = SIDEBAR_WIDTH + (showExplorer ? explorerWidth : 0);

  return (
    <div
      className="fixed bottom-0 right-0 flex flex-col overflow-hidden"
      style={{
        left,
        height,
        zIndex: 'var(--z-terminal)' as unknown as number,
        backgroundColor: 'var(--bg-panel)',
        borderTop: '1px solid var(--border-base)',
        boxShadow: '0 -4px 20px rgba(0,0,0,0.3)',
      }}
    >
      {/* Poignée de redimensionnement (haut) */}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Redimensionner la zone basse"
        className="group absolute left-0 right-0 top-0 z-10 h-1 cursor-row-resize hover:bg-[var(--accent-primary)]"
        style={{ opacity: resizing ? 0.5 : undefined }}
        onMouseDown={handleResizeStart}
        title="Redimensionner"
      >
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
          <GripHorizontal size={10} style={{ color: 'var(--text-dimmed)' }} />
        </div>
      </div>

      <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
