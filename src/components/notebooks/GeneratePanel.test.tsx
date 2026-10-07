/**
 * Test de CARACTÉRISATION de GeneratePanel — flux de génération de document.
 *
 * Verrouille le comportement ACTUEL avant découpage :
 *  - sans source, la génération est refusée (toast d'erreur) ;
 *  - avec au moins une source, cliquer un type de document lance une génération ;
 *  - un POST est émis vers /generate/stream avec le bon `type` ;
 *  - à réception du frame `document`, un toast de succès s'affiche et onRefresh
 *    est appelé.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { GeneratePanel } from './GeneratePanel.js';
import {
  renderWithProviders,
  mockFetchRouter,
  jsonResponse,
  sseResponse,
  sseData,
} from '../../test/helpers.js';

const SOURCE = { id: 'src-1', title: 'Ma source', type: 'text' };

describe('GeneratePanel — génération de document (caractérisation)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("désactive les types de document et n'émet aucune génération sans source", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    const fetchMock = mockFetchRouter(
      [{ match: '/generated', respond: () => jsonResponse({ documents: [] }) }],
      () => jsonResponse({}),
    );

    renderWithProviders(
      <GeneratePanel notebookId="nb-1" sources={[]} onRefresh={onRefresh} />,
    );

    // "Résumé" est l'un des types de documents proposés : sans source, le
    // bouton est désactivé (comportement actuel) et un message d'aide s'affiche.
    const summaryBtn = await screen.findByRole('button', { name: /Résumé/ });
    expect(summaryBtn).toBeDisabled();
    expect(
      screen.getByText('Ajoutez des sources pour activer la génération'),
    ).toBeInTheDocument();

    // Cliquer un bouton désactivé ne déclenche aucune requête de génération.
    await user.click(summaryBtn);
    const genCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/generate/stream'),
    );
    expect(genCall).toBeUndefined();
  });

  it('lance une génération et finalise à réception du document', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    const generatedDoc = {
      id: 'doc-1',
      type: 'summary',
      title: 'Résumé des sources',
      content: 'Contenu généré.',
      sourceIds: ['src-1'],
      createdAt: new Date().toISOString(),
    };
    const fetchMock = mockFetchRouter(
      [
        {
          match: '/generate/stream',
          respond: () =>
            sseResponse([
              sseData({ text: 'Contenu ' }),
              sseData({ text: 'généré.' }),
              sseData({ document: generatedDoc }),
            ]),
        },
        { match: '/generated', respond: () => jsonResponse({ documents: [] }) },
        {
          match: '/report-suggestions',
          respond: () => jsonResponse({ suggestions: [] }),
        },
      ],
      () => jsonResponse({}),
    );

    renderWithProviders(
      <GeneratePanel notebookId="nb-1" sources={[SOURCE]} onRefresh={onRefresh} />,
    );

    const summaryBtn = await screen.findByRole('button', { name: /Résumé/ });
    await user.click(summaryBtn);

    // POST vers l'endpoint de génération avec le type attendu.
    await waitFor(() => {
      const genCall = fetchMock.mock.calls.find(([url]) =>
        String(url).includes('/api/notebooks/nb-1/generate/stream'),
      );
      expect(genCall).toBeTruthy();
      const init = genCall![1] as RequestInit;
      expect(init.method).toBe('POST');
      expect(JSON.parse(String(init.body))).toMatchObject({ type: 'summary' });
    });

    // À réception du frame `document` : toast de succès + onRefresh appelé.
    expect(
      await screen.findByText('"Résumé des sources" généré'),
    ).toBeInTheDocument();
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });
});
