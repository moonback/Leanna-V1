/**
 * Types partagés du sous-module Audio Overview (podcast IA).
 * Extraits d'AudioOverviewPanel pour être réutilisés par AudioGenerator,
 * AudioPlayer et le hook useTtsPlayer.
 */

export interface AudioOverview {
  id: string;
  title: string;
  script: string;
  estimatedDuration: number;
  status: 'generating' | 'ready' | 'error';
  createdAt: string;
}

export interface AudioSource {
  id: string;
  title: string;
}

export type Tone = 'casual' | 'academic' | 'humorous' | 'professional';
