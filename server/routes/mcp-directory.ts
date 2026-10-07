/**
 * MCP Directory — Proxy vers l'annuaire public MCP Harbor
 *
 * Expose deux endpoints au frontend afin de parcourir, rechercher et installer
 * en un clic des serveurs MCP gratuits depuis https://ai.mcpharbor.dev :
 *   - GET  /api/mcp/directory          → recherche (proxy + normalisation)
 *   - POST /api/mcp/directory/install  → installe un serveur via le McpBridge
 *
 * On passe TOUJOURS par ce proxy backend : l'API Harbor n'offre pas de garantie
 * CORS et le frontend ne doit pas l'appeler directement.
 *
 * SECURITY: les variables d'environnement requises par un serveur sont
 * initialisées à vide (`""`) — jamais renseignées ni logguées ici. L'utilisateur
 * les complète manuellement dans .Leanna/mcp.json.
 */
import { Router, Request, Response } from 'express';
import type { McpBridge } from '../mcp/McpBridge.js';
import { loadMcpConfig, type McpServerConfig } from '../mcp/mcpConfig.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('McpDirectory');

// ═══════════════════════════════════════════════════════════════════════════════
// Constantes
// ═══════════════════════════════════════════════════════════════════════════════

const HARBOR_BASE = 'https://ai.mcpharbor.dev';
const HARBOR_API = `${HARBOR_BASE}/api/v0`;
const FETCH_TIMEOUT_MS = 10_000;

// ═══════════════════════════════════════════════════════════════════════════════
// Types du manifeste Harbor (partiels — seuls les champs consommés)
// ═══════════════════════════════════════════════════════════════════════════════

interface HarborEnvVar {
  name: string;
  description?: string;
  isRequired?: boolean;
  isSecret?: boolean;
}

interface HarborPackage {
  registryType?: string;
  identifier?: string;
  version?: string;
  environmentVariables?: HarborEnvVar[];
}

interface HarborRemote {
  type?: string;
  url?: string;
}

interface HarborServer {
  name: string;
  title?: string;
  description?: string;
  version?: string;
  packages?: HarborPackage[];
  remotes?: HarborRemote[];
  repository?: { url?: string };
  license?: string;
}

interface HarborEntry {
  server: HarborServer;
  _meta?: {
    'io.mcpregistry/tools'?: string[];
    'io.mcpregistry/official'?: { origin?: string };
  };
}

interface HarborListResponse {
  servers?: HarborEntry[];
  metadata?: {
    count?: number;
    total?: number;
    limit?: number;
    offset?: number;
    next_offset?: number | null;
  };
}

// ── Sortie normalisée pour le frontend ────────────────────────────────────────

interface NormalizedServer {
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

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers — conversion Harbor → Leanna
// ═══════════════════════════════════════════════════════════════════════════════

/** Transforme un nom Harbor en identifiant local sûr (slug `[a-zA-Z0-9_-]`). */
function slugifyId(name: string): string {
  const slug = name
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return slug || 'mcp-server';
}

/** Rend un id unique vis-à-vis des serveurs déjà configurés (suffixe -2, -3...). */
function uniqueId(baseId: string, existingIds: Set<string>): string {
  if (!existingIds.has(baseId)) return baseId;
  let n = 2;
  while (existingIds.has(`${baseId}-${n}`)) n++;
  return `${baseId}-${n}`;
}

/**
 * Détermine le transport et les champs de commande à partir d'un manifeste.
 * Retourne `null` si le serveur n'est pas convertible en McpServerConfig.
 */
function resolveTransport(
  server: HarborServer,
): Pick<McpServerConfig, 'transport' | 'command' | 'args' | 'url'> | null {
  // 1) Remote HTTP/SSE prioritaire.
  const remote = server.remotes?.find(
    (r) => r.type === 'streamable-http' || r.type === 'sse',
  );
  if (remote?.url) {
    return { transport: 'sse', url: remote.url };
  }

  // 2) Package installable localement (stdio).
  const pkg = server.packages?.[0];
  if (pkg?.identifier) {
    switch (pkg.registryType) {
      case 'npm':
        return { transport: 'stdio', command: 'npx', args: ['-y', pkg.identifier] };
      case 'pypi':
        return { transport: 'stdio', command: 'uvx', args: [pkg.identifier] };
      case 'oci':
        return {
          transport: 'stdio',
          command: 'docker',
          args: ['run', '-i', '--rm', pkg.identifier],
        };
      default:
        // nuget, mcpb, etc. → non supporté
        return null;
    }
  }

  return null;
}

/** Construit le mapping des variables d'environnement requises, initialisées vides. */
function buildEnvPlaceholders(server: HarborServer): Record<string, string> | undefined {
  const pkg = server.packages?.[0];
  const vars = pkg?.environmentVariables;
  if (!vars || vars.length === 0) return undefined;

  const env: Record<string, string> = {};
  for (const v of vars) {
    if (v?.name) env[v.name] = '';
  }
  return Object.keys(env).length > 0 ? env : undefined;
}

/** Traduit le code d'origine Harbor en libellé stable pour le frontend. */
function normalizeOrigin(entry: HarborEntry): string {
  return entry._meta?.['io.mcpregistry/official']?.origin ?? 'community';
}

/** Normalise une entrée Harbor pour l'affichage + statut d'installation. */
function normalizeEntry(entry: HarborEntry, installedIds: Set<string>): NormalizedServer {
  const server = entry.server;
  const resolved = resolveTransport(server);
  const installable = resolved !== null;
  const localId = installable ? slugifyId(server.name) : null;

  return {
    name: server.name,
    title: server.title || server.name,
    description: server.description || '',
    version: server.version || null,
    origin: normalizeOrigin(entry),
    tools: entry._meta?.['io.mcpregistry/tools'] ?? [],
    transport: resolved?.transport ?? null,
    installable,
    localId,
    // Un serveur est "déjà installé" si un id dérivé de son slug existe déjà.
    alreadyInstalled: localId ? installedIds.has(localId) : false,
    repositoryUrl: server.repository?.url || null,
    license: server.license || null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers — réseau
// ═══════════════════════════════════════════════════════════════════════════════

/** Erreur typée pour distinguer timeout (504) des autres pannes Harbor (502). */
class HarborError extends Error {
  constructor(message: string, readonly kind: 'timeout' | 'upstream') {
    super(message);
    this.name = 'HarborError';
  }
}

/** GET JSON vers Harbor avec timeout via AbortController. */
async function harborGet<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new HarborError(`Harbor a répondu ${res.status} ${res.statusText}`, 'upstream');
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof HarborError) throw err;
    const e = err as { name?: string };
    if (e?.name === 'AbortError') {
      throw new HarborError(`Timeout Harbor (${FETCH_TIMEOUT_MS}ms)`, 'timeout');
    }
    throw new HarborError(`Harbor injoignable: ${(err as Error).message}`, 'upstream');
  } finally {
    clearTimeout(timer);
  }
}

/** Traduit une HarborError en statut HTTP + payload d'erreur. */
function sendHarborError(res: Response, err: unknown): void {
  if (err instanceof HarborError) {
    const status = err.kind === 'timeout' ? 504 : 502;
    res.status(status).json({ error: err.message });
    return;
  }
  res.status(502).json({ error: (err as Error).message || 'Erreur annuaire MCP' });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Routeur
// ═══════════════════════════════════════════════════════════════════════════════

export function createMcpDirectoryRouter(mcpBridge: McpBridge): Router {
  const router = Router();

  // ── GET /api/mcp/directory ──────────────────────────────────────────────────
  router.get('/directory', async (req: Request, res: Response) => {
    try {
      const { q, transport, tag, limit, offset } = req.query as Record<string, string | undefined>;

      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (transport) params.set('transport', transport);
      if (tag) params.set('tag', tag);
      if (limit) params.set('limit', limit);
      if (offset) params.set('offset', offset);

      const query = params.toString();
      const url = `${HARBOR_API}/servers${query ? `?${query}` : ''}`;

      const data = await harborGet<HarborListResponse>(url);

      // Snapshot des serveurs déjà installés pour marquer alreadyInstalled.
      const installedIds = new Set(Object.keys(loadMcpConfig().mcpServers));

      const servers = (data.servers ?? []).map((entry) => normalizeEntry(entry, installedIds));

      res.json({ servers, metadata: data.metadata ?? {} });
    } catch (err) {
      log.warn(`GET /directory échec: ${(err as Error).message}`);
      sendHarborError(res, err);
    }
  });

  // ── POST /api/mcp/directory/install ───────────────────────────────────────────
  router.post('/directory/install', async (req: Request, res: Response) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name) {
      res.status(400).json({ error: "Le champ 'name' (nom Harbor) est requis." });
      return;
    }

    let entry: HarborEntry;
    try {
      entry = await harborGet<HarborEntry>(`${HARBOR_API}/servers/${encodeURIComponent(name)}`);
    } catch (err) {
      log.warn(`install: récupération manifeste "${name}" échec: ${(err as Error).message}`);
      sendHarborError(res, err);
      return;
    }

    const server = entry?.server;
    if (!server?.name) {
      res.status(502).json({ error: `Manifeste Harbor invalide pour "${name}".` });
      return;
    }

    const resolved = resolveTransport(server);
    if (!resolved) {
      res.status(422).json({
        error: `Le serveur "${name}" n'est pas installable automatiquement (transport/registre non supporté).`,
      });
      return;
    }

    // ID local unique.
    const existingIds = new Set(Object.keys(loadMcpConfig().mcpServers));
    const id = uniqueId(slugifyId(server.name), existingIds);

    const env = buildEnvPlaceholders(server);
    const config: Omit<McpServerConfig, 'id'> = {
      name: server.title || server.name,
      transport: resolved.transport,
      command: resolved.command,
      args: resolved.args,
      url: resolved.url,
      env,
      description: server.description || undefined,
    };

    try {
      // addServer persiste dans .Leanna/mcp.json ET connecte immédiatement.
      await mcpBridge.addServer(id, config);
      log.info(`Serveur "${id}" installé depuis Harbor (${resolved.transport}).`);
      res.json({
        success: true,
        id,
        config: { ...config, id },
        message: `Serveur "${config.name}" installé et connecté.`,
      });
    } catch (err) {
      log.error(`install: addServer "${id}" échec: ${(err as Error).message}`);
      res.status(500).json({ error: (err as Error).message || "Échec de l'installation." });
    }
  });

  return router;
}
