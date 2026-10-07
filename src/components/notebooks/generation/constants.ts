/**
 * Constantes du sous-module Generation : catalogues de types de documents et de
 * rapports (avec icônes lucide), thèmes de code, et helpers de libellé/couleur.
 */

import {
  FileBarChart, FileText, HelpCircle, GraduationCap, Briefcase, Clock, List,
  Brain, Lightbulb, Target, BookOpen, Zap, Sparkles,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface DocTypeEntry {
  key: string;
  label: string;
  icon: LucideIcon;
  desc: string;
  color: string;
}

export const DOC_TYPES: DocTypeEntry[] = [
  { key: 'full-report', label: 'Rapport complet', icon: FileBarChart, desc: 'Rapport pro : résumé exécutif, analyse, recommandations', color: 'var(--color-error)' },
  { key: 'summary', label: 'Résumé', icon: FileText, desc: 'Synthèse structurée des sources', color: 'var(--accent-primary)' },
  { key: 'faq', label: 'FAQ', icon: HelpCircle, desc: '15-20 questions/réponses', color: 'var(--color-accent-alt)' },
  { key: 'study-guide', label: 'Guide d\'étude', icon: GraduationCap, desc: 'Concepts, quiz, résumé', color: 'var(--color-success)' },
  { key: 'briefing', label: 'Briefing', icon: Briefcase, desc: 'Document exécutif concis', color: 'var(--color-warning)' },
  { key: 'timeline', label: 'Chronologie', icon: Clock, desc: 'Événements et jalons', color: 'var(--color-error)' },
  { key: 'outline', label: 'Plan', icon: List, desc: 'Structure hiérarchique', color: 'var(--accent-secondary)' },
  { key: 'mindmap', label: 'Carte mentale', icon: Brain, desc: 'Mindmap visuelle Mermaid', color: 'var(--color-error)' },
  { key: 'infographic', label: 'Infographie', icon: Lightbulb, desc: 'Visuel professionnel généré par IA', color: 'var(--color-warning)' },
  { key: 'swot', label: 'Analyse SWOT', icon: Target, desc: 'Forces, Faiblesses, Opportunités, Menaces', color: 'var(--color-info)' },
  { key: 'glossary', label: 'Glossaire', icon: BookOpen, desc: 'Termes techniques définis', color: 'var(--color-accent-alt)' },
  { key: 'roadmap', label: 'Roadmap', icon: Zap, desc: 'Roadmap projet auto-générée (business plan, étude de marché)', color: 'var(--color-warning)' },
];

/** Types de RAPPORTS disponibles dans le modal */
export const REPORT_TYPES: DocTypeEntry[] = [
  { key: 'report-business', label: 'Business Plan', icon: Briefcase, desc: 'Vision, modèle économique, stratégie et projections', color: 'var(--color-warning)' },
  { key: 'report-market', label: 'Étude de marché', icon: Target, desc: 'Taille du marché, segments, tendances, concurrence', color: 'var(--color-info)' },
  { key: 'report-technical', label: 'Rapport technique', icon: FileBarChart, desc: 'Architecture, choix techniques, spécifications', color: 'var(--accent-primary)' },
  { key: 'report-competitive', label: 'Analyse concurrentielle', icon: Target, desc: 'Positionnement, forces/faiblesses des concurrents', color: 'var(--color-accent-alt)' },
  { key: 'report-financial', label: 'Rapport financier', icon: FileBarChart, desc: 'Projections, coûts, rentabilité, KPIs', color: 'var(--color-success)' },
  { key: 'report-marketing', label: 'Plan marketing', icon: Sparkles, desc: 'Stratégie d\'acquisition, canaux, messaging', color: 'var(--color-error)' },
  { key: 'report-product', label: 'Rapport produit', icon: List, desc: 'Roadmap, fonctionnalités, priorisation, UX', color: 'var(--accent-secondary)' },
  { key: 'report-risk', label: 'Analyse des risques', icon: Target, desc: 'Risques identifiés, probabilité, mitigation', color: 'var(--color-error)' },
  { key: 'report-executive', label: 'Synthèse exécutive', icon: Briefcase, desc: 'Résumé décisionnel pour dirigeants', color: 'var(--color-error)' },
  { key: 'report-project', label: 'Rapport de projet', icon: Clock, desc: 'Avancement, livrables, jalons, blocages', color: 'var(--color-accent-alt)' },
];

/** Thèmes disponibles pour le code */
export const CODE_THEMES: Record<string, { bg: string; text: string; border: string }> = {
  default: { bg: 'var(--bg-base)', text: 'var(--text-primary)', border: 'var(--border-base)' },
};

export const MAX_PARALLEL_GENERATIONS = 3;

/** Types incompatibles avec la génération de slides. */
export const SLIDE_EXCLUDED_TYPES = new Set(['infographic', 'mindmap']);

/** Libellé affichable d'un type de document. */
export function getDocTypeLabel(typeKey: string): string {
  const docType = DOC_TYPES.find(t => t.key === typeKey) || REPORT_TYPES.find(t => t.key === typeKey);
  return docType?.label || typeKey;
}

/** Couleur associée à un type de document. */
export function getDocTypeColor(typeKey: string): string {
  const docType = DOC_TYPES.find(t => t.key === typeKey) || REPORT_TYPES.find(t => t.key === typeKey);
  return docType?.color || 'var(--text-muted)';
}
