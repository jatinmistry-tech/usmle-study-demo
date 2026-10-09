import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../src/errors.js';
import { createApp } from '../src/app.js';
import { MemoryStore } from '../src/store.js';

describe('error handling and readiness', () => {
  it('reports memory mode explicitly instead of implying full database readiness', async () => {
    const response = await request(createApp(new MemoryStore())).get('/ready').expect(200);
    expect(response.body).toEqual({ status: 'ready', storage: 'memory' });
  });
  it.each([['P2002', 409], ['P2003', 409], ['P2025', 404], ['P2034', 409], ['P1001', 503]])('maps %s without disclosing driver details', async (code, status) => {
    const app = express();
    app.get('/', () => { throw Object.assign(new Error('password=SECRET internal SQL'), { code }); });
    app.use(errorHandler);
    const response = await request(app).get('/').expect(status as number);
    expect(JSON.stringify(response.body)).not.toContain('SECRET');
  });
  it('sanitizes unexpected errors', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const app = express();
      app.get('/', () => { throw new Error('SECRET stack and connection string'); });
      app.use(errorHandler);
      const response = await request(app).get('/').expect(500);
      expect(JSON.stringify(response.body)).not.toContain('SECRET');
      expect(log).toHaveBeenCalledWith('Unhandled API request error');
    } finally { log.mockRestore(); }
  });
  it('keeps liveness available when readiness fails and rejects malformed/oversized bodies', async () => {
    const app = createApp(new MemoryStore(), '', { readiness: async () => { throw new Error('SECRET'); } });
    await request(app).get('/health').expect(200);
    const readiness = await request(app).get('/ready').expect(503);
    expect(JSON.stringify(readiness.body)).not.toContain('SECRET');
    await request(app).post('/api/answers').set('Content-Type', 'application/json').send('{').expect(400);
    await request(app).post('/api/answers').send({ payload: 'x'.repeat(110000) }).expect(413);
    await request(app).get('/api/subjects').expect(503);
    await request(app).get('/unknown').expect(404);
  });
});
