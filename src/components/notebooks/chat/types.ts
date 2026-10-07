/**
 * Types partagés du sous-module Chat (NotebookChat).
 */

export interface Citation {
  sourceId: string;
  sourceTitle: string;
  chunkId: string;
  excerpt: string;
  relevance: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[];
  timestamp: string;
}

export interface SandboxFolder {
  path: string;
  name: string;
  depth: number;
}

export interface QueuedChatRequest {
  id: string;
  question: string;
  sourceIds?: string[];
  personality?: string;
  threadId?: string;
}

export interface ChatThreadSummary {
  id: string;
  title: string;
  createdAt: string;
}
