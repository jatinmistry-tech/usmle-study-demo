import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
const id = randomUUID();
const session = randomUUID();
function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}
function setup(fetcher = vi.fn<typeof fetch>().mockImplementation(async () => json([])), timeoutMs = 8000) {
  return { fetcher, app: createApp({ apiBaseUrl: 'http://internal-api', apiKey: 'SERVER_SECRET', webOrigin: 'https://web.example', fetcher, timeoutMs }) };
}
describe('BFF resource forwarding', () => {
  it.each([
    ['/bff/subjects', '/api/subjects?page=1&limit=50'],
    [`/bff/subjects/${id}`, `/api/subjects/${id}`],
    [`/bff/topics?subjectId=${id}&limit=3`, `/api/topics?page=1&limit=3&subjectId=${id}`],
    [`/bff/topics/${id}`, `/api/topics/${id}`],
    [`/bff/questions?topicId=${id}&difficulty=EASY`, `/api/questions?page=1&limit=50&topicId=${id}&difficulty=EASY`],
    [`/bff/questions/${id}`, `/api/questions/${id}`],
    [`/bff/questions/${id}/options`, `/api/questions/${id}/options`],
    [`/bff/questions/${id}/options/${id}`, `/api/questions/${id}/options/${id}`],
  ])('forwards validated %s with safe credentials and strips answers', async (path, target) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ id, explanation: 'SECRET', options: [{ id, isCorrect: true, optionText: 'Choice' }] }, 200, { 'x-total-count': '3', 'set-cookie': 'secret-cookie' }));
    const { app } = setup(fetcher);
    const response = await request(app).get(path).set('x-api-key', 'CLIENT_SECRET').set('x-admin-key', 'CLIENT_ADMIN').set('Cookie', 'private=COOKIE').expect(200);
    expect(fetcher.mock.calls[0]?.[0]).toBe(`http://internal-api${target}`);
    const options = fetcher.mock.calls[0]?.[1];
    expect(options?.headers).toMatchObject({ 'x-api-key': 'SERVER_SECRET' });
    expect(JSON.stringify(options?.headers)).not.toContain('CLIENT');
    expect(JSON.stringify(options?.headers)).not.toContain('COOKIE');
    expect(options?.redirect).toBe('error');
    expect(JSON.stringify(response.body)).not.toContain('SECRET');
    expect(JSON.stringify(response.body)).not.toContain('isCorrect');
    expect(response.headers['x-total-count']).toBe('3');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('validates parameters, queries, sessions and bodies before any upstream request', async () => {
    const { app, fetcher } = setup();
    await request(app).get('/bff/questions/not-a-uuid').expect(400);
    await request(app).get('/bff/questions?limit=101').expect(400);
    await request(app).get('/bff/topics?subjectId=invalid').expect(400);
    await request(app).get('/bff/questions?redirect=https://evil.example').expect(400);
    await request(app).get('/bff/attempts').expect(400);
    await request(app).get('/bff/attempts').set('x-session-id', 'invalid').expect(400);
    await request(app).post('/bff/attempts').set('x-session-id', session).send({ questionId: id, optionId: id, isCorrect: true }).expect(400);
    await request(app).post('/bff/bookmarks').set('x-session-id', session).send({ questionId: id, userId: id }).expect(400);
    await request(app).post('/bff/subjects').send({ name: 'Admin write' }).expect(404);
    await request(app).get('/bff/admin').expect(404);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('supports attempts, bookmark writes, and 204 deletes', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => options?.method === 'DELETE' ? new Response(null, { status: 204 }) : json({ correct: true, explanation: 'Available after submission' }));
    const { app } = setup(fetcher);
    const response = await request(app).post('/bff/attempts').set('x-session-id', session).send({ questionId: id, optionId: id, timeTaken: 9 }).expect(200);
    expect(response.body.correct).toBe(true); expect(response.body.explanation).toBeTruthy();
    expect(fetcher.mock.calls[0]?.[0]).toBe('http://internal-api/api/answers');
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ method: 'POST', headers: expect.objectContaining({ 'x-session-id': session }), body: JSON.stringify({ questionId: id, optionId: id, timeTaken: 9 }) });
    await request(app).get('/bff/attempts').set('x-session-id', session).expect(200);
    await request(app).get(`/bff/attempts/${id}`).set('x-session-id', session).expect(200);
    await request(app).get('/bff/bookmarks').set('x-session-id', session).expect(200);
    await request(app).post('/bff/bookmarks').set('x-session-id', session).send({ questionId: id }).expect(200);
    const removed = await request(app).delete(`/bff/bookmarks/${id}`).set('x-session-id', session).expect(204);
    expect(removed.text).toBe('');
  });
  it('aggregates dashboard calls for one session and hides bookmark answers', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async input => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/progress')) return json({ answered: 1, correct: 1, accuracy: 100 });
      if (path.endsWith('/statistics')) return json({ totalAttempts: 1, correctAttempts: 1, questionsAnswered: 1, accuracy: 100, averageTimeTaken: 9, bySubject: [], byTopic: [] });
      if (path.endsWith('/attempts')) return json({ data: [{ id, isCorrect: true }], pagination: { total: 1 } });
      return json({ data: [{ question: { explanation: 'SECRET', options: [{ isCorrect: true }] } }], pagination: { total: 12 } });
    });
    const { app } = setup(fetcher);
    const response = await request(app).get('/bff/dashboard').set('x-session-id', session).expect(200);
    expect(response.body.bookmarkCount).toBe(12);
    expect(response.body.recentAttempts[0].isCorrect).toBe(true);
    expect(response.body.performance.accuracy).toBe(100);
    expect(JSON.stringify(response.body.bookmarks)).not.toContain('SECRET');
    expect(fetcher).toHaveBeenCalledTimes(4);
    for (const [, options] of fetcher.mock.calls) expect(options?.headers).toMatchObject({ 'x-session-id': session });
  });
});

describe('BFF failures and deadlines', () => {
  it('propagates storage mode and rejects an invalid readiness response', async () => {
    for (const storage of ['memory', 'postgresql']) {
      const app = setup(vi.fn<typeof fetch>().mockResolvedValue(json({ status: 'ready', storage }))).app;
      expect((await request(app).get('/ready').expect(200)).body).toEqual({ status: 'ready', storage });
    }
    await request(setup(vi.fn<typeof fetch>().mockResolvedValue(json({ status: 'ok' }))).app).get('/ready').expect(503);
  });
  it.each([[400, 400], [401, 502], [403, 502], [404, 404], [409, 409], [429, 429], [500, 502], [503, 502]])('sanitizes upstream %i as %i', async (status, expected) => {
    const { app } = setup(vi.fn<typeof fetch>().mockResolvedValue(json({ error: 'SECRET SQL and credentials' }, status)));
    const response = await request(app).get('/bff/subjects').expect(expected);
    expect(JSON.stringify(response.body)).not.toContain('SECRET');
  });
  it('returns 504 for a stalled fetch and for a stalled response body', async () => {
    const hanging = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {}));
    await request(setup(hanging, 25).app).get('/bff/subjects').expect(504);
    const body = new ReadableStream<Uint8Array>({ start() {} });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(body));
    await request(setup(fetcher, 25).app).get('/bff/subjects').expect(504);
  });
  it('rejects network errors, non-JSON responses and oversized upstream bodies', async () => {
    const broken = setup(vi.fn<typeof fetch>().mockRejectedValue(new Error('SECRET'))).app;
    await request(broken).get('/bff/subjects').expect(502);
    await request(setup(vi.fn<typeof fetch>().mockResolvedValue(new Response('<html>SECRET</html>'))).app).get('/bff/subjects').expect(502);
    await request(setup(vi.fn<typeof fetch>().mockResolvedValue(json({ text: 'x'.repeat(2100000) }))).app).get('/bff/subjects').expect(502);
  });
  it('handles malformed input, forbidden origins and readiness failures', async () => {
    const { app, fetcher } = setup(vi.fn<typeof fetch>().mockRejectedValue(new Error('SECRET')));
    await request(app).get('/bff/subjects').set('Origin', 'https://evil.example').expect(403);
    await request(app).post('/bff/attempts').set('Content-Type', 'application/json').send('{').expect(400);
    await request(app).post('/bff/attempts').send({ body: 'x'.repeat(12000) }).expect(413);
    expect(fetcher).not.toHaveBeenCalled();
    await request(app).get('/health').expect(200);
    await request(app).get('/ready').expect(503);
  });
});

describe('BFF configuration', () => {
  it('requires production secrets and uses HTTPS or explicit private hostports', () => {
    expect(() => readConfig({ NODE_ENV: 'production' })).toThrow();
    expect(() => readConfig({ API_BASE_URL: 'https://user:SECRET@api.example' })).toThrow('without credentials');
    expect(() => readConfig({ NODE_ENV: 'production', API_BASE_URL: 'http://api.example', API_KEY: 'secret', WEB_ORIGIN: 'https://web.example' })).toThrow('HTTPS');
    expect(readConfig({ NODE_ENV: 'production', API_BASE_URL: 'private-render-api:10000', API_KEY: 'secret', WEB_ORIGIN: 'https://web.example' }).apiBaseUrl).toBe('http://private-render-api:10000');
    expect(readConfig({ API_BASE_URL: 'https://api.example', API_TIMEOUT_MS: '3000' }).timeoutMs).toBe(3000);
    expect(() => readConfig({ API_TIMEOUT_MS: '0' })).toThrow();
  });
});
