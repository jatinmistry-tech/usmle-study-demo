import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { MemoryStore } from '../src/store.js';
import { questions } from '../src/questions.js';
const first = questions[0]!;
const correctId = first.correctOptionId;
const wrongId = first.options.find(option => option.id !== correctId)!.id;
import { createApp as createBff } from '../../bff/src/app.js';

describe('practice API', () => {
  it('does not expose answers before submission and requires the service key', async () => {
    const app = createApp(new MemoryStore(), 'test-secret');
    await request(app).get('/api/questions').expect(401);
    const response = await request(app).get('/api/questions').set('x-api-key', 'test-secret').expect(200);
    expect(response.body).toHaveLength(3);
    for (const question of response.body) {
      expect(question).not.toHaveProperty('correctOptionId');
      expect(question).not.toHaveProperty('explanation');
    }
  });
  it('grades answers, replaces retries, and isolates sessions', async () => {
    const app = createApp(new MemoryStore());
    const session = randomUUID();
    const submit = (optionId: string) => request(app).post('/api/answers')
      .set('x-session-id', session).send({ questionId: first.id, optionId });
    expect((await submit(wrongId).expect(200)).body.correct).toBe(false);
    expect((await submit(correctId).expect(200)).body.correct).toBe(true);
    const progress = await request(app).get('/api/progress').set('x-session-id', session).expect(200);
    expect(progress.body).toEqual({ answered: 1, correct: 1, accuracy: 100 });
    const other = await request(app).get('/api/progress').set('x-session-id', randomUUID()).expect(200);
    expect(other.body.answered).toBe(0);
  });
  it('rejects invalid sessions, questions, options, timing, and JSON', async () => {
    const app = createApp(new MemoryStore());
    const session = randomUUID();
    await request(app).post('/api/answers').send({}).expect(400);
    await request(app).post('/api/answers').set('x-session-id', session).send({ questionId: randomUUID(), optionId: correctId }).expect(404);
    await request(app).post('/api/answers').set('x-session-id', session).send({ questionId: first.id, optionId: randomUUID() }).expect(400);
    for (const timeTaken of [-1, 1.5, '12', 2147483648]) {
      await request(app).post('/api/answers').set('x-session-id', session)
        .send({ questionId: first.id, optionId: correctId, timeTaken }).expect(400);
    }
    await request(app).post('/api/answers').set('Content-Type', 'application/json').send('{').expect(400);
  });
});

describe('BFF', () => {
  it('forwards the session and service key with a bounded request', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ answered: 0, correct: 0, accuracy: 0 })));
    const app = createBff({ apiUrl: 'http://internal-api/', apiKey: 'secret', webOrigin: 'https://web.example', fetcher });
    const session = randomUUID();
    const response = await request(app).get('/api/progress').set('Origin', 'https://web.example').set('x-session-id', session).expect(200);
    expect(response.headers['access-control-allow-origin']).toBe('https://web.example');
    expect(fetcher).toHaveBeenCalledWith('http://internal-api/api/progress', expect.objectContaining({
      headers: expect.objectContaining({ 'x-session-id': session, 'x-api-key': 'secret' }),
      signal: expect.any(AbortSignal),
    }));
  });
  it('handles upstream failures without leaking details and allows only known routes', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('internal secret'));
    const app = createBff({ apiUrl: 'http://internal-api', webOrigin: 'http://localhost:5173', fetcher });
    const response = await request(app).get('/api/questions').expect(502);
    expect(response.body.error).not.toContain('secret');
    await request(app).get('/api/admin').expect(404);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});


describe('web gateway to API integration', () => {
  it('grades and retrieves progress through the BFF using the real HTTP transport', async () => {
    const server = createApp(new MemoryStore(), 'integration-key').listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const { port } = server.address() as AddressInfo;
      const bff = createBff({ apiUrl: `http://127.0.0.1:${port}`, apiKey: 'integration-key', webOrigin: 'http://localhost:5173' });
      const session = randomUUID();
      await request(bff).get('/api/questions').expect(200);
      const answer = await request(bff).post('/api/answers').set('x-session-id', session)
        .send({ questionId: first.id, optionId: correctId }).expect(200);
      expect(answer.body.correct).toBe(true);
      expect(answer.body.explanation).toBeTruthy();
      const progress = await request(bff).get('/api/progress').set('x-session-id', session).expect(200);
      expect(progress.body).toEqual({ answered: 1, correct: 1, accuracy: 100 });
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
});
