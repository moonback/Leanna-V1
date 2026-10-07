/**
 * McpDirectory — Annuaire de serveurs MCP (MCP Harbor).
 *
 * Permet de parcourir, rechercher et installer en un clic des serveurs MCP
 * gratuits. Passe exclusivement par le proxy backend /api/mcp/directory
 * (jamais d'appel direct à Harbor → CORS non garanti).
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, Terminal, Globe, Download,
  ShieldCheck, ExternalLink, AlertCircle, CheckCircle2, PackageX,
} from 'lucide-react';
import { Modal } from '../ui/Modal.js';
import { Button } from '../ui/Button.js';
import { EmptyState } from '../ui/EmptyState.js';
import { SkeletonBlock } from '../ui/Skeleton.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

interface DirectoryServer {
  name: string;
  title: string;
  description: string;
  version: string | null;
  origin: string;
  tools: string[];
  transport: 'stdio' | 'sse' | null;
  installable: boolean;
  localId: string | null;
  alreadyInstalled: boolean;
  repositoryUrl: string | null;
  license: string | null;
}

interface DirectoryMetadata {
  count?: number;
  total?: number;
  limit?: number;
  offset?: number;
  next_offset?: number | null;
}

type TransportFilter = 'all' | 'stdio' | 'streamable-http' | 'sse';

export interface McpDirectoryProps {
  open: boolean;
  onClose: () => void;
  onInstalled?: (serverId: string) => void;
}

const PAGE_LIMIT = 30;
const DEBOUNCE_MS = 300;

// ── Libellés d'origine ────────────────────────────────────────────────────────
function originLabel(origin: string): string {
  switch (origin) {
    case 'official': return 'Registre officiel';
    case 'curated': return 'Sélection curée';
    case 'local': return 'Soumis localement';
    default: return 'Communauté';
  }
}

function authHeaders(): Record<string, string> {
  return { 'X-Leanna-Token': localStorage.getItem('Leanna_api_token') || '' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Composant
// ═══════════════════════════════════════════════════════════════════════════════

export function McpDirectory({ open, onClose, onInstalled }: McpDirectoryProps) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [transport, setTransport] = useState<TransportFilter>('all');

  const [servers, setServers] = useState<DirectoryServer[]>([]);
  const [metadata, setMetadata] = useState<DirectoryMetadata>({});
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [installing, setInstalling] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  // ── Debounce recherche ──────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  // ── Fetch (page initiale ou filtre changé) ────────────────────────────────────
  const fetchServers = useCallback(async (offset: number, append: boolean) => {
    // Annule la requête précédente en vol.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim());
      if (transport !== 'all') params.set('transport', transport);
      params.set('limit', String(PAGE_LIMIT));
      params.set('offset', String(offset));

      const res = await fetch(`/api/mcp/directory?${params.toString()}`, {
        headers: authHeaders(),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Erreur ${res.status}`);
      }

      const data = await res.json() as { servers: DirectoryServer[]; metadata: DirectoryMetadata };
      setMetadata(data.metadata || {});
      setServers(prev => append ? [...prev, ...data.servers] : data.servers);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return; // requête remplacée
      setError((e as Error).message);
      if (!append) setServers([]);
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  }, [debouncedSearch, transport]);

  // Recharge à chaque changement de filtre (ouverture incluse).
  useEffect(() => {
    if (!open) return;
    fetchServers(0, false);
    return () => abortRef.current?.abort();
  }, [open, fetchServers]);

  // ── Installation ──────────────────────────────────────────────────────────────
  const handleInstall = useCallback(async (server: DirectoryServer) => {
    setInstalling(prev => new Set(prev).add(server.name));
    setError(null);
    try {
      const res = await fetch('/api/mcp/directory/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ name: server.name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Erreur ${res.status}`);
      }

      // Marque localement comme installé.
      setServers(prev => prev.map(s =>
        s.name === server.name ? { ...s, alreadyInstalled: true } : s,
      ));
      setToast(`« ${server.title} » installé`);
      onInstalled?.(data.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setInstalling(prev => {
        const next = new Set(prev);
        next.delete(server.name);
        return next;
      });
    }
  }, [onInstalled]);

  // Efface le toast après 3s.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const canLoadMore = typeof metadata.next_offset === 'number' && !loading;

  return (
    <Modal open={open} onClose={onClose} size="2xl" title="Annuaire de serveurs MCP">
      <Modal.Body noPadding>
        {/* ── Barre de filtres ── */}
        <div
          className="sticky top-0 z-10 flex items-center gap-2 px-5 py-3"
          style={{
            backgroundColor: 'var(--bg-panel)',
            borderBottom: '1px solid var(--border-base)',
          }}
        >
          <div className="relative flex-1">
            <Search
              size={14}
              style={{ position: 'absolute', left: 10, top: 9, color: 'var(--text-muted)' }}
            />
            <input
              aria-label="Rechercher un serveur MCP"
              placeholder="Rechercher (ex: filesystem, github, postgres)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                paddingLeft: 30,
                paddingRight: 10,
                height: 34,
                fontSize: 13,
                borderRadius: 6,
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border-base)',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
          </div>

          <select
            aria-label="Filtrer par transport"
            value={transport}
            onChange={(e) => setTransport(e.target.value as TransportFilter)}
            style={{
              height: 34,
              fontSize: 13,
              borderRadius: 6,
              padding: '0 8px',
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border-base)',
              color: 'var(--text-primary)',
              outline: 'none',
            }}
          >
            <option value="all">Tous</option>
            <option value="stdio">stdio</option>
            <option value="streamable-http">streamable-http</option>
            <option value="sse">sse</option>
          </select>
        </div>

        {/* ── Bandeau erreur ── */}
        {error && (
          <div
            className="flex items-center gap-2 px-5 py-2"
            style={{
              fontSize: 12,
              color: 'var(--color-error)',
              backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
              borderBottom: '1px solid var(--border-base)',
            }}
          >
            <AlertCircle size={13} />
            <span className="flex-1">{error}</span>
          </div>
        )}

        {/* ── Toast succès ── */}
        {toast && (
          <div
            className="flex items-center gap-2 px-5 py-2"
            style={{
              fontSize: 12,
              color: 'var(--color-success)',
              backgroundColor: 'color-mix(in srgb, var(--color-success) 10%, transparent)',
              borderBottom: '1px solid var(--border-base)',
            }}
          >
            <CheckCircle2 size={13} />
            <span className="flex-1">{toast}</span>
          </div>
        )}

        {/* ── Contenu ── */}
        <div className="px-5 py-4">
          {loading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonBlock key={i} style={{ height: 92 }} />
              ))}
            </div>
          ) : servers.length === 0 ? (
            <EmptyState
              icon={PackageX}
              title="Aucun serveur trouvé"
              description="Essayez un autre terme de recherche ou changez le filtre de transport."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {servers.map((server) => (
                <ServerCard
                  key={server.name}
                  server={server}
                  installing={installing.has(server.name)}
                  onInstall={() => handleInstall(server)}
                />
              ))}

              {canLoadMore && (
                <div className="flex justify-center pt-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={loadingMore}
                    onClick={() => fetchServers(metadata.next_offset as number, true)}
                  >
                    Charger plus
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal.Body>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Carte serveur
// ═══════════════════════════════════════════════════════════════════════════════

function ServerCard({
  server,
  installing,
  onInstall,
}: {
  server: DirectoryServer;
  installing: boolean;
  onInstall: () => void;
}) {
  const TransportIcon = server.transport === 'sse' ? Globe : Terminal;
  const visibleTools = server.tools.slice(0, 4);
  const extraTools = server.tools.length - visibleTools.length;

  return (
    <div
      className="flex flex-col gap-2 rounded-lg p-3"
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-base)',
      }}
    >
      {/* En-tête : icône + titre + badge origine */}
      <div className="flex items-start gap-2">
        <div
          className="flex items-center justify-center rounded-md shrink-0"
          style={{ width: 30, height: 30, backgroundColor: 'var(--accent-subtle)' }}
        >
          <TransportIcon size={15} style={{ color: 'var(--accent-primary)' }} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="truncate font-semibold"
              style={{ fontSize: 13, color: 'var(--text-primary)' }}
            >
              {server.title}
            </span>
            {server.version && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                v{server.version}
              </span>
            )}
          </div>
          <span
            className="inline-block rounded-full px-2 py-0.5 mt-0.5"
            style={{
              fontSize: 10,
              color: 'var(--accent-primary)',
              backgroundColor: 'var(--accent-subtle)',
            }}
          >
            {originLabel(server.origin)}
          </span>
        </div>

        {/* Action installer / déjà installé */}
        <div className="shrink-0">
          {server.alreadyInstalled ? (
            <span
              className="inline-flex items-center gap-1 rounded-md px-2 py-1"
              style={{
                fontSize: 11,
                color: 'var(--color-success)',
                backgroundColor: 'color-mix(in srgb, var(--color-success) 12%, transparent)',
              }}
            >
              <ShieldCheck size={13} /> Installé
            </span>
          ) : (
            <Button
              variant="primary"
              size="xs"
              disabled={!server.installable}
              loading={installing}
              iconLeft={<Download size={12} />}
              onClick={onInstall}
              title={server.installable ? 'Installer ce serveur' : 'Non installable automatiquement'}
            >
              Installer
            </Button>
          )}
        </div>
      </div>

      {/* Description */}
      {server.description && (
        <p
          className="line-clamp-2"
          style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}
        >
          {server.description}
        </p>
      )}

      {/* Tags outils + lien dépôt */}
      <div className="flex items-center flex-wrap gap-1.5">
        {visibleTools.map((tool) => (
          <span
            key={tool}
            className="rounded px-1.5 py-0.5"
            style={{
              fontSize: 10,
              color: 'var(--text-muted)',
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border-base)',
            }}
          >
            {tool}
          </span>
        ))}
        {extraTools > 0 && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>+{extraTools}</span>
        )}

        <span className="flex-1" />

        {server.repositoryUrl && (
          <a
            href={server.repositoryUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1"
            style={{ fontSize: 11, color: 'var(--accent-primary)' }}
          >
            Dépôt <ExternalLink size={11} />
          </a>
        )}
      </div>
    </div>
  );
}

export default McpDirectory;
