import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useResource } from './useResource.js';
import { ApiError } from './client.js';
import { jsonResponse } from '../../../test/helpers.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useResource', () => {
  it('charge les données au montage', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ documents: ['a'] }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useResource<{ documents: string[] }>('/api/x'));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ documents: ['a'] });
    expect(result.current.error).toBeNull();
  });

  it('expose une ApiError en cas d\'échec', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'nope' }, { ok: false, status: 500 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useResource('/api/x'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(result.current.data).toBeUndefined();
  });

  it('ne charge rien quand enabled est false', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useResource('/api/x', { enabled: false }));

    expect(result.current.loading).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refetch relance la requête', async () => {
    let call = 0;
    const fetchMock = vi.fn(async () => jsonResponse({ n: ++call }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useResource<{ n: number }>('/api/x'));
    await waitFor(() => expect(result.current.data).toEqual({ n: 1 }));

    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.data).toEqual({ n: 2 });
  });

  it('setData applique une mise à jour locale', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ items: [1] }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useResource<{ items: number[] }>('/api/x'));
    await waitFor(() => expect(result.current.data).toEqual({ items: [1] }));

    act(() => {
      result.current.setData((prev) => ({ items: [...(prev?.items ?? []), 2] }));
    });
    expect(result.current.data).toEqual({ items: [1, 2] });
  });
});
