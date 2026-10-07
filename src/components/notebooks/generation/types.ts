/**
 * Types partagés du sous-module Generation (documents générés).
 * Extraits de GeneratePanel.
 */

export interface SourceItem {
  id: string;
  title: string;
  type: string;
}

export interface GeneratedDoc {
  id: string;
  type: string;
  title: string;
  content: string;
  sourceIds: string[];
  createdAt: string;
}

/** Tâche dans la file d'attente de génération. */
export interface QueuedGeneration {
  id: string;
  type: string;
  sourceIds?: string[];
  customInstructions?: string;
  title: string;
  progress: number; // 0-100
  status: 'pending' | 'generating' | 'completed' | 'error';
  createdAt: number;
}

/** Doc minimal passé via les props fullView (onViewDoc / initialDoc). */
export interface DocRef {
  id: string;
  title: string;
  type: string;
  content: string;
  createdAt: string;
}
