/**
 * MermaidDiagram — Rendu de diagrammes Mermaid
 *
 * Utilise la lib mermaid pour convertir le code Mermaid en SVG.
 * Suit le thème de l'application (data-theme) et le resize.
 */

import { useEffect, useRef, useState, memo } from 'react';
import { Maximize2, Minimize2, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { Tooltip } from '../ui/Tooltip.js';
import { errorMessage } from './utils.js';

// `mermaid` est une dépendance lourde (plusieurs centaines de Ko). On la charge
// dynamiquement pour la sortir du bundle principal : elle n'est fetchée que
// lorsqu'un diagramme doit réellement être rendu (import() mémoïsé → un seul
// téléchargement partagé par toutes les instances).
type Mermaid = typeof import('mermaid')['default'];
let mermaidPromise: Promise<Mermaid> | null = null;
function loadMermaid(): Promise<Mermaid> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((m) => m.default);
  }
  return mermaidPromise;
}

interface Props {
  code: string;
  id?: string;
}

// Thèmes de l'application (data-theme) → thème Mermaid le plus proche.
// Mermaid n'accepte que 'default' | 'dark' | 'forest' | 'neutral' | 'base'.
type MermaidTheme = 'default' | 'dark' | 'neutral';

function resolveMermaidTheme(): MermaidTheme {
  const appTheme =
    typeof document !== 'undefined'
      ? document.documentElement.getAttribute('data-theme')
      : null;
  switch (appTheme) {
    case 'light':
      return 'default';
    case 'sepia':
      return 'neutral';
    // 'dark', 'cyberpunk', 'high-contrast' et valeur par défaut → thème sombre
    default:
      return 'dark';
  }
}

// Thème avec lequel Mermaid a été initialisé pour la dernière fois.
// null tant qu'aucune initialisation n'a eu lieu.
let initializedTheme: MermaidTheme | null = null;

function initMermaid(mermaid: Mermaid, theme: MermaidTheme) {
  // Mermaid est initialisé globalement : on ne ré-initialise que si le thème a changé.
  if (initializedTheme === theme) return;
  mermaid.initialize({
    startOnLoad: false,
    theme,
    // SECURITY: Use 'strict' to sanitize labels/tooltips and disable JS callbacks.
    // This prevents XSS via mermaid diagrams with malicious click handlers.
    // Note: Diagram code can originate from AI-generated notebook content (untrusted).
    // htmlLabels is disabled to prevent HTML injection in flowchart labels.
    securityLevel: 'strict',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 12,
    mindmap: {
      padding: 24,
      useMaxWidth: false,
    },
    flowchart: {
      useMaxWidth: true,
      htmlLabels: false,  // SECURITY: Disable to prevent HTML injection
      curve: 'basis',
    },
  });
  initializedTheme = theme;
}

export const MermaidDiagram = memo(function MermaidDiagram({ code, id }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [rendering, setRendering] = useState(true);
  const [zoom, setZoom] = useState(0.85);
  const [expanded, setExpanded] = useState(false);
  const uniqueId = useRef(`mermaid-${id || Math.random().toString(36).slice(2, 10)}`);
  const isMindmap = /^\s*mindmap\b/m.test(code);
  const [mermaidTheme, setMermaidTheme] = useState<MermaidTheme>(resolveMermaidTheme);

  // Suit les changements de thème de l'application (attribut data-theme sur <html>)
  // et re-rend le diagramme avec le thème Mermaid correspondant.
  useEffect(() => {
    const target = document.documentElement;
    const observer = new MutationObserver(() => {
      setMermaidTheme(resolveMermaidTheme());
    });
    observer.observe(target, { attributes: true, attributeFilter: ['data-theme'] });
    // Resynchronise au montage au cas où le thème a changé avant l'abonnement.
    setMermaidTheme(resolveMermaidTheme());
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setZoom(isMindmap ? 0.85 : 1);
  }, [code, isMindmap]);

  useEffect(() => {
    if (!code.trim()) return;

    let cancelled = false;

    async function render() {
      setRendering(true);
      setError('');

      try {
        const mermaid = await loadMermaid();
        if (cancelled) return;
        initMermaid(mermaid, mermaidTheme);

        // Nettoyer le code (retirer les espaces de début/fin)
        const cleanCode = code.trim();

        const { svg: renderedSvg } = await mermaid.render(uniqueId.current, cleanCode);

        if (!cancelled) {
          setSvg(renderedSvg);
          setRendering(false);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(errorMessage(e) || 'Erreur de rendu Mermaid');
          setRendering(false);
        }
      }
    }

    render();
    return () => { cancelled = true; };
  }, [code, mermaidTheme]);

  if (rendering) {
    return (
      <div
        className="flex items-center justify-center py-8 rounded-xl"
        style={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-base)' }}
      >
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-dimmed)' }}>
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          Rendu du diagramme...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-2">
        <div
          className="px-4 py-3 rounded-xl text-xs"
          style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--color-error)' }}
        >
          ⚠️ Impossible de rendre le diagramme : {error}
        </div>
        {/* Afficher le code source en fallback */}
        <pre
          className="px-4 py-3 rounded-xl text-xs overflow-x-auto font-mono"
          style={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-base)', color: 'var(--text-muted)' }}
        >
          <code>{code}</code>
        </pre>
      </div>
    );
  }

  if (!isMindmap) {
    return (
      <div
        ref={containerRef}
        className="w-full overflow-x-auto rounded-xl p-4"
        style={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-base)' }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }

  const updateZoom = (change: number) => {
    setZoom((current) => Math.min(1.5, Math.max(0.55, Number((current + change).toFixed(2)))));
  };

  return (
    <div
      ref={containerRef}
      className={expanded ? 'fixed inset-4 z-50 flex flex-col rounded-2xl shadow-2xl' : 'w-full rounded-xl'}
      style={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-base)' }}
    >
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}>
        <div className="min-w-0">
          <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Carte mentale interactive</p>
          <p className="text-xs" style={{ color: 'var(--text-dimmed)' }}>Utilisez le zoom et faites défiler pour explorer les branches.</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Tooltip content="Réduire le zoom" as="button" onClick={() => updateZoom(-0.1)} disabled={zoom <= 0.55} className="p-1.5 rounded-md hover:bg-[var(--bg-hover)] disabled:opacity-30">
            <ZoomOut className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
          </Tooltip>
          <span className="w-10 text-center text-xs font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>{Math.round(zoom * 100)}%</span>
          <Tooltip content="Agrandir le zoom" as="button" onClick={() => updateZoom(0.1)} disabled={zoom >= 1.5} className="p-1.5 rounded-md hover:bg-[var(--bg-hover)] disabled:opacity-30">
            <ZoomIn className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
          </Tooltip>
          <Tooltip content="Réinitialiser le zoom" as="button" onClick={() => setZoom(0.85)} className="p-1.5 rounded-md hover:bg-[var(--bg-hover)]">
            <RotateCcw className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
          </Tooltip>
          <Tooltip content={expanded ? 'Réduire la carte' : 'Agrandir la carte'} as="button" onClick={() => setExpanded((current) => !current)} className="p-1.5 rounded-md hover:bg-[var(--bg-hover)]">
            {expanded ? <Minimize2 className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} /> : <Maximize2 className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />}
          </Tooltip>
        </div>
      </div>
      <div className={`overflow-auto custom-scrollbar p-4 ${expanded ? 'flex-1' : 'max-h-[65vh]'}`}>
        <div
          className="w-max min-w-full origin-top-left"
          style={{ zoom }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </div>
  );
});
