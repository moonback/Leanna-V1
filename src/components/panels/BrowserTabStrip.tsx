/**
 * BrowserTabStrip — barre d'onglets du navigateur intégré.
 *
 * Affiche un onglet par page ouverte (titre ou URL), met en évidence l'onglet
 * actif, et propose fermeture par onglet + bouton « nouvel onglet ».
 */

import { Globe, Loader2, Plus, X } from 'lucide-react';

export interface TabStripItem {
  id: string;
  title: string;
  url: string;
  loading: boolean;
  faviconUrl?: string | null;
}

interface BrowserTabStripProps {
  tabs: TabStripItem[];
  activeTabId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNewTab: () => void;
}

/** Libellé lisible d'un onglet : titre, sinon domaine, sinon « Nouvel onglet ». */
function tabLabel(item: TabStripItem): string {
  if (item.title.trim()) return item.title.trim();
  try {
    const host = new URL(item.url).hostname.replace(/^www\./, '');
    if (host) return host;
  } catch {
    /* url non valide */
  }
  return 'Nouvel onglet';
}

export function BrowserTabStrip({ tabs, activeTabId, onSelect, onClose, onNewTab }: BrowserTabStripProps) {
  return (
    <div
      className="flex items-center gap-1 px-2 py-1.5 flex-shrink-0 overflow-x-auto"
      style={{
        borderBottom: '1px solid var(--border-base)',
        backgroundColor: 'var(--bg-sidebar)',
      }}
      role="tablist"
      aria-label="Onglets du navigateur"
    >
      {tabs.map((tab) => {
        const active = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={active}
            tabIndex={0}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(tab.id); } }}
            onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); onClose(tab.id); } }}
            className="group relative flex items-center gap-2 min-w-[120px] max-w-[210px] pl-2.5 pr-1.5 py-1.5 rounded-lg cursor-pointer transition-colors"
            style={{
              backgroundColor: active ? 'var(--bg-elevated)' : 'transparent',
              border: `1px solid ${active ? 'var(--border-base)' : 'transparent'}`,
              boxShadow: active ? 'var(--shadow-xs)' : 'none',
            }}
            onMouseEnter={(e) => { if (!active) e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; }}
            onMouseLeave={(e) => { if (!active) e.currentTarget.style.backgroundColor = 'transparent'; }}
            title={tab.url || tabLabel(tab)}
          >
            {/* Indicateur d'onglet actif : liseré accent à gauche */}
            {active && (
              <span
                aria-hidden="true"
                className="absolute left-0 top-1/2 -translate-y-1/2 rounded-full"
                style={{ width: 3, height: '55%', backgroundColor: 'var(--accent-primary)' }}
              />
            )}
            {tab.loading ? (
              <Loader2 size={12} className="animate-spin" style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
            ) : tab.faviconUrl ? (
              <img
                src={tab.faviconUrl}
                alt=""
                width={14}
                height={14}
                style={{ flexShrink: 0, borderRadius: 3 }}
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <Globe size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            )}
            <span
              className="text-xs truncate flex-1"
              style={{ color: active ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: active ? 500 : 400 }}
            >
              {tabLabel(tab)}
            </span>
            {tabs.length > 1 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
                className="flex items-center justify-center w-5 h-5 rounded-md opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-[var(--bg-active)] transition flex-shrink-0"
                title="Fermer l'onglet"
                aria-label={`Fermer l'onglet ${tabLabel(tab)}`}
              >
                <X size={12} style={{ color: 'var(--text-muted)' }} />
              </button>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={onNewTab}
        className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-[var(--bg-active)] transition flex-shrink-0"
        title="Nouvel onglet"
        aria-label="Nouvel onglet"
      >
        <Plus size={14} style={{ color: 'var(--text-muted)' }} />
      </button>
    </div>
  );
}
