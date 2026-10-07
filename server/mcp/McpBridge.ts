/**
 * MCP Bridge — Orchestrateur de serveurs MCP
 * 
 * Gère plusieurs connexions McpClient et expose leurs outils comme une Skill
 * unifiée dans le SkillManager de Leanna.
 * 
 * Fonctionnalités:
 * - Connexion/déconnexion de serveurs MCP à la volée
 * - Agrégation des outils de tous les serveurs connectés
 * - Conversion MCP → format Gemini Function Declaration (pour l'IA)
 * - Dispatch des appels d'outils vers le bon serveur
 * - Hot-reload de la configuration
 */
import { EventEmitter } from 'events';
import { McpClient, McpClientStatus, McpToolDefinition, McpToolResult } from './McpClient.js';
import { McpServerConfig, loadMcpConfig, upsertMcpServer, removeMcpServer } from './mcpConfig.js';
import { normalizeSelfPath, resolveRealPathWithinSelf } from '../utils/selfRoot.js';
import type { Skill } from '../skills/base.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface McpServerStatus {
  id: string;
  name: string;
  transport: 'stdio' | 'sse';
  status: McpClientStatus;
  tools: McpToolDefinition[];
  error: string | null;
  disabled: boolean;
}

export interface McpToolCallResult {
  serverId: string;
  toolName: string;
  result: McpToolResult;
  durationMs: number;
}

export interface McpToolCallMetric {
  toolName: string;
  serverId: string;
  durationMs: number;
  success: boolean;
  error?: string;
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// McpBridge
// ═══════════════════════════════════════════════════════════════════════════════

export class McpBridge extends EventEmitter {
  private clients = new Map<string, McpClient>();
  private configs = new Map<string, McpServerConfig>();
  private _initialized = false;

  /** Compteurs de tentatives de reconnexion en cours par serveur */
  private reconnectAttempts = new Map<string, number>();
  /** Timers de reconnexion actifs (pour pouvoir les annuler) */
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Timer du health-check périodique */
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  /** Historique des métriques d'appels (ring buffer, max 200) */
  private _metrics: McpToolCallMetric[] = [];
  private static readonly MAX_METRICS = 200;

  /**
   * Mapping nom sanitizé (exposé à Gemini) → nom d'outil MCP original.
   * Gemini exige des noms d'outils en [a-zA-Z0-9_] ; les serveurs MCP utilisent
   * souvent des tirets (ex. "resolve-library-id"). On expose une version
   * sanitizée au modèle et on retraduit vers l'original au moment de l'appel.
   */
  private toolNameMap = new Map<string, string>();

  /** Intervalle de health-check en ms (60s) */
  private static readonly HEALTH_CHECK_INTERVAL_MS = 60_000;
  /** Délai de base pour le backoff exponentiel (2s) */
  private static readonly RECONNECT_BASE_DELAY_MS = 2_000;
  /** Nombre max de retries par défaut */
  private static readonly DEFAULT_MAX_RETRIES = 5;

  /**
   * Initialise le bridge: charge la configuration et connecte les serveurs actifs
   */
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

    // Démarrer le health-check périodique
    this.startHealthCheck();

    console.log(`[MCP Bridge] ${this.configs.size} serveur(s) configuré(s), ${[...this.configs.values()].filter(c => !c.disabled).length} actif(s)`);
  }

  /**
   * Attend que les serveurs MCP configurés finissent leur tentative de connexion initiale
   * (avec un timeout maximal).
   */
  async waitForReady(timeoutMs: number = 5000): Promise<void> {
    const activeConfigs = Array.from(this.configs.entries()).filter(([_, c]) => !c.disabled);
    if (activeConfigs.length === 0) return;

    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const allResolvedOrConnected = activeConfigs.every(([id]) => {
        const client = this.clients.get(id);
        return client && client.status !== 'connecting';
      });
      if (allResolvedOrConnected) break;
      await new Promise(res => setTimeout(res, 100));
    }
  }

  /**
   * Arrête tous les clients MCP
   */
  async shutdown(): Promise<void> {
    console.log('[MCP Bridge] Arrêt...');

    // Stopper le health-check
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Annuler toutes les reconnexions programmées
    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();
    this.reconnectAttempts.clear();

    const disconnections = [...this.clients.values()].map(client => 
      client.disconnect().catch(() => {})
    );
    await Promise.allSettled(disconnections);
    this.clients.clear();
    this._initialized = false;
  }

  // ─── Server Management ──────────────────────────────────────────────────────

  /**
   * Connecte un serveur MCP par son ID
   */
  async connectServer(id: string): Promise<void> {
    const config = this.configs.get(id);
    if (!config) throw new Error(`Serveur MCP "${id}" non trouvé dans la configuration`);

    // Déconnecter l'ancien client si existant
    const existing = this.clients.get(id);
    if (existing) {
      await existing.disconnect();
      this.clients.delete(id);
    }

    const client = new McpClient(config);
    
    // Écouter les changements de status
    client.on('statusChange', (status: McpClientStatus) => {
      this.emit('serverStatusChange', { id, status });
      
      // Si le serveur passe en erreur de façon inattendue → auto-reconnexion
      if (status === 'error' && !config.disabled) {
        this.scheduleReconnect(id);
      }
    });
    
    client.on('toolsChanged', () => {
      this.emit('toolsChanged', this.getAllTools());
    });

    this.clients.set(id, client);
    await client.connect();
    
    // Connexion réussie — reset le compteur de reconnexion
    this.reconnectAttempts.delete(id);
    const timer = this.reconnectTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(id);
    }
    
    this.emit('toolsChanged', this.getAllTools());
  }

  /**
   * Déconnecte un serveur MCP par son ID
   */
  async disconnectServer(id: string): Promise<void> {
    this.cancelReconnect(id);
    const client = this.clients.get(id);
    if (client) {
      await client.disconnect();
      this.clients.delete(id);
      this.emit('toolsChanged', this.getAllTools());
    }
  }

  /**
   * Reconnecte un serveur MCP (utile après un changement de config)
   */
  async reconnectServer(id: string): Promise<void> {
    await this.disconnectServer(id);
    const config = this.configs.get(id);
    if (config && !config.disabled) {
      await this.connectServer(id);
    }
  }

  /**
   * Ajoute un nouveau serveur MCP et le connecte
   */
  async addServer(id: string, config: Omit<McpServerConfig, 'id'>): Promise<void> {
    const fullConfig: McpServerConfig = { ...config, id };
    this.configs.set(id, fullConfig);
    upsertMcpServer(id, config);
    
    if (!config.disabled) {
      await this.connectServer(id);
    }
    
    this.emit('configChanged');
  }

  /**
   * Met à jour la configuration d'un serveur et le reconnecte
   */
  async updateServer(id: string, config: Partial<Omit<McpServerConfig, 'id'>>): Promise<void> {
    const existing = this.configs.get(id);
    if (!existing) throw new Error(`Serveur MCP "${id}" non trouvé`);

    const updated: McpServerConfig = { ...existing, ...config };
    this.configs.set(id, updated);
    upsertMcpServer(id, updated);

    // Reconnexion si actif
    if (!updated.disabled) {
      await this.reconnectServer(id);
    } else {
      await this.disconnectServer(id);
    }

    this.emit('configChanged');
  }

  /**
   * Supprime un serveur MCP
   */
  async removeServer(id: string): Promise<void> {
    await this.disconnectServer(id);
    this.configs.delete(id);
    removeMcpServer(id);
    this.emit('configChanged');
  }

  /**
   * Active/désactive un serveur MCP
   */
  async toggleServer(id: string, enabled: boolean): Promise<void> {
    const config = this.configs.get(id);
    if (!config) throw new Error(`Serveur MCP "${id}" non trouvé`);

    config.disabled = !enabled;
    upsertMcpServer(id, config);

    if (enabled) {
      await this.connectServer(id);
    } else {
      await this.disconnectServer(id);
    }
    
    this.emit('configChanged');
  }

  // ─── Tool Access ────────────────────────────────────────────────────────────

  /**
   * Retourne tous les outils de tous les serveurs connectés
   */
  getAllTools(): Array<McpToolDefinition & { _mcpServerId: string }> {
    const tools: Array<McpToolDefinition & { _mcpServerId: string }> = [];
    // On reconstruit le mapping à chaque agrégation (les serveurs peuvent changer).
    this.toolNameMap.clear();

    for (const [id, client] of this.clients) {
      if (client.status === 'ready') {
        for (const tool of client.tools) {
          // Nom exposé au LLM : sanitizé pour respecter la contrainte Gemini
          // (^[a-zA-Z0-9_]+$). On mémorise la correspondance vers le nom réel.
          const exposedName = McpBridge.sanitizeToolName(tool.name);
          if (exposedName !== tool.name) {
            this.toolNameMap.set(exposedName, tool.name);
          }
          tools.push({ ...tool, name: exposedName, _mcpServerId: id });
        }
      }
    }

    return tools;
  }

  /**
   * Normalise un nom d'outil MCP pour Gemini : seuls [a-zA-Z0-9_] sont fiables
   * dans une functionDeclaration. Les tirets et autres caractères deviennent '_'.
   */
  private static sanitizeToolName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  /**
   * Appelle un outil sur le bon serveur MCP.
   * SECURITY: Valide tous les arguments de type path pour empêcher les sorties du SELF_ROOT.
   * Enregistre les métriques de chaque appel (durée, succès/erreur).
   */
  async callTool(toolName: string, args: Record<string, any>): Promise<McpToolCallResult> {
    const start = Date.now();
    let serverId = 'unknown';

    // Le LLM appelle l'outil par son nom sanitizé : retrouver le nom MCP réel.
    // Fallback sur toolName si aucun mapping (nom déjà valide).
    const realName = this.toolNameMap.get(toolName) ?? toolName;

    try {
      // ── Sandboxing : valider les arguments qui ressemblent à des chemins ──
      // Dans le try : si un chemin est rejeté, on enregistre la métrique
      // d'échec et on logge proprement au lieu de laisser fuiter l'exception.
      const sanitizedArgs = await this.sanitizePathArgs(args);

      // Trouver le serveur qui fournit cet outil (par son nom réel MCP)
      for (const [id, client] of this.clients) {
        if (client.status === 'ready') {
          const hasTool = client.tools.some(t => t.name === realName);
          if (hasTool) {
            serverId = id;
            const result = await client.callTool(realName, sanitizedArgs);
            const durationMs = Date.now() - start;

            // Enregistrer la métrique (sous le nom exposé, cohérent avec l'UI)
            this.recordMetric({ toolName, serverId, durationMs, success: true, timestamp: Date.now() });
            this.emit('toolCall', { toolName, serverId, durationMs, success: true });

            return { serverId, toolName, result, durationMs };
          }
        }
      }

      throw new Error(`Outil MCP "${toolName}" non trouvé sur aucun serveur connecté`);
    } catch (err: any) {
      const durationMs = Date.now() - start;
      this.recordMetric({ toolName, serverId, durationMs, success: false, error: err.message, timestamp: Date.now() });
      this.emit('toolCall', { toolName, serverId, durationMs, success: false, error: err.message });
      throw err;
    }
  }

  /**
   * SECURITY: Valide et sanitize récursivement les arguments qui contiennent
   * des chemins de fichiers. Rejette tout chemin qui sort du SELF_ROOT.
   *
   * Améliorations par rapport à la version initiale :
   *  1. **Récursion** sur les objets imbriqués et les tableaux — un chemin
   *     caché dans `{ options: { outputPath: "../../../etc/passwd" } }` est
   *     désormais détecté.
   *  2. **Résolution de symlinks** via `resolveRealPathWithinSelf()` (async) —
   *     protège contre les attaques de type "symlink escape" où un chemin
   *     apparemment valide pointe hors du SELF_ROOT après résolution.
   *  3. **Profondeur limitée** (max 8 niveaux) pour éviter les boucles sur
   *     des structures circulaires ou excessivement profondes.
   */
  private async sanitizePathArgs(
    args: Record<string, any>,
    depth: number = 0
  ): Promise<Record<string, any>> {
    const MAX_DEPTH = 8;
    const PATH_KEYS = [
      'path', 'file', 'filepath', 'filePath', 'file_path',
      'directory', 'dir', 'cwd', 'workdir',
      'target', 'source', 'destination', 'output', 'input',
    ];

    if (depth > MAX_DEPTH) return args;

    // Shallow copy at this level
    const sanitized: Record<string, any> = { ...args };

    for (const [key, value] of Object.entries(sanitized)) {
      // ── Récursion : objet imbriqué ────────────────────────────────────────
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        sanitized[key] = await this.sanitizePathArgs(value as Record<string, any>, depth + 1);
        continue;
      }

      // ── Récursion : tableau ───────────────────────────────────────────────
      if (Array.isArray(value)) {
        sanitized[key] = await Promise.all(
          value.map((item) =>
            item !== null && typeof item === 'object' && !Array.isArray(item)
              ? this.sanitizePathArgs(item as Record<string, any>, depth + 1)
              : Promise.resolve(item)
          )
        );
        continue;
      }

      // ── Valeur scalaire : vérifier si c'est un chemin ────────────────────
      if (typeof value !== 'string') continue;

      const isPathKey = PATH_KEYS.some(
        (pk) => key.toLowerCase().includes(pk.toLowerCase())
      );
      if (!isPathKey) continue;

      // ── Étape 1 : vérification rapide via normalizeSelfPath (sync) ────────
      // Rejette immédiatement les chemins manifestement hors périmètre.
      const normalized = normalizeSelfPath(value);
      if (!normalized) {
        throw new Error(
          `[MCP Security] L'argument "${key}" contient un chemin hors du périmètre autorisé: "${value}". ` +
          `Les outils MCP ne peuvent accéder qu'aux fichiers du repo Leanna.`
        );
      }

      // ── Étape 2 : résolution des symlinks (async) ─────────────────────────
      // Détecte les symlink-escapes : un chemin qui semble dans SELF_ROOT mais
      // dont la cible réelle est en dehors après résolution de liens symboliques.
      const real = await resolveRealPathWithinSelf(normalized);
      if (!real) {
        throw new Error(
          `[MCP Security] L'argument "${key}" pointe (via symlink) hors du périmètre autorisé: "${value}". ` +
          `Les outils MCP ne peuvent accéder qu'aux fichiers du repo Leanna.`
        );
      }

      sanitized[key] = real;
    }

    return sanitized;
  }

  // ─── Auto-Reconnection ───────────────────────────────────────────────────────

  /**
   * Programme une reconnexion automatique avec backoff exponentiel.
   * Respecte le maxRetries configuré par serveur.
   */
  private scheduleReconnect(id: string): void {
    const config = this.configs.get(id);
    if (!config || config.disabled) return;

    // Idempotence : si un timer est déjà programmé, ne pas le redoubler.
    if (this.reconnectTimers.has(id)) return;

    const maxRetries = config.maxRetries ?? McpBridge.DEFAULT_MAX_RETRIES;
    if (maxRetries === 0) return; // Reconnexion désactivée pour ce serveur

    const attempt = (this.reconnectAttempts.get(id) || 0) + 1;
    if (attempt > maxRetries) {
      console.warn(`[MCP Bridge] "${id}" — abandon reconnexion après ${maxRetries} tentatives`);
      this.reconnectAttempts.delete(id);
      return;
    }

    this.reconnectAttempts.set(id, attempt);

    // Backoff exponentiel: 2s, 4s, 8s, 16s, 32s...
    const delay = McpBridge.RECONNECT_BASE_DELAY_MS * Math.pow(2, attempt - 1);
    console.log(`[MCP Bridge] "${id}" — reconnexion dans ${(delay / 1000).toFixed(0)}s (tentative ${attempt}/${maxRetries})`);

    const timer = setTimeout(async () => {
      this.reconnectTimers.delete(id);
      try {
        await this.connectServer(id);
        console.log(`[MCP Bridge] ✓ "${id}" reconnecté avec succès (tentative ${attempt})`);
      } catch (err: any) {
        console.warn(`[MCP Bridge] ✗ "${id}" échec reconnexion (tentative ${attempt}):`, err.message);
        // La prochaine tentative sera programmée par le listener 'statusChange' → 'error'
      }
    }, delay);

    this.reconnectTimers.set(id, timer);
  }

  /**
   * Annule la reconnexion automatique pour un serveur (appelé lors de disable/remove)
   */
  private cancelReconnect(id: string): void {
    const timer = this.reconnectTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(id);
    }
    this.reconnectAttempts.delete(id);
  }

  // ─── Health Check ───────────────────────────────────────────────────────────

  /**
   * Démarre le health-check périodique qui vérifie que les serveurs répondent.
   */
  private startHealthCheck(): void {
    if (this.healthCheckInterval) return;

    this.healthCheckInterval = setInterval(async () => {
      for (const [id, client] of this.clients) {
        if (client.status !== 'ready') continue;

        const alive = await client.ping();
        if (!alive) {
          const config = this.configs.get(id);
          console.warn(`[MCP Bridge] Health-check: "${config?.name || id}" ne répond plus`);
          // Marquer comme déconnecté et tenter la reconnexion
          await client.disconnect().catch(() => {});
          this.clients.delete(id);
          this.emit('serverStatusChange', { id, status: 'error' });
          this.scheduleReconnect(id);
        }
      }
    }, McpBridge.HEALTH_CHECK_INTERVAL_MS);

    console.log(`[MCP Bridge] Health-check actif (intervalle: ${McpBridge.HEALTH_CHECK_INTERVAL_MS / 1000}s)`);
  }

  // ─── Metrics ────────────────────────────────────────────────────────────────

  /**
   * Enregistre une métrique d'appel d'outil (ring buffer)
   */
  private recordMetric(metric: McpToolCallMetric): void {
    this._metrics.push(metric);
    if (this._metrics.length > McpBridge.MAX_METRICS) {
      this._metrics.shift();
    }
  }

  /**
   * Retourne les métriques récentes d'appels d'outils
   */
  getMetrics(limit?: number): McpToolCallMetric[] {
    const n = limit || McpBridge.MAX_METRICS;
    return this._metrics.slice(-n);
  }

  /**
   * Retourne un résumé des métriques par serveur
   */
  getMetricsSummary(): Record<string, { calls: number; errors: number; avgMs: number }> {
    const summary: Record<string, { calls: number; errors: number; totalMs: number }> = {};

    for (const m of this._metrics) {
      if (!summary[m.serverId]) summary[m.serverId] = { calls: 0, errors: 0, totalMs: 0 };
      summary[m.serverId].calls++;
      if (!m.success) summary[m.serverId].errors++;
      summary[m.serverId].totalMs += m.durationMs;
    }

    const result: Record<string, { calls: number; errors: number; avgMs: number }> = {};
    for (const [id, s] of Object.entries(summary)) {
      result[id] = { calls: s.calls, errors: s.errors, avgMs: Math.round(s.totalMs / s.calls) };
    }
    return result;
  }

  // ─── Status ─────────────────────────────────────────────────────────────────

  /**
   * Retourne le status de tous les serveurs configurés
   */
  getServersStatus(): McpServerStatus[] {
    const statuses: McpServerStatus[] = [];
    
    for (const [id, config] of this.configs) {
      const client = this.clients.get(id);
      statuses.push({
        id,
        name: config.name,
        transport: config.transport,
        status: client?.status || 'disconnected',
        tools: client?.tools || [],
        error: client?.error || null,
        disabled: config.disabled || false,
      });
    }
    
    return statuses;
  }

  /**
   * Retourne le status d'un serveur spécifique
   */
  getServerStatus(id: string): McpServerStatus | null {
    const config = this.configs.get(id);
    if (!config) return null;
    
    const client = this.clients.get(id);
    return {
      id,
      name: config.name,
      transport: config.transport,
      status: client?.status || 'disconnected',
      tools: client?.tools || [],
      error: client?.error || null,
      disabled: config.disabled || false,
    };
  }

  // ─── Skill Adapter ──────────────────────────────────────────────────────────

  /**
   * Génère une Skill Leanna qui expose tous les outils MCP au système IA.
   * 
   * Convertit les définitions MCP (JSON Schema) en format Gemini Function Declaration.
   */
  toSkill(): Skill {
    const bridge = this;

    return {
      name: 'mcp',
      
      get declarations() {
        return bridge.getAllTools().map(tool => mcpToolToGeminiDeclaration(tool));
      },

      async handleToolCall(name: string, args: any, _context?: any) {
        try {
          const result = await bridge.callTool(name, args || {});
          
          // Convertir le résultat MCP en format texte simple pour Gemini
          const content = result.result.content || [];
          const textParts = content
            .filter(c => c.type === 'text' && c.text)
            .map(c => c.text!);
          
          if (result.result.isError) {
            return { error: true, message: textParts.join('\n') || 'Erreur MCP inconnue' };
          }

          // Si c'est un résultat simple texte
          if (textParts.length === 1) {
            // Tenter le parsing JSON pour les réponses structurées
            try {
              return JSON.parse(textParts[0]);
            } catch {
              return { result: textParts[0] };
            }
          }

          // Résultat multi-content
          return {
            result: textParts.join('\n'),
            contentCount: content.length,
            hasImages: content.some(c => c.type === 'image'),
            hasResources: content.some(c => c.type === 'resource'),
          };
        } catch (err: any) {
          return { error: true, message: err.message };
        }
      }
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers — Conversion MCP ↔ Gemini
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Convertit une définition d'outil MCP (JSON Schema) en Gemini Function Declaration
 */
function mcpToolToGeminiDeclaration(tool: McpToolDefinition & { _mcpServerId: string }): any {
  // Gemini utilise un format proche d'OpenAPI Schema
  const parameters = convertJsonSchemaToGemini(tool.inputSchema);
  
  return {
    name: tool.name,
    description: tool.description || `Outil MCP: ${tool.name} (serveur: ${tool._mcpServerId})`,
    parameters: parameters,
    // Marqueur conservé pour que le pipeline de sélection d'outils (LiveSocket)
    // reconnaisse les outils MCP et les expose toujours à l'assistant.
    _mcpServerId: tool._mcpServerId,
  };
}

/**
 * Convertit un JSON Schema MCP en format compatible Gemini
 */
function convertJsonSchemaToGemini(schema: any): any {
  if (!schema) return { type: 'OBJECT', properties: {} };

  const result: any = {};

  switch (schema.type) {
    case 'object':
      result.type = 'OBJECT';
      if (schema.properties) {
        result.properties = {};
        for (const [key, prop] of Object.entries(schema.properties as Record<string, any>)) {
          result.properties[key] = convertJsonSchemaToGemini(prop);
        }
      }
      if (schema.required) {
        result.required = schema.required;
      }
      break;
    case 'string':
      result.type = 'STRING';
      if (schema.description) result.description = schema.description;
      if (schema.enum) result.enum = schema.enum;
      break;
    case 'number':
    case 'integer':
      result.type = 'NUMBER';
      if (schema.description) result.description = schema.description;
      break;
    case 'boolean':
      result.type = 'BOOLEAN';
      if (schema.description) result.description = schema.description;
      break;
    case 'array':
      result.type = 'ARRAY';
      if (schema.items) result.items = convertJsonSchemaToGemini(schema.items);
      if (schema.description) result.description = schema.description;
      break;
    default:
      // Fallback: traiter comme string
      result.type = 'STRING';
      if (schema.description) result.description = schema.description;
  }

  if (schema.description && !result.description) {
    result.description = schema.description;
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Singleton
// ═══════════════════════════════════════════════════════════════════════════════

/** Instance globale du bridge MCP */
export const mcpBridge = new McpBridge();
