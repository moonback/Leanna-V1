/**
 * Test de CARACTÉRISATION de NotebookChat — flux d'envoi de message.
 *
 * Objectif : verrouiller le comportement ACTUEL avant tout découpage, pas
 * décrire un comportement idéal. Si un refactor change ce comportement, ce
 * test doit échouer et attirer l'attention.
 *
 * Comportement capturé :
 *  - saisir une question puis Entrée l'envoie ;
 *  - le message utilisateur apparaît immédiatement ;
 *  - un POST est émis vers /chat/stream avec la question ;
 *  - la réponse assistant streamée (SSE) finit par s'afficher ;
 *  - un toast de succès est montré.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { NotebookChat } from './NotebookChat.js';
import {
  renderWithProviders,
  mockFetchRouter,
  jsonResponse,
  sseResponse,
  sseData,
} from '../../test/helpers.js';

const CHAT_PLACEHOLDER = 'Posez une question sur vos sources... (/ pour les commandes)';

describe('NotebookChat — envoi de message (caractérisation)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  function setupFetch(streamFrames: string[]) {
    return mockFetchRouter(
      [
        {
          match: '/chat/stream',
          respond: () => sseResponse(streamFrames),
        },
        // fetch de montage : threads / history / suggestions
        { match: '/chat/threads', respond: () => jsonResponse({ threads: [] }) },
        { match: '/chat/history', respond: () => jsonResponse({ messages: [] }) },
        { match: '/chat/suggestions', respond: () => jsonResponse({ suggestions: [] }) },
      ],
      () => jsonResponse({}),
    );
  }

  it("affiche le message de l'utilisateur et émet un POST vers /chat/stream", async () => {
    const user = userEvent.setup();
    const assistantMessage = {
      id: 'assistant-1',
      role: 'assistant',
      content: 'Réponse de caractérisation.',
      citations: [],
      timestamp: new Date().toISOString(),
    };
    const fetchMock = setupFetch([
      sseData({ text: 'Réponse ' }),
      sseData({ text: 'de caractérisation.' }),
      sseData({ message: assistantMessage }),
    ]);

    renderWithProviders(<NotebookChat notebookId="nb-1" hasSources={true} />);

    const textarea = await screen.findByPlaceholderText(CHAT_PLACEHOLDER);
    await user.type(textarea, 'Quelle est la thèse principale ?');
    await user.keyboard('{Enter}');

    // Le message utilisateur apparaît immédiatement (optimiste).
    expect(
      await screen.findByText('Quelle est la thèse principale ?'),
    ).toBeInTheDocument();

    // Un POST a bien été émis vers l'endpoint de streaming du chat.
    await waitFor(() => {
      const streamCall = fetchMock.mock.calls.find(([url]) =>
        String(url).includes('/api/notebooks/nb-1/chat/stream'),
      );
      expect(streamCall).toBeTruthy();
      const init = streamCall![1] as RequestInit;
      expect(init.method).toBe('POST');
      expect(JSON.parse(String(init.body))).toMatchObject({
        question: 'Quelle est la thèse principale ?',
      });
    });

    // La réponse assistant finale (issue du frame `message`) s'affiche.
    expect(
      await screen.findByText('Réponse de caractérisation.'),
    ).toBeInTheDocument();

    // Toast de succès du flux actuel.
    expect(
      await screen.findByText('✓ Réponse générée avec succès'),
    ).toBeInTheDocument();
  });

  it("n'envoie rien lorsque la saisie est vide", async () => {
    const user = userEvent.setup();
    const fetchMock = setupFetch([]);

    renderWithProviders(<NotebookChat notebookId="nb-1" hasSources={true} />);

    const textarea = await screen.findByPlaceholderText(CHAT_PLACEHOLDER);
    textarea.focus();
    await user.keyboard('{Enter}');

    // Aucun appel vers /chat/stream n'a été émis.
    const streamCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/chat/stream'),
    );
    expect(streamCall).toBeUndefined();
  });
});
