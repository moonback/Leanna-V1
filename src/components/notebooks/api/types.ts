/**
 * Types partagés du module notebooks.
 *
 * Source unique de vérité pour les entités manipulées côté front, afin
 * d'éliminer les `any` disséminés dans les composants (sources, notes,
 * documents générés, messages de chat) et de typer les événements SSE.
 */

// ─── Entités ─────────────────────────────────────────────────────────────────

/** Source rattachée à un notebook (telle que rendue par SourcePanel). */
export interface Source {
  id: string;
  title: string;
  type: string;
  origin: string;
  summary: string;
  keywords: string[];
  wordCount: number;
  language: string;
  addedAt: string;
  chunksCount: number;
}

/** Note d'un notebook. */
export interface Note {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Document généré (rapport, résumé, mindmap, infographie…). */
export interface GeneratedDoc {
  id: string;
  type: string;
  title: string;
  content: string;
  sourceIds: string[];
  createdAt: string;
}

/** Citation attachée à un message assistant. */
export interface Citation {
  sourceId: string;
  sourceTitle: string;
  chunkId: string;
  excerpt: string;
  relevance: number;
}

/** Message de chat (utilisateur ou assistant). */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[];
  timestamp: string;
}

/** Fil de discussion du chat. */
export interface ChatThread {
  id: string;
  title: string;
  createdAt: string;
}

// ─── Événements SSE ──────────────────────────────────────────────────────────

/**
 * Frame SSE décodée par le helper streamSSE : le `event` (optionnel) provient
 * d'une ligne `event:`, le `data` est la charge JSON déjà parsée de la ligne
 * `data:`.
 */
export interface SseFrame<T = unknown> {
  event?: string;
  data: T;
}

/** Payloads `data:` du flux de chat (chat/stream, compare). */
export interface ChatStreamData {
  text?: string;
  message?: ChatMessage;
  error?: string;
}

/** Payloads `data:` du flux deep-dive. */
export interface DeepDiveStreamData {
  stage?: string;
  content?: string;
  message?: ChatMessage;
  error?: string;
}

/** Payloads `data:` du flux de génération de document. */
export interface GenerateStreamData {
  text?: string;
  document?: GeneratedDoc;
  error?: string;
}

/** Payloads `data:` des flux TTS (event-based : start / chunk / done / error). */
export interface TtsStreamData {
  total?: number;
  index?: number;
  audio?: string;
  error?: string;
}
