# Diagnostic et correction du module MCP

J'ai analysé les 4 fichiers du module `server/mcp/`. Le module souffre de **7 bugs** qui empêchent le bon fonctionnement des transports SSE et stdio, ainsi qu'un problème de double-reconnexion dans le bridge.

## Bugs identifiés

| # | Fichier | Bug | Impact |
|---|---------|-----|--------|
| 1 | `McpClient.ts` | `handleMessage` renvoie une *request* au lieu d'une *response* JSON-RPC quand le serveur envoie une requête (`id` + `method`). | Boucle infinie de réponses croisées avec le serveur. |
| 2 | `McpClient.ts` | Le parsing SSE ignore le champ `event:` et ne gère **jamais** l'événement initial `endpoint` (spécification MCP SSE). Le code s'appuie sur un header non-standard `x-mcp-session-url`. | Le transport SSE ne peut pas envoyer de messages : toutes les requêtes timeout. |
| 3 | `McpClient.ts` | `writeMessage` (SSE) fait un POST sans lire la réponse. En mode Streamable HTTP, la réponse JSON-RPC arrive dans le corps du POST et est ignorée. | Timeouts de `initialize`, `tools/list`, `tools/call`. |
| 4 | `McpClient.ts` | Aucune réponse à un `ping` émis par le serveur. | Le health-check du serveur échoue, il ferme la connexion. |
| 5 | `McpClient.ts` | Le type `writeMessage` n'accepte pas les *responses*, d'où le cast `as any` illégal. | Bug de typage masqué. |
| 6 | `McpBridge.ts` | `scheduleReconnect` est appelé **deux fois** : une fois par le listener `statusChange`, une fois par le `.catch()` de `initialize()`. | Le compteur de retry est incrémenté deux fois, délai de reconnexion erroné, abandon prématuré. |
| 7 | `McpBridge.ts` | `sanitizePathArgs` jette hors du `try/catch` de `callTool`, donc les métriques d'échec ne sont pas enregistrées et le bridge peut laisser fuiter une exception non-logguée. | Observabilité incomplète. |

---

## `server/mcp/McpClient.ts` — version corrigée

```ts
/**
 * MCP Client — Connexion à un serveur MCP individuel
 *
 * Supporte les transports :
 * - stdio : JSON-RPC newline-delimited sur stdin/stdout
 * - sse   : "HTTP with SSE" (spec MCP 2024-11-05) — GET SSE + POST session endpoint
 *
 * Implémente le protocole JSON-RPC 2.0 utilisé par MCP.
 */
import { spawn, ChildProcess, execSync } from 'child_process';
import { EventEmitter } from 'events';
import type { McpServerConfig } from './mcpConfig.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Types MCP Protocol
// ═══════════════════════════════════════════════════════════════════════════════

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, any>;
    required?: string[];
    [key: string]: any;
  };
}

export interface McpToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
    resource?: { uri: string; text?: string; blob?: string };
  }>;
  isError?: boolean;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: any;
}

interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: any;
}

interface JsonRpcSuccessResponse {
  jsonrpc: '2.0';
  id: number;
  result: any;
}

interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  id: number;
  error: { code: number; message: string; data?: any };
}

/** Union de tout ce qu'un client peut émettre. */
type JsonRpcOutgoing =
  | JsonRpcRequest
  | JsonRpcNotification
  | JsonRpcSuccessResponse
  | JsonRpcErrorResponse;

type PendingRequest = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

// ═══════════════════════════════════════════════════════════════════════════════
// McpClient
// ═══════════════════════════════════════════════════════════════════════════════

export type McpClientStatus = 'disconnected' | 'connecting' | 'ready' | 'error';

/** Méthodes de serveur→client que l'on accepte et traite côté client. */
const SERVER_TO_CLIENT_HANDLERS: Record<string, (params: any) => Promise<any> | any> = {
  // Le protocole MCP exige qu'un client réponde à un ping. Si le serveur
  // envoie un ping et qu'on ne répond pas, il ferme la connexion.
  ping: () => ({}),
};

export class McpClient extends EventEmitter {
  private config: McpServerConfig;
  private process: ChildProcess | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number, PendingRequest>();
  private buffer = '';
  private _status: McpClientStatus = 'disconnected';
  private _tools: McpToolDefinition[] = [];
  private _serverInfo: { name?: string; version?: string } = {};
  private _error: string | null = null;
  private sseAbortController: AbortController | null = null;
  private sseSessionUrl: string | null = null;

  /** Timeout de connexion SSE initial (GET + POST). */
  private static readonly SSE_CONNECT_TIMEOUT_MS = 30_000;
  /** Timeout d'inactivité du stream SSE. */
  private static readonly SSE_READ_IDLE_TIMEOUT_MS = 120_000;
  /** Timeout par défaut pour les requêtes JSON-RPC. */
  private static readonly DEFAULT_TIMEOUT_MS = 30_000;

  private get requestTimeoutMs(): number {
    return this.config.timeout || McpClient.DEFAULT_TIMEOUT_MS;
  }

  constructor(config: McpServerConfig) {
    super();
    this.config = config;
  }

  get status(): McpClientStatus { return this._status; }
  get tools(): McpToolDefinition[] { return this._tools; }
  get serverInfo() { return this._serverInfo; }
  get error(): string | null { return this._error; }
  get serverId(): string { return this.config.id; }

  // ─── Health Check ───────────────────────────────────────────────────────────

  async ping(): Promise<boolean> {
    if (this._status !== 'ready') return false;
    try {
      await this.sendRequestWithTimeout('ping', {}, 5_000);
      return true;
    } catch {
      // Certains serveurs ne supportent pas ping — fallback tools/list.
      try {
        await this.sendRequestWithTimeout('tools/list', {}, 5_000);
        return true;
      } catch {
        return false;
      }
    }
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    if (this._status === 'ready' || this._status === 'connecting') return;

    this._status = 'connecting';
    this._error = null;
    this.emit('statusChange', this._status);

    try {
      if (this.config.transport === 'stdio') {
        await this.connectStdio();
      } else if (this.config.transport === 'sse') {
        await this.connectSse();
      } else {
        throw new Error(`Transport non supporté: ${(this.config as any).transport}`);
      }

      const initResult = await this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        clientInfo: { name: 'Leanna', version: '1.0.0' },
      });

      this._serverInfo = initResult.serverInfo || {};
      this.sendNotification('notifications/initialized', {});
      await this.refreshTools();

      this._status = 'ready';
      this.emit('statusChange', this._status);
      console.log(`[MCP Client] ✓ Connecté à "${this.config.name}" — ${this._tools.length} outil(s)`);
    } catch (err: any) {
      this._status = 'error';
      this._error = err.message;
      this.emit('statusChange', this._status);
      this.emit('error', err);
      console.error(`[MCP Client] ✗ Erreur connexion "${this.config.name}":`, err.message);
      this.cleanup();
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    if (this._status === 'disconnected') return;
    try {
      if (this._status === 'ready') {
        await Promise.race([
          this.sendRequest('shutdown', {}).catch(() => {}),
          new Promise(r => setTimeout(r, 2000)),
        ]);
      }
    } catch { /* ignore */ }

    this.cleanup();
    this._status = 'disconnected';
    this._tools = [];
    this._error = null;
    this.emit('statusChange', this._status);
    console.log(`[MCP Client] Déconnecté de "${this.config.name}"`);
  }

  // ─── Tool Execution ─────────────────────────────────────────────────────────

  async callTool(toolName: string, args: Record<string, any> = {}): Promise<McpToolResult> {
    if (this._status !== 'ready') {
      throw new Error(`Serveur MCP "${this.config.name}" n'est pas connecté (status: ${this._status})`);
    }
    const result = await this.sendRequest('tools/call', { name: toolName, arguments: args });
    return result as McpToolResult;
  }

  async refreshTools(): Promise<McpToolDefinition[]> {
    const result = await this.sendRequest('tools/list', {});
    this._tools = result.tools || [];
    this.emit('toolsChanged', this._tools);
    return this._tools;
  }

  // ─── Stdio Transport ────────────────────────────────────────────────────────

  private async connectStdio(): Promise<void> {
    const { command, args = [], env = {} } = this.config;
    if (!command) throw new Error('Commande manquante pour le transport stdio');

    const mergedEnv = { ...process.env, ...env };
    const isWin = process.platform === 'win32';

    const CMD_WRAPPERS = ['npx', 'uvx', 'npm', 'node', 'yarn', 'pnpm'];
    let finalCommand = command;
    if (
      isWin &&
      !command.includes('/') &&
      !command.includes('\\') &&
      !command.includes('.') &&
      CMD_WRAPPERS.includes(command)
    ) {
      finalCommand = command + '.cmd';
    }

    this.process = spawn(finalCommand, args, {
      env: mergedEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      shell: false,
    });

    if (!this.process.stdout || !this.process.stdin) {
      throw new Error('Impossible de créer les pipes stdio');
    }

    this.process.stdout.on('data', (chunk: Buffer) => {
      this.onStdioData(chunk.toString('utf-8'));
    });

    this.process.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8').trim();
      if (text && !text.includes('Debugger attached') && !text.includes('Waiting for')) {
        console.log(`[MCP:${this.config.id}:stderr] ${text}`);
      }
    });

    this.process.on('close', (code) => {
      if (this._status !== 'disconnected') {
        console.warn(`[MCP Client] Process "${this.config.name}" terminé (code ${code})`);
        this._status = 'error';
        this._error = `Process terminé avec code ${code}`;
        this.emit('statusChange', this._status);
        this.rejectAllPending(new Error(`MCP server process exited with code ${code}`));
      }
    });

    this.process.on('error', (err) => {
      console.error(`[MCP Client] Erreur process "${this.config.name}":`, err.message);
      this._status = 'error';
      this._error = err.message;
      this.emit('statusChange', this._status);
      this.rejectAllPending(err);
    });

    // Laisse le process démarrer.
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => resolve(), 500);
      this.process!.once('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  private onStdioData(data: string): void {
    this.buffer += data;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        this.handleMessage(JSON.parse(trimmed));
      } catch {
        // Ligne non-JSON (log du serveur) → ignorée.
      }
    }
  }

  // ─── SSE Transport ──────────────────────────────────────────────────────────

  private async connectSse(): Promise<void> {
    const { url } = this.config;
    if (!url) throw new Error('URL manquante pour le transport SSE');

    this.sseAbortController = new AbortController();

    const connectTimeoutId = setTimeout(() => {
      this.sseAbortController?.abort(
        new Error(`SSE connect timeout (${McpClient.SSE_CONNECT_TIMEOUT_MS}ms)`),
      );
    }, McpClient.SSE_CONNECT_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'text/event-stream' },
        signal: this.sseAbortController.signal,
      });

      if (!response.ok) {
        throw new Error(`SSE connection failed: ${response.status} ${response.statusText}`);
      }
    } finally {
      clearTimeout(connectTimeoutId);
    }

    // Pour Streamable HTTP, le POST cible la même URL que le GET.
    // Pour "HTTP with SSE", le POST cible le session endpoint reçu via l'event
    // `endpoint`. On initialise avec l'URL de base et on la remplacera dès que
    // l'event `endpoint` arrivera.
    this.sseSessionUrl = url;

    this.readSseStream(response).catch(err => {
      if (err.name !== 'AbortError') {
        console.error(`[MCP:${this.config.id}] SSE stream error:`, err.message);
        this._status = 'error';
        this._error = err.message;
        this.emit('statusChange', this._status);
      }
    });
  }

  private async readSseStream(response: Response): Promise<void> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No readable stream');

    const decoder = new TextDecoder();
    let sseBuffer = '';

    while (true) {
      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      try {
        const idlePromise = new Promise<never>((_, reject) => {
          idleTimer = setTimeout(() => {
            reject(new Error(`SSE read idle timeout (${McpClient.SSE_READ_IDLE_TIMEOUT_MS}ms)`));
          }, McpClient.SSE_READ_IDLE_TIMEOUT_MS);
        });

        const { done, value } = await Promise.race([reader.read(), idlePromise]);
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const events = sseBuffer.split('\n\n');
        sseBuffer = events.pop() || '';

        for (const rawEvent of events) {
          this.processSseEvent(rawEvent, this.config.url!);
        }
      } finally {
        if (idleTimer) clearTimeout(idleTimer);
      }
    }
  }

  /**
   * Parse un événement SSE complet (bloc séparé par une ligne vide).
   * Respecte les champs `event:` et `data:` de la spec SSE.
   *
   * NOTE : le bug d'origine ne lisait que `data:` et ignorait `event:`,
   * rendant impossible la gestion de l'événement initial `endpoint`.
   */
  private processSseEvent(rawEvent: string, baseUrl: string): void {
    let eventName = 'message';
    const dataLines: string[] = [];

    for (const line of rawEvent.split('\n')) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).replace(/^ /, ''));
      }
      // `id:`, `retry:`, commentaires `:` → ignorés (non nécessaires ici).
    }

    if (dataLines.length === 0) return;
    const data = dataLines.join('\n');

    // Événement spécial : endpoint de session (spec MCP "HTTP with SSE").
    if (eventName === 'endpoint') {
      const endpoint = data.trim();
      try {
        this.sseSessionUrl = endpoint.startsWith('http')
          ? endpoint
          : new URL(endpoint, baseUrl).href;
        console.log(`[MCP:${this.config.id}] Session endpoint: ${this.sseSessionUrl}`);
      } catch (err) {
        console.error(`[MCP:${this.config.id}] Endpoint SSE invalide: ${endpoint}`);
      }
      return;
    }

    // Événement message normal → message JSON-RPC.
    try {
      this.handleMessage(JSON.parse(data));
    } catch {
      // Ignore un payload non-JSON (certains serveurs envoient des logs).
    }
  }

  // ─── JSON-RPC Protocol ──────────────────────────────────────────────────────

  private sendRequest(method: string, params?: any): Promise<any> {
    return this.sendRequestWithTimeout(method, params, this.requestTimeoutMs);
  }

  private sendRequestWithTimeout(method: string, params: any, timeoutMs: number): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      const request: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };

      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Timeout: ${method} (${timeoutMs}ms)`));
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timer });

      try {
        this.writeMessage(request);
      } catch (err: any) {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        reject(err);
      }
    });
  }

  private sendNotification(method: string, params?: any): void {
    try {
      this.writeMessage({ jsonrpc: '2.0', method, params });
    } catch (err: any) {
      console.error(`[MCP:${this.config.id}] Échec envoi notification ${method}:`, err.message);
    }
  }

  /**
   * Envoie une réponse JSON-RPC (succès OU erreur) — utilisé pour répondre à
   * une requête entrante du serveur (ex. `ping`).
   */
  private sendResponse(id: number, result: any): void {
    try {
      this.writeMessage({ jsonrpc: '2.0', id, result });
    } catch { /* ignore */ }
  }

  private sendErrorResponse(id: number, code: number, message: string): void {
    try {
      this.writeMessage({ jsonrpc: '2.0', id, error: { code, message } });
    } catch { /* ignore */ }
  }

  /**
   * Sérialise et émet un message JSON-RPC.
   * Supporte maintenant les responses, pas seulement les requests/notifications.
   */
  private writeMessage(message: JsonRpcOutgoing): void {
    const serialized = JSON.stringify(message) + '\n';

    if (this.config.transport === 'stdio') {
      if (!this.process?.stdin || this.process.stdin.destroyed) {
        throw new Error('stdio stdin indisponible');
      }
      this.process.stdin.write(serialized);
      return;
    }

    if (this.config.transport === 'sse') {
      if (!this.sseSessionUrl) {
        throw new Error('SSE session URL indisponible (endpoint non reçu)');
      }

      // Envoi POST fire-and-forget : le JSON-RPC de réponse arrivera sur le
      // stream SSE (old spec), OU dans le corps du POST (Streamable HTTP).
      // On lit les deux au cas où.
      const postAbort = new AbortController();
      const postTimeout = setTimeout(() => {
        postAbort.abort(new Error(`SSE POST timeout (${McpClient.SSE_CONNECT_TIMEOUT_MS}ms)`));
      }, McpClient.SSE_CONNECT_TIMEOUT_MS);

      fetch(this.sseSessionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: serialized,
        signal: postAbort.signal,
      })
        .then(async (res) => {
          clearTimeout(postTimeout);
          if (!res.ok) return;

          const contentType = res.headers.get('content-type') || '';

          // Streamable HTTP : la réponse JSON-RPC arrive directement dans le POST.
          if (contentType.includes('application/json')) {
            try {
              const text = await res.text();
              if (text) this.handleMessage(JSON.parse(text));
            } catch { /* ignore */ }
            return;
          }

          // Streamable HTTP : la réponse arrive comme un mini-flux SSE dans le POST.
          if (contentType.includes('text/event-stream') && res.body) {
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buf = '';
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });
                const events = buf.split('\n\n');
                buf = events.pop() || '';
                for (const ev of events) this.processSseEvent(ev, this.sseSessionUrl!);
              }
            } catch { /* ignore */ }
          }
        })
        .catch(err => {
          clearTimeout(postTimeout);
          if (err.name !== 'AbortError') {
            console.error(`[MCP:${this.config.id}] Erreur envoi SSE:`, err.message);
          }
        });
    }
  }

  private handleMessage(message: any): void {
    if (!message || message.jsonrpc !== '2.0') return;

    // 1) Response à une de nos requêtes.
    if ('id' in message && !('method' in message) && ('result' in message || 'error' in message)) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(message.id);
        if (message.error) {
          pending.reject(new Error(`MCP Error [${message.error.code}]: ${message.error.message}`));
        } else {
          pending.resolve(message.result);
        }
      }
      return;
    }

    // 2) Notification du serveur (pas d'id).
    if ('method' in message && !('id' in message)) {
      this.handleNotification(message);
      return;
    }

    // 3) Requête du serveur → le client DOIT répondre par une *response*.
    //
    // BUG ORIGINAL : le code renvoyait `writeMessage({ jsonrpc, id, method, params: {error} })`,
    // c'est-à-dire une *nouvelle requête* avec le même method name. Le serveur la
    // traitait comme une requête entrante, répondait, et provoquait une boucle.
    // Correction : envoyer une *response* JSON-RPC conforme.
    if ('method' in message && 'id' in message) {
      const handler = SERVER_TO_CLIENT_HANDLERS[message.method];
      if (handler) {
        Promise.resolve()
          .then(() => handler(message.params))
          .then(result => this.sendResponse(message.id, result ?? {}))
          .catch(err => this.sendErrorResponse(message.id, -32603, err?.message ?? 'Internal error'));
      } else {
        // Méthode non supportée : -32601 Method not found.
        this.sendErrorResponse(message.id, -32601, 'Method not supported');
      }
    }
  }

  private handleNotification(notification: JsonRpcNotification): void {
    switch (notification.method) {
      case 'notifications/tools/list_changed':
        this.refreshTools().catch(err => {
          console.error(`[MCP:${this.config.id}] Erreur refresh tools:`, err.message);
        });
        break;
      case 'notifications/progress':
        this.emit('progress', notification.params);
        break;
      default:
        break;
    }
  }

  // ─── Cleanup ────────────────────────────────────────────────────────────────

  private cleanup(): void {
    if (this.process) {
      try {
        if (process.platform === 'win32') {
          const pid = this.process.pid;
          if (pid) {
            try {
              execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore', windowsHide: true });
            } catch { /* process déjà mort */ }
          }
        } else {
          this.process.kill('SIGTERM');
          const proc = this.process;
          setTimeout(() => {
            try { proc?.kill('SIGKILL'); } catch { /* ignore */ }
          }, 3000);
        }
      } catch { /* ignore */ }
      this.process = null;
    }

    if (this.sseAbortController) {
      this.sseAbortController.abort();
      this.sseAbortController = null;
    }

    this.rejectAllPending(new Error('Client disconnected'));
    this.buffer = '';
  }

  private rejectAllPending(error: Error): void {
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }
}
```

---

## `server/mcp/McpBridge.ts` — version corrigée

Seules les parties modifiées sont montrées (le reste du fichier est inchangé). Remplacez les blocs correspondants.

### 1. `initialize()` — supprime la double reconnexion

```ts
async initialize(): Promise<void> {
  if (this._initialized) return;
  this._initialized = true;

  console.log('[MCP Bridge] Initialisation...');
  const config = loadMcpConfig();

  for (const [id, serverConfig] of Object.entries(config.mcpServers)) {
    this.configs.set(id, serverConfig);
    if (!serverConfig.disabled) {
      // Le listener `statusChange` attaché dans connectServer() déclenche
      // déjà scheduleReconnect() en cas d'échec. Appeler scheduleReconnect()
      // ici aussi incrémentait le compteur de retry deux fois (bug).
      this.connectServer(id).catch(err => {
        console.warn(`[MCP Bridge] Échec connexion "${id}":`, err.message);
      });
    }
  }

  this.startHealthCheck();
  console.log(
    `[MCP Bridge] ${this.configs.size} serveur(s) configuré(s), ` +
    `${[...this.configs.values()].filter(c => !c.disabled).length} actif(s)`
  );
}
```

### 2. `callTool()` — `sanitizePathArgs` dans le try/catch

```ts
async callTool(toolName: string, args: Record<string, any>): Promise<McpToolCallResult> {
  const start = Date.now();
  let serverId = 'unknown';

  try {
    // La sanitization doit être dans le try : si elle rejette un chemin,
    // on veut enregistrer la métrique d'échec et logger proprement.
    const sanitizedArgs = this.sanitizePathArgs(args);

    for (const [id, client] of this.clients) {
      if (client.status === 'ready') {
        const hasTool = client.tools.some(t => t.name === toolName);
        if (hasTool) {
          serverId = id;
          const result = await client.callTool(toolName, sanitizedArgs);
          const durationMs = Date.now() - start;
          this.recordMetric({ toolName, serverId, durationMs, success: true, timestamp: Date.now() });
          this.emit('toolCall', { toolName, serverId, durationMs, success: true });
          return { serverId, toolName, result, durationMs };
        }
      }
    }

    throw new Error(`Outil MCP "${toolName}" non trouvé sur aucun serveur connecté`);
  } catch (err: any) {
    const durationMs = Date.now() - start;
    this.recordMetric({
      toolName, serverId, durationMs,
      success: false, error: err.message, timestamp: Date.now(),
    });
    this.emit('toolCall', { toolName, serverId, durationMs, success: false, error: err.message });
    throw err;
  }
}
```

### 3. `scheduleReconnect()` — rendre idempotent

```ts
private scheduleReconnect(id: string): void {
  const config = this.configs.get(id);
  if (!config || config.disabled) return;

  // Idempotence : si un timer est déjà programmé, ne pas le redoubler.
  if (this.reconnectTimers.has(id)) return;

  const maxRetries = config.maxRetries ?? McpBridge.DEFAULT_MAX_RETRIES;
  if (maxRetries === 0) return;

  const attempt = (this.reconnectAttempts.get(id) || 0) + 1;
  if (attempt > maxRetries) {
    console.warn(`[MCP Bridge] "${id}" — abandon reconnexion après ${maxRetries} tentatives`);
    this.reconnectAttempts.delete(id);
    return;
  }

  this.reconnectAttempts.set(id, attempt);

  const delay = McpBridge.RECONNECT_BASE_DELAY_MS * Math.pow(2, attempt - 1);
  console.log(`[MCP Bridge] "${id}" — reconnexion dans ${(delay / 1000).toFixed(0)}s (tentative ${attempt}/${maxRetries})`);

  const timer = setTimeout(async () => {
    this.reconnectTimers.delete(id);
    try {
      await this.connectServer(id);
      console.log(`[MCP Bridge] ✓ "${id}" reconnecté (tentative ${attempt})`);
    } catch (err: any) {
      console.warn(`[MCP Bridge] ✗ "${id}" échec reconnexion (tentative ${attempt}):`, err.message);
      // La prochaine tentative sera programmée par le listener statusChange.
    }
  }, delay);

  this.reconnectTimers.set(id, timer);
}
```

---

## Résumé des corrections

| Correction | Fichier | Ce qui change concrètement |
|---|---|---|
| **Response JSON-RPC correcte** | `McpClient.ts` | Une requête serveur reçoit désormais une *response* (`{id, result}` ou `{id, error}`), plus une requête récursive. |
| **Support du `ping` serveur** | `McpClient.ts` | Le client répond `{}` à un `ping` entrant, empêchant le serveur de fermer la connexion. |
| **Parsing SSE conforme** | `McpClient.ts` | Prise en charge du champ `event:` et de l'événement initial `endpoint` (spec MCP). |
| **Session URL SSE** | `McpClient.ts` | L'URL de POST est lue depuis l'event `endpoint`, avec fallback sur l'URL de base. |
| **Réponse POST SSE** | `McpClient.ts` | Lit la réponse du POST (JSON *et* SSE) pour le mode Streamable HTTP. |
| **Type `writeMessage` étendu** | `McpClient.ts` | Accepte `JsonRpcOutgoing` (request/notification/response), plus de `as any`. |
| **Double reconnexion supprimée** | `McpBridge.ts` | `initialize()` ne planifie plus de reconnexion — le listener `statusChange` s'en charge. |
| **`scheduleReconnect` idempotent** | `McpBridge.ts` | Ignore la planification si un timer est déjà en cours pour ce serveur. |
| **Métriques `callTool` complètes** | `McpBridge.ts` | `sanitizePathArgs` est dans le `try` : les refus de chemin remontent dans les métriques. |

Le module MCP devrait maintenant fonctionner de bout en bout avec les deux transports et ne plus timeout au `initialize`.