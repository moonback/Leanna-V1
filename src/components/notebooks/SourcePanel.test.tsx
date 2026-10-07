/**
 * Test de CARACTÉRISATION de SourcePanel — flux d'ajout de source (URL / texte).
 *
 * Verrouille le comportement ACTUEL avant découpage :
 *  - l'onglet "URL" révèle un champ, et valider émet un POST vers /sources/url ;
 *  - au succès, un toast "Source ... ajoutée" s'affiche et onRefresh est appelé ;
 *  - l'onglet "Texte" émet un POST vers /sources/text avec le contenu saisi.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { SourcePanel } from './SourcePanel.js';
import {
  renderWithProviders,
  mockFetchRouter,
  jsonResponse,
} from '../../test/helpers.js';

describe('SourcePanel — ajout de source (caractérisation)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("ajoute une source par URL et rafraîchit la liste", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    const fetchMock = mockFetchRouter(
      [
        {
          match: '/sources/url',
          respond: () => jsonResponse({ source: { title: 'Article importé' } }),
        },
      ],
      () => jsonResponse({}),
    );

    renderWithProviders(
      <SourcePanel notebookId="nb-1" sources={[]} onRefresh={onRefresh} />,
    );

    // Ouvrir l'onglet URL.
    await user.click(screen.getByRole('button', { name: /^URL$/ }));

    // Saisir une URL puis valider avec Entrée.
    const urlInput = await screen.findByPlaceholderText('https://example.com/article...');
    await user.type(urlInput, 'https://exemple.fr/mon-article');
    await user.keyboard('{Enter}');

    // POST vers l'endpoint d'ingestion d'URL avec le bon corps.
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) =>
        String(url).includes('/api/notebooks/nb-1/sources/url'),
      );
      expect(call).toBeTruthy();
      const init = call![1] as RequestInit;
      expect(init.method).toBe('POST');
      expect(JSON.parse(String(init.body))).toMatchObject({
        url: 'https://exemple.fr/mon-article',
      });
    });

    // Toast de succès (comportement actuel) + rafraîchissement demandé au parent.
    expect(
      await screen.findByText('Source "Article importé" ajoutée'),
    ).toBeInTheDocument();
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });

  it("ajoute une source via l'onglet Texte", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    const fetchMock = mockFetchRouter(
      [
        {
          match: '/sources/text',
          respond: () => jsonResponse({ source: { title: 'Note collée' } }),
        },
      ],
      () => jsonResponse({}),
    );

    renderWithProviders(
      <SourcePanel notebookId="nb-1" sources={[]} onRefresh={onRefresh} />,
    );

    await user.click(screen.getByRole('button', { name: /^Texte$/ }));

    const contentArea = await screen.findByPlaceholderText('Collez votre texte ici...');
    await user.type(contentArea, 'Un contenu de caractérisation.');

    // Valider via le bouton "Ajouter" du formulaire texte.
    await user.click(screen.getByRole('button', { name: /^Ajouter$/ }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) =>
        String(url).includes('/api/notebooks/nb-1/sources/text'),
      );
      expect(call).toBeTruthy();
      const init = call![1] as RequestInit;
      expect(init.method).toBe('POST');
      expect(JSON.parse(String(init.body))).toMatchObject({
        content: 'Un contenu de caractérisation.',
      });
    });

    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });
});
