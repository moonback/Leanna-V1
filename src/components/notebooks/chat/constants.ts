/**
 * Constantes du sous-module Chat : commandes slash, suggestions de contexte et
 * personnalités (ton de l'assistant). Hissées hors des useMemo du composant.
 */

import { Bot, GraduationCap, Lightbulb, Zap, BookOpen, Palette } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const SLASH_COMMANDS = [
  { cmd: '/résume', desc: 'Résumer les sources', prompt: 'Résume les sources principales de ce notebook' },
  { cmd: '/compare', desc: 'Comparer les sources', prompt: 'Compare les sources entre elles en identifiant les points communs et divergences' },
  { cmd: '/quiz', desc: 'Générer un quiz', prompt: 'Génère un quiz de 10 questions avec réponses basé sur les sources' },
  { cmd: '/insights', desc: 'Extraire les insights', prompt: 'Extrais les insights et conclusions clés des sources' },
  { cmd: '/glossaire', desc: 'Créer un glossaire', prompt: 'Crée un glossaire des termes importants trouvés dans les sources' },
  { cmd: '/plan', desc: 'Plan de révision', prompt: 'Crée un plan de révision structuré basé sur les sources' },
];

export const CONTEXT_SUGGESTIONS = [
  { label: "Suggère moi des améliorations", prompt: "Suggère moi des améliorations pour ce contenu" },
  { label: "Résumé complet", prompt: "Fais un résumé complet de toutes les sources" },
  { label: "Points clés", prompt: "Quels sont les points clés à retenir de ces sources?" },
  { label: "Actions recommandées", prompt: "Quelles actions ou décisions recommandes-tu basé sur ce contenu?" },
  { label: "Analyse complète", prompt: "Fais une analyse complète et détaillée du contenu" },
  { label: "Lacunes et opportunités", prompt: "Quelles sont les lacunes, faiblesses ou opportunités dans ces sources?" },
];

export interface Personality {
  id: string;
  label: string;
  icon: LucideIcon;
  desc: string;
}

export const PERSONALITIES: Personality[] = [
  { id: 'default', label: 'Standard', icon: Bot, desc: 'Réponses équilibrées et claires' },
  { id: 'academic', label: 'Académique', icon: GraduationCap, desc: 'Ton formel, citations, rigueur scientifique' },
  { id: 'simple', label: 'Vulgarisateur', icon: Lightbulb, desc: 'Explications simples, analogies, accessible' },
  { id: 'concise', label: 'Concis', icon: Zap, desc: 'Réponses courtes et directes, bullet points' },
  { id: 'detailed', label: 'Détaillé', icon: BookOpen, desc: 'Analyses approfondies, exemples multiples' },
  { id: 'creative', label: 'Créatif', icon: Palette, desc: 'Ton engageant, métaphores, storytelling' },
];
