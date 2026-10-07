/**
 * ideActionBroadcaster.ts — Émetteur global d'actions IDE vers tous les clients WebSocket.
 *
 * Problème résolu : quand les agents autonomes (AgentRuntimeExecutor, AgentExecutor)
 * modifient des fichiers, ils n'ont pas accès au WebSocket du client Gemini Live
 * (celui-ci est construit dans handleToolCall de LiveSocketHandler).
 * Résultat : toolContext.emitIdeAction est undefined → les événements `file-changed`
 * ne sont jamais envoyés au frontend → les fichiers modifiés n'apparaissent pas
 * dans la sandbox.
 *
 * Solution : ce module maintient une référence vers le broadcaster WebSocket
 * enregistré par server.ts au démarrage. Tout code côté serveur peut appeler
 * `broadcastIdeAction(action)` pour envoyer un événement `ide-action` à TOUS
 * les clients /live connectés, indépendamment de la session Live active.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type IdeAction =
  | { type: "open-file"; path: string; line?: number; column?: number }
  | { type: "file-changed"; path: string }
  | { type: "open-ide" }
  | { type: "open-rich-document"; document: unknown; path?: string }
  | { type: string; [key: string]: unknown };

/** Fonction de broadcast fournie par server.ts au démarrage */
type BroadcastFn = (payload: string) => void;

// ── State ─────────────────────────────────────────────────────────────────────

let _broadcaster: BroadcastFn | null = null;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Enregistre la fonction de broadcast WebSocket.
 * À appeler UNE SEULE FOIS dans server.ts après la création du `wss`.
 *
 * @example
 * // Dans server.ts, après `const wss = new WebSocketServer({ noServer: true })`
 * import { registerIdeActionBroadcaster } from "./server/utils/ideActionBroadcaster.js";
 * registerIdeActionBroadcaster((payload) => {
 *   for (const client of wss.clients) {
 *     if (client.readyState === WebSocket.OPEN) {
 *       try { client.send(payload); } catch { }
 *     }
 *   }
 * });
 */
export function registerIdeActionBroadcaster(fn: BroadcastFn): void {
  _broadcaster = fn;
}

/**
 * Émet une action IDE vers tous les clients WebSocket /live connectés.
 * Silencieux si aucun broadcaster n'est enregistré (agents en test, CLI, etc.).
 */
export function broadcastIdeAction(action: IdeAction): void {
  if (!_broadcaster) return;
  try {
    _broadcaster(JSON.stringify({ type: "ide-action", action }));
  } catch {
    /* non bloquant */
  }
}

/**
 * Retourne un objet `emitIdeAction` compatible avec le toolContext,
 * basé sur le broadcaster global. Utilisé pour construire un context
 * minimal pour les agents autonomes.
 */
export function getGlobalEmitIdeAction(): ((action: IdeAction) => void) | undefined {
  if (!_broadcaster) return undefined;
  return (action: IdeAction) => broadcastIdeAction(action);
}
