import { describe, it, expect, vi, afterEach } from 'vitest';
import { streamSSE } from './sse.js';
import { ApiError } from './client.js';
import { sseResponse, sseData, jsonResponse } from '../../../test/helpers.js';
import type { SseFrame } from './types.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('streamSSE', () => {
  it('émet une frame par ligne data: (style chat/génération)', async () => {
    const fetchMock = vi.fn(async () =>
      sseResponse([
        sseData({ text: 'a' }),
        sseData({ text: 'b' }),
        sseData({ message: { id: 'm1' } }),
      ]),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const frames: SseFrame[] = [];
    await streamSSE('/api/x', { onFrame: (f) => frames.push(f) });

    expect(frames).toHaveLength(3);
    expect(frames[0].data).toEqual({ text: 'a' });
    expect(frames[2].data).toEqual({ message: { id: 'm1' } });
    // Aucun event: dans ce style → event indéfini.
    expect(frames[0].event).toBeUndefined();
  });

  it('porte le type `event:` jusqu\'à la frame data: suivante (style TTS)', async () => {
    // Un seul "chunk" encodé en SSE complet : event: chunk \n data: {...}
    const fetchMock = vi.fn(async () =>
      sseResponse([`event: chunk\n${sseData({ audio: 'AAA', index: 0 })}`]),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const frames: SseFrame[] = [];
    await streamSSE('/api/tts', { onFrame: (f) => frames.push(f) });

    expect(frames).toHaveLength(1);
    expect(frames[0].event).toBe('chunk');
    expect(frames[0].data).toEqual({ audio: 'AAA', index: 0 });
  });

  it('sérialise le corps json et appelle POST par défaut', async () => {
    const fetchMock = vi.fn(async () => sseResponse([sseData({ text: 'x' })]));
    global.fetch = fetchMock as unknown as typeof fetch;

    await streamSSE('/api/x', { json: { question: 'q' }, onFrame: () => {} });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ question: 'q' });
  });

  it('lance une ApiError si la réponse n\'est pas ok', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'bad' }, { ok: false, status: 500 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const err = (await streamSSE('/api/x', { onFrame: () => {} }).catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(500);
  });

  it('ignore le JSON mal formé en transmettant la chaîne brute', async () => {
    const fetchMock = vi.fn(async () => sseResponse(['data: {pas du json']));
    global.fetch = fetchMock as unknown as typeof fetch;

    const frames: SseFrame[] = [];
    await streamSSE('/api/x', { onFrame: (f) => frames.push(f) });

    expect(frames).toHaveLength(1);
    expect(frames[0].data).toBe('{pas du json');
  });
});
