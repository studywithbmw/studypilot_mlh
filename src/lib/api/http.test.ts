import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest, setAuthHooks } from './http';

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

const BASE = 'http://api.test/api/v1';
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  setAuthHooks(null);
});
afterEach(() => {
  vi.unstubAllGlobals();
  setAuthHooks(null);
});

describe('apiRequest', () => {
  it('sends the bearer token and parses JSON', async () => {
    setAuthHooks({ getToken: async () => 'tok', refresh: async () => null, onUnauthorized: vi.fn() });
    fetchMock.mockResolvedValue(json(200, { id: 1 }));
    const out = await apiRequest<{ id: number }>('/me', { baseUrl: BASE });
    expect(out).toEqual({ id: 1 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/me`);
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  it('sends a JSON body with content-type', async () => {
    fetchMock.mockResolvedValue(json(201, {}));
    await apiRequest('/workspaces', { method: 'POST', body: { name: 'x' }, baseUrl: BASE });
    const init = fetchMock.mock.calls[0][1];
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe('{"name":"x"}');
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('returns undefined for 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(apiRequest('/me', { method: 'DELETE', baseUrl: BASE })).resolves.toBeUndefined();
  });

  it('parses the backend error envelope', async () => {
    fetchMock.mockResolvedValue(
      json(429, { error: { code: 'quota_exceeded', message: 'Too many workspaces', requestId: 'r1' } }),
    );
    const err: unknown = await apiRequest('/workspaces', { baseUrl: BASE }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 429, code: 'quota_exceeded', message: 'Too many workspaces', requestId: 'r1' });
  });

  it('falls back to a generic message for non-JSON errors', async () => {
    fetchMock.mockResolvedValue(new Response('<html>bad gateway</html>', { status: 502 }));
    const err = await apiRequest('/me', { baseUrl: BASE }).catch((e) => e);
    expect(err).toMatchObject({ status: 502, code: 'http_error' });
    expect((err as Error).message).not.toContain('html');
  });

  it('refreshes once on 401 and retries with the new token', async () => {
    const refresh = vi.fn().mockResolvedValue('new');
    const onUnauthorized = vi.fn();
    setAuthHooks({ getToken: async () => 'old', refresh, onUnauthorized });
    fetchMock
      .mockResolvedValueOnce(json(401, { error: { code: 'unauthorized', message: 'x' } }))
      .mockResolvedValueOnce(json(200, { ok: true }));
    await expect(apiRequest('/me', { baseUrl: BASE })).resolves.toEqual({ ok: true });
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer new');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('signs out when the retry is still 401', async () => {
    const onUnauthorized = vi.fn();
    setAuthHooks({ getToken: async () => 'old', refresh: async () => 'new', onUnauthorized });
    fetchMock.mockImplementation(async () => json(401, { error: { code: 'unauthorized', message: 'Invalid token' } }));
    await expect(apiRequest('/me', { baseUrl: BASE })).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('signs out when refresh yields no token', async () => {
    const onUnauthorized = vi.fn();
    setAuthHooks({ getToken: async () => 'old', refresh: async () => null, onUnauthorized });
    fetchMock.mockResolvedValue(json(401, {}));
    await expect(apiRequest('/me', { baseUrl: BASE })).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).toHaveBeenCalled();
  });

  it('does not refresh for auth:false requests', async () => {
    const refresh = vi.fn();
    setAuthHooks({ getToken: async () => 't', refresh, onUnauthorized: vi.fn() });
    fetchMock.mockResolvedValue(json(401, {}));
    await expect(apiRequest('/public', { baseUrl: BASE, auth: false })).rejects.toMatchObject({ status: 401 });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('maps network failure to a friendly ApiError', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const err = await apiRequest('/me', { baseUrl: BASE }).catch((e) => e);
    expect(err).toMatchObject({ status: 0, code: 'network_error' });
  });

  it('times out', async () => {
    fetchMock.mockImplementation(
      (_u: string, init: RequestInit) =>
        new Promise((_res, rej) => init.signal!.addEventListener('abort', () => rej(new DOMException('a', 'AbortError')))),
    );
    const err = await apiRequest('/slow', { baseUrl: BASE, timeoutMs: 10 }).catch((e) => e);
    expect(err).toMatchObject({ code: 'timeout' });
  });
});
