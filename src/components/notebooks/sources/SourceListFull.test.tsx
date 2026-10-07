/**
 * Test de CARACTÉRISATION de SourceListFull — bascule animé ↔ virtualisé.
 *
 * Verrouille le comportement de performance introduit en Phase 3b :
 *  - sous le seuil (VIRTUALIZE_THRESHOLD = 40), le chemin animé rend TOUTES les
 *    cartes dans le DOM (motion/AnimatePresence) ;
 *  - au-dessus du seuil, react-window fenêtre la liste : seules les cartes
 *    visibles (+ overscan) sont montées, donc STRICTEMENT moins que le total.
 *
 * On vérifie le comportement observable (nombre de cartes dans le DOM), pas la
 * lib : c'est ce qui garantit qu'on ne régresse pas la bascule.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SourceListFull } from './SourceListFull.js';
import type { SourceItem } from './constants.js';

function makeSources(n: number): SourceItem[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `s-${i}`,
    title: `Source ${i}`,
    type: 'text',
    origin: 'upload',
    summary: `Résumé ${i}`,
    keywords: [],
    wordCount: 100 + i,
    language: 'fr',
    addedAt: new Date().toISOString(),
    chunksCount: 1,
  }));
}

const noop = () => {};
const baseProps = {
  searchQuery: '',
  dragOver: false,
  selectedSources: [] as string[],
  expandedSource: null,
  loadingPreview: false,
  sourcePreview: {} as Record<string, string>,
  reindexingId: null,
  tagInput: null,
  prefersReducedMotion: true,
  spring: { duration: 0 },
  tapScale: {},
  onToggleSelect: noop,
  onTogglePreview: noop,
  onReindex: noop,
  onDelete: noop,
  onRemoveTag: noop,
  onAddTag: noop,
  setTagInput: noop,
};

/** Compte les cartes réellement montées via leur bouton de suppression. */
function countCards(): number {
  return screen.queryAllByRole('button', { name: /^Supprimer / }).length;
}

describe('SourceListFull — bascule animé ↔ virtualisé (caractérisation)', () => {
  it('sous le seuil : rend toutes les cartes (chemin animé)', () => {
    const sources = makeSources(10);
    render(<SourceListFull {...baseProps} sources={sources} filteredSources={sources} />);
    expect(countCards()).toBe(10);
    expect(screen.getByText('Source 0')).toBeInTheDocument();
    expect(screen.getByText('Source 9')).toBeInTheDocument();
  });

  it('au-dessus du seuil : fenêtre la liste (chemin virtualisé)', () => {
    const sources = makeSources(60);
    render(<SourceListFull {...baseProps} sources={sources} filteredSources={sources} />);
    const rendered = countCards();
    // Virtualisation : strictement moins que le total monté dans le DOM.
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(60);
  });

  it('liste vide : affiche l\u2019état d\u2019accueil', () => {
    render(<SourceListFull {...baseProps} sources={[]} filteredSources={[]} />);
    expect(screen.getByText('Ajoutez vos premières sources')).toBeInTheDocument();
    expect(countCards()).toBe(0);
  });
});
