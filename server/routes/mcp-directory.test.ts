/**
 * mcp-directory.test.ts — Tests du proxy annuaire MCP Harbor.
 *
 * Couvre :
 *   - GET  /api/mcp/directory          (succès, timeout, erreur Harbor)
 *   - POST /api/mcp/directory/install  (npm, sse, transport non supporté, name manquant)
 *
 * Stratégie :
 *   - `globalThis.fetch` est monkey-patché par test pour simuler Harbor.
 *   - Un faux McpBridge capture les appels addServer (pas de spawn réel).
 *   - `Leanna_CONFIG_PATH` pointe vers un dossier temporaire : loadMcpConfig()
 *     y lit un .Leanna/mcp.json contrôlé, sans toucher la vraie config.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

import { createMcpDirectoryRouter } from './mcp-directory.js';
import type { McpBridge } from '../mcp/McpBridge.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Environnement isolé (config MCP temporaire)
// ═══════════════════════════════════════════════════════════════════════════════

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'leanna-mcp-dir-'));
process.env.Leanna_CONFIG_PATH = tmpRoot;

function writeConfig(servers: Record<string, unknown>): void {
  const dir = path.join(tmpRoot, '.Leanna');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'mcp.json'), JSON.stringify({ mcpServers: servers }, null, 2));
}
writeConfig({});

// ═══════════════════════════════════════════════════════════════════════════════
// Fakes
// ═══════════════════════════════════════════════════════════════════════════════

interface AddServerCall {
  id: string;
  config: Record<string, unknown>;
}

function makeFakeBridge(): { bridge: McpBridge; calls: AddServerCall[] } {
  const calls: AddServerCall[] = [];
  const bridge = {
    async addServer(id: string, config: Record<string, unknown>) {
      calls.push({ id, config });
    },
  } as unknown as McpBridge;
  return { bridge, calls };
}

const realFetch = globalThis.fetch;

/** Installe un faux fetch. `impl` reçoit l'URL demandée. */
function stubFetch(impl: (url: string) => Promise<Response> | Response): void {
  globalThis.fetch = (async (input: unknown) => {
    const url = typeof input === 'string' ? input : String(input);
    return impl(url);
  }) as typeof fetch;
}

function restoreFetch(): void {
  globalThis.fetch = realFetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Démarre l'app Express sur un port éphémère et retourne l'URL de base. */
async function startServer(bridge: McpBridge): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const app = express();
  app.use(express.json());
  app.use('/api/mcp', createMcpDirectoryRouter(bridge));

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Fixtures Harbor
// ═══════════════════════════════════════════════════════════════════════════════

const NPM_ENTRY = {
  server: {
    name: 'io.github.modelcontextprotocol/filesystem',
    title: 'Filesystem',
    description: 'Accès fichiers local',
    version: '1.0.0',
    packages: [
      {
        registryType: 'npm',
        identifier: '@modelcontextprotocol/server-filesystem',
        environmentVariables: [{ name: 'ROOT_DIR', isRequired: true }],
      },
    ],
    repository: { url: 'https://github.com/x/y' },
    license: 'MIT',
  },
  _meta: {
    'io.mcpregistry/tools': ['read_file', 'write_file'],
    'io.mcpregistry/official': { origin: 'official' },
  },
};

const SSE_ENTRY = {
  server: {
    name: 'com.example/remote-tools',
    title: 'Remote Tools',
    description: 'Outils distants',
    version: '2.1.0',
    remotes: [{ type: 'streamable-http', url: 'https://example.com/mcp' }],
    license: 'Apache-2.0',
  },
  _meta: { 'io.mcpregistry/official': { origin: 'community' } },
};

const NUGET_ENTRY = {
  server: {
    name: 'com.example/dotnet-tool',
    title: 'Dotnet Tool',
    description: 'Non installable',
    version: '1.0.0',
    packages: [{ registryType: 'nuget', identifier: 'Some.Package' }],
  },
  _meta: {},
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/mcp/directory
// ═══════════════════════════════════════════════════════════════════════════════

test('GET /directory — succès : normalise et marque alreadyInstalled', async () => {
  writeConfig({}); // aucun serveur installé
  stubFetch((url) => {
    assert.ok(url.includes('/api/v0/servers'), 'proxy vers Harbor');
    assert.ok(url.includes('q=file'), 'transmet q');
    return jsonResponse({
      servers: [NPM_ENTRY, SSE_ENTRY, NUGET_ENTRY],
      metadata: { count: 3, total: 100, limit: 30, offset: 0, next_offset: 30 },
    });
  });

  const { bridge } = makeFakeBridge();
  const { baseUrl, close } = await startServer(bridge);
  try {
    const res = await realFetch(`${baseUrl}/api/mcp/directory?q=file`);
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(data.servers.length, 3);
    assert.equal(data.metadata.next_offset, 30);

    const [npm, sse, nuget] = data.servers;
    assert.equal(npm.transport, 'stdio');
    assert.equal(npm.installable, true);
    assert.equal(npm.localId, 'io.github.modelcontextprotocol-filesystem'.replace(/\./g, '-'));
    assert.equal(npm.origin, 'official');
    assert.deepEqual(npm.tools, ['read_file', 'write_file']);
    assert.equal(npm.alreadyInstalled, false);

    assert.equal(sse.transport, 'sse');
    assert.equal(sse.installable, true);

    assert.equal(nuget.installable, false, 'nuget non installable');
    assert.equal(nuget.localId, null);
  } finally {
    await close();
    restoreFetch();
  }
});

test('GET /directory — alreadyInstalled vrai si id local présent', async () => {
  const localId = slugify('io.github.modelcontextprotocol/filesystem');
  writeConfig({ [localId]: { name: 'Filesystem', transport: 'stdio', command: 'npx' } });
  stubFetch(() => jsonResponse({ servers: [NPM_ENTRY], metadata: {} }));

  const { bridge } = makeFakeBridge();
  const { baseUrl, close } = await startServer(bridge);
  try {
    const res = await realFetch(`${baseUrl}/api/mcp/directory`);
    const data = await res.json();
    assert.equal(data.servers[0].alreadyInstalled, true);
  } finally {
    await close();
    restoreFetch();
    writeConfig({});
  }
});

test('GET /directory — timeout Harbor → 504', async () => {
  stubFetch(() => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    return Promise.reject(err);
  });

  const { bridge } = makeFakeBridge();
  const { baseUrl, close } = await startServer(bridge);
  try {
    const res = await realFetch(`${baseUrl}/api/mcp/directory`);
    assert.equal(res.status, 504);
  } finally {
    await close();
    restoreFetch();
  }
});

test('GET /directory — Harbor répond 500 → 502', async () => {
  stubFetch(() => jsonResponse({ error: 'boom' }, 500));

  const { bridge } = makeFakeBridge();
  const { baseUrl, close } = await startServer(bridge);
  try {
    const res = await realFetch(`${baseUrl}/api/mcp/directory`);
    assert.equal(res.status, 502);
  } finally {
    await close();
    restoreFetch();
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/mcp/directory/install
// ═══════════════════════════════════════════════════════════════════════════════

test('POST /install — succès npm : appelle addServer avec npx + env vides', async () => {
  writeConfig({});
  stubFetch((url) => {
    assert.ok(url.includes('/api/v0/servers/'), 'récupère le manifeste');
    return jsonResponse(NPM_ENTRY);
  });

  const { bridge, calls } = makeFakeBridge();
  const { baseUrl, close } = await startServer(bridge);
  try {
    const res = await postJson(`${baseUrl}/api/mcp/directory/install`, {
      name: 'io.github.modelcontextprotocol/filesystem',
    });
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(data.success, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].config.transport, 'stdio');
    assert.equal(calls[0].config.command, 'npx');
    assert.deepEqual(calls[0].config.args, ['-y', '@modelcontextprotocol/server-filesystem']);
    // env requis initialisé vide (jamais renseigné)
    assert.deepEqual(calls[0].config.env, { ROOT_DIR: '' });
  } finally {
    await close();
    restoreFetch();
  }
});

test('POST /install — succès sse : transport sse + url', async () => {
  writeConfig({});
  stubFetch(() => jsonResponse(SSE_ENTRY));

  const { bridge, calls } = makeFakeBridge();
  const { baseUrl, close } = await startServer(bridge);
  try {
    const res = await postJson(`${baseUrl}/api/mcp/directory/install`, {
      name: 'com.example/remote-tools',
    });
    assert.equal(res.status, 200);
    assert.equal(calls[0].config.transport, 'sse');
    assert.equal(calls[0].config.url, 'https://example.com/mcp');
  } finally {
    await close();
    restoreFetch();
  }
});

test('POST /install — transport non supporté → 422', async () => {
  writeConfig({});
  stubFetch(() => jsonResponse(NUGET_ENTRY));

  const { bridge, calls } = makeFakeBridge();
  const { baseUrl, close } = await startServer(bridge);
  try {
    const res = await postJson(`${baseUrl}/api/mcp/directory/install`, {
      name: 'com.example/dotnet-tool',
    });
    assert.equal(res.status, 422);
    assert.equal(calls.length, 0, 'addServer non appelé');
  } finally {
    await close();
    restoreFetch();
  }
});

test('POST /install — name manquant → 400', async () => {
  const { bridge, calls } = makeFakeBridge();
  const { baseUrl, close } = await startServer(bridge);
  try {
    const res = await postJson(`${baseUrl}/api/mcp/directory/install`, {});
    assert.equal(res.status, 400);
    assert.equal(calls.length, 0);
  } finally {
    await close();
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers de test
// ═══════════════════════════════════════════════════════════════════════════════

function postJson(url: string, body: unknown): Promise<Response> {
  return realFetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Reproduit le slugify de la route pour vérifier alreadyInstalled. */
function slugify(name: string): string {
  return name
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}
