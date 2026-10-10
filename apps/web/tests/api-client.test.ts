// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../src/api';
afterEach(() => vi.unstubAllGlobals());
describe('browser BFF client', () => {
  it('uses only /bff paths with a session, and handles no-content bookmark deletion', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetcher);
    await api.removeBookmark('60000000-0000-4000-8000-000000000001');
    expect(fetcher.mock.calls[0]?.[0]).toBe('/bff/bookmarks/60000000-0000-4000-8000-000000000001');
    const headers = fetcher.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers['x-session-id']).toMatch(/^[\da-f-]{36}$/);
    expect(headers).not.toHaveProperty('x-api-key'); expect(headers).not.toHaveProperty('x-admin-key');
  });
  it('reads question pagination headers and passes only supported filters', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('[]', { headers: { 'x-total-count': '25' } }));
    vi.stubGlobal('fetch', fetcher);
    const result = await api.questions({ difficulty: 'EASY', page: 2 });
    expect(result.total).toBe(25);
    expect(fetcher.mock.calls[0]?.[0]).toBe('/bff/questions?difficulty=EASY&page=2&limit=10');
  });
});
