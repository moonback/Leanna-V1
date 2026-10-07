/**
 * Rendu d'infographie et hook d'accessibilité, extraits de renderHelpers pour
 * garder chaque fichier sous la limite de taille.
 */

import { useEffect, useState, type JSX } from 'react';
import { Lightbulb, Download, Folder, Brain } from 'lucide-react';

/** Render infographic content — affiche l'image PNG directement */
export function renderInfographicContent(content: string): JSX.Element {
  let imageSrc = '';
  let prompt = '';
  let model = '';
  let filePath = '';
  let sizeKB = 0;

  try {
    const data = JSON.parse(content);
    if (data.type === 'infographic-image') {
      imageSrc = `data:${data.mediaType};base64,${data.imageBase64}`;
      prompt = data.prompt || '';
      model = data.model || '';
      filePath = data.filePath || '';
      sizeKB = data.sizeKB || 0;
    }
  } catch {
    const imgMatch = content.match(/!\[[^\]]*\]\((data:image\/[^;]+;base64,[^)]+)\)/);
    if (imgMatch) imageSrc = imgMatch[1];
  }

  if (!imageSrc) {
    return (
      <div
        className="flex flex-col items-center gap-4 p-8 rounded-2xl"
        style={{
          backgroundColor: 'var(--bg-panel)',
          border: '1px dashed var(--border-base)',
        }}
      >
        <Lightbulb className="w-8 h-8 opacity-50" style={{ color: 'var(--color-warning)' }} />
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Aucune image trouvée
        </p>
      </div>
    );
  }

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = imageSrc;
    link.download = filePath ? filePath.split('/').pop()! : `infographie-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="notebooklm-infographic space-y-6">
      <div
        className="rounded-3xl overflow-hidden shadow-2xl border"
        style={{
          borderColor: 'var(--border-base)',
          backgroundColor: 'var(--bg-base)',
        }}
      >
        <img
          src={imageSrc}
          alt="Infographie générée"
          className="w-full h-auto"
          style={{ maxHeight: '850px', objectFit: 'contain' }}
        />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={handleDownload}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:shadow-md active:scale-[0.98]"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--color-warning) 12%, transparent)',
            color: 'var(--color-warning)',
            border: '1px solid color-mix(in srgb, var(--color-warning) 25%, transparent)',
          }}
        >
          <Download className="w-4 h-4" />
          Télécharger PNG
        </button>

        {filePath && (
          <span
            className="text-xs px-3 py-1.5 rounded-xl"
            style={{
              backgroundColor: 'var(--bg-base)',
              color: 'var(--text-dimmed)',
            }}
          >
            <span className="inline-flex items-center gap-1"><Folder size={12} /> {filePath.split('/').pop()}</span>
          </span>
        )}
        {sizeKB > 0 && (
          <span
            className="text-xs px-2 py-1 rounded-full"
            style={{
              backgroundColor: 'var(--bg-panel)',
              color: 'var(--text-dimmed)',
            }}
          >
            {sizeKB} KB
          </span>
        )}
      </div>

      {(prompt || model) && (
        <div
          className="p-4 rounded-xl border space-y-3"
          style={{
            borderColor: 'var(--border-base)',
            backgroundColor: 'var(--bg-panel)',
          }}
        >
          {model && (
            <p className="text-sm flex items-center gap-2">
              <Brain
                className="w-4 h-4"
                style={{ color: 'var(--accent-primary)', opacity: 0.7 }}
              />
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                Modèle:
              </span>
              <span style={{ color: 'var(--text-dimmed)' }}> {model}</span>
            </p>
          )}
          {prompt && (
            <p className="text-sm">
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                Prompt:
              </span>
              <span
                className="ml-2 leading-relaxed"
                style={{ color: 'var(--text-dimmed)' }}
              >
                {prompt.slice(0, 250)}
                {prompt.length > 250 ? '...' : ''}
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Détecte prefers-reduced-transparency pour durcir les scrims de modal */
export function useReducedTransparency(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-transparency: reduce)');
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}
