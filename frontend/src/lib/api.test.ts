import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, errorMessage, readCookie } from './api';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function clearCookies() {
  for (const c of document.cookie.split('; ')) {
    const name = c.split('=')[0];
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
}

describe('lib/api', () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    clearCookies();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('decodes URI-encoded cookie values', () => {
    document.cookie = `cl_csrf=${encodeURIComponent('a+b/c=d')}; path=/`;
    expect(readCookie('cl_csrf')).toBe('a+b/c=d');
    expect(readCookie('missing')).toBeUndefined();
  });

  it('sends the CSRF cookie as X-CSRF-Token on state-changing requests', async () => {
    document.cookie = 'cl_csrf=tok%3D123; path=/';
    fetchMock.mockResolvedValue(json(200, { ok: true }));
    await api.post('/things', { a: 1 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/things');
    expect((init!.headers as Record<string, string>)['X-CSRF-Token']).toBe('tok=123');
    expect((init!.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(init!.credentials).toBe('include');
    expect(init!.body).toBe('{"a":1}');
  });

  it('fetches the CSRF cookie first when it is missing, and never sends it on GET', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (String(url).endsWith('/auth/csrf')) {
        document.cookie = 'cl_csrf=fresh; path=/';
        return new Response(null, { status: 204 });
      }
      return json(200, {});
    });
    await api.patch('/x', {});
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(['/api/v1/auth/csrf', '/api/v1/x']);
    expect((fetchMock.mock.calls[1][1]!.headers as Record<string, string>)['X-CSRF-Token']).toBe('fresh');

    fetchMock.mockClear();
    await api.get('/y');
    expect((fetchMock.mock.calls[0][1]!.headers as Record<string, string>)['X-CSRF-Token']).toBeUndefined();
  });

  it('maps error bodies to ApiError with status, code, message and field errors', async () => {
    fetchMock.mockResolvedValue(json(422, { error: { code: 'VALIDATION', message: 'Bad input', details: { fieldErrors: { title: ['Required'] } } } }));
    const err = await api.get('/z').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    const e = err as ApiError;
    expect(e.status).toBe(422);
    expect(e.code).toBe('VALIDATION');
    expect(e.message).toBe('Bad input');
    expect(e.fieldErrors).toEqual({ title: ['Required'] });
    expect(errorMessage(e)).toBe('Bad input');
  });

  it('falls back to a generic error for non-JSON failures and returns undefined for 204', async () => {
    fetchMock.mockResolvedValueOnce(new Response('Bad gateway', { status: 502, headers: { 'content-type': 'text/plain' } }));
    const err = (await api.get('/down').catch((e: unknown) => e)) as ApiError;
    expect(err.status).toBe(502);
    expect(err.code).toBe('HTTP_ERROR');
    expect(err.message).toBe('Request failed (502)');

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await api.get('/empty')).toBeUndefined();
  });
});
