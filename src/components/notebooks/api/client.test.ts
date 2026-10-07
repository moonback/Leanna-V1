import { describe, it, expect, vi, afterEach } from 'vitest';
import { api, apiVoid, ApiError } from './client.js';
import { jsonResponse } from '../../../test/helpers.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('api client', () => {
  it('émet un GET et renvoie le JSON typé', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ documents: [{ id: 'd1' }] }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const data = await api<{ documents: { id: string }[] }>('/api/x');

    expect(data.documents[0].id).toBe('d1');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('sérialise `json` et pose le Content-Type application/json', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await api('/api/x', { method: 'POST', json: { url: 'https://ex.fr' } });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ url: 'https://ex.fr' });
    const headers = new Headers(init.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('lance une ApiError avec statut et corps quand la réponse échoue', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ error: 'Boom' }, { ok: false, status: 422 }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const err = (await api('/api/x').catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(422);
    expect(err.message).toBe('Boom'); // message extrait du corps { error }
    expect(err.body).toEqual({ error: 'Boom' });
  });

  it("retombe sur `HTTP <status>` quand le corps n'a pas de champ error", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(null, { ok: false, status: 500 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const err = (await api('/api/x').catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe('HTTP 500');
  });

  it('apiVoid ne lève pas quand la réponse est ok', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, { ok: true }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(apiVoid('/api/x', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('apiVoid lève une ApiError quand la réponse échoue', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'nope' }, { ok: false, status: 404 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const err = (await apiVoid('/api/x', { method: 'DELETE' }).catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(404);
  });
});
