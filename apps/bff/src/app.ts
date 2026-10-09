import express, { type ErrorRequestHandler, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { z } from 'zod';
import { createApiClient, GatewayError, hideAnswers, type ApiResponse } from './api-client.js';
import { idParams, optionParams, questionParams, sessionId, emptyQuery, pageQuery, topicQuery, questionQuery, attemptQuery, answerInput, bookmarkInput, pageResponse, progressResponse, performanceResponse } from './validation.js';
interface BffOptions { apiBaseUrl?: string; apiUrl?: string; apiKey?: string; webOrigin: string; timeoutMs?: number; fetcher?: typeof fetch }
function send(res: Response, response: ApiResponse, content = false) {
  if (response.status === 204) { res.status(204).end(); return; }
  res.set(response.headers).status(response.status).json(content ? hideAnswers(response.body) : response.body);
}
export function createApp({ apiBaseUrl, apiUrl, apiKey = '', webOrigin, timeoutMs = 8000, fetcher = fetch }: BffOptions) {
  const upstream = createApiClient({ baseUrl: apiBaseUrl ?? apiUrl ?? 'http://localhost:4001', apiKey, timeoutMs, fetcher });
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use((req, _res, next) => {
    if (req.header('origin') && req.header('origin') !== webOrigin) throw new GatewayError(403, 'Origin is not allowed', 'FORBIDDEN_ORIGIN');
    next();
  });
  app.use(cors({ origin: webOrigin, methods: ['GET', 'POST', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'x-session-id'], exposedHeaders: ['X-Total-Count', 'X-Page', 'X-Limit'] }));
  app.use(express.json({ limit: '10kb' }));
  app.use(['/bff', '/api'], (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/ready', async (_req, res) => {
    try {
      const response = await upstream('/ready');
      const ready = z.object({ status: z.literal('ready'), storage: z.enum(['postgresql', 'memory']) }).parse(response.body);
      res.json(ready);
    }
    catch { res.status(503).json({ status: 'unavailable' }); }
  });
  for (const [resource, schema] of [['subjects', pageQuery], ['topics', topicQuery], ['questions', questionQuery]] as const) {
    app.get(`/bff/${resource}`, async (req, res) => send(res, await upstream(`/api/${resource}`, { query: schema.parse(req.query) }), true));
    app.get(`/bff/${resource}/:id`, async (req, res) => {
      emptyQuery.parse(req.query);
      const { id } = idParams.parse(req.params);
      send(res, await upstream(`/api/${resource}/${id}`), true);
    });
  }
  app.get('/bff/questions/:questionId/options', async (req, res) => {
    emptyQuery.parse(req.query);
    const { questionId } = questionParams.parse(req.params);
    send(res, await upstream(`/api/questions/${questionId}/options`), true);
  });
  app.get('/bff/questions/:questionId/options/:id', async (req, res) => {
    emptyQuery.parse(req.query);
    const { id, questionId } = optionParams.parse(req.params);
    send(res, await upstream(`/api/questions/${questionId}/options/${id}`), true);
  });
  app.get('/bff/attempts', async (req, res) => send(res, await upstream('/api/attempts', { session: sessionId.parse(req.header('x-session-id')), query: attemptQuery.parse(req.query) })));
  app.get('/bff/attempts/:id', async (req, res) => {
    emptyQuery.parse(req.query);
    const { id } = idParams.parse(req.params);
    send(res, await upstream(`/api/attempts/${id}`, { session: sessionId.parse(req.header('x-session-id')) }));
  });
  app.get('/bff/attempts/:id/explanation', async (req, res) => {
    emptyQuery.parse(req.query);
    const { id } = idParams.parse(req.params);
    send(res, await upstream(`/api/attempts/${id}/explanation`, { session: sessionId.parse(req.header('x-session-id')) }));
  });
  for (const path of ['/bff/attempts', '/bff/answers', '/api/answers']) app.post(path, async (req, res) => {
    emptyQuery.parse(req.query);
    send(res, await upstream('/api/answers', { method: 'POST', session: sessionId.parse(req.header('x-session-id')), body: answerInput.parse(req.body) }));
  });
  app.get('/bff/bookmarks', async (req, res) => send(res, await upstream('/api/bookmarks', { session: sessionId.parse(req.header('x-session-id')), query: pageQuery.parse(req.query) }), true));
  app.post('/bff/bookmarks', async (req, res) => {
    emptyQuery.parse(req.query);
    send(res, await upstream('/api/bookmarks', { method: 'POST', session: sessionId.parse(req.header('x-session-id')), body: bookmarkInput.parse(req.body) }), true);
  });
  app.delete('/bff/bookmarks/:id', async (req, res) => {
    emptyQuery.parse(req.query);
    const { id } = idParams.parse(req.params);
    send(res, await upstream(`/api/bookmarks/${id}`, { method: 'DELETE', session: sessionId.parse(req.header('x-session-id')) }));
  });
  for (const path of ['/bff/progress', '/api/progress']) app.get(path, async (req, res) => {
    emptyQuery.parse(req.query);
    send(res, await upstream('/api/progress', { session: sessionId.parse(req.header('x-session-id')) }));
  });
  app.get('/api/questions', async (req, res) => send(res, await upstream('/api/questions', { query: questionQuery.parse(req.query) }), true));
  app.get('/bff/dashboard', async (req, res) => {
    emptyQuery.parse(req.query);
    const session = sessionId.parse(req.header('x-session-id'));
    const controller = new AbortController();
    const options = { session, signal: controller.signal };
    try {
      const [progress, performance, attempts, bookmarks] = await Promise.all([
        upstream('/api/progress', options), upstream('/api/statistics', options),
        upstream('/api/attempts', { ...options, query: { page: 1, limit: 5 } }),
        upstream('/api/bookmarks', { ...options, query: { page: 1, limit: 5 } }),
      ]);
      const summary = progressResponse.safeParse(progress.body);
      const statistics = performanceResponse.safeParse(performance.body);
      const recent = pageResponse.safeParse(attempts.body);
      const saved = pageResponse.safeParse(bookmarks.body);
      if (!summary.success || !statistics.success || !recent.success || !saved.success) throw new GatewayError(502, 'Practice service returned an invalid dashboard', 'UPSTREAM_ERROR');
      res.json({ progress: summary.data, performance: statistics.data, recentAttempts: recent.data.data, bookmarks: hideAnswers(saved.data.data), bookmarkCount: saved.data.pagination.total });
    } finally { controller.abort(); }
  });
  app.use((_req, _res) => { throw new GatewayError(404, 'Route not found', 'NOT_FOUND'); });
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', issues: error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })) }); return; }
    if (error instanceof GatewayError) { res.status(error.status).json({ error: error.message, code: error.code }); return; }
    if (error?.type === 'entity.too.large') { res.status(413).json({ error: 'Request body too large', code: 'BODY_TOO_LARGE' }); return; }
    if (error?.type === 'entity.parse.failed') { res.status(400).json({ error: 'Invalid JSON body', code: 'INVALID_JSON' }); return; }
    console.error('Unhandled BFF request error');
    res.status(500).json({ error: 'Unable to process request', code: 'INTERNAL_ERROR' });
  };
  app.use(errors);
  return app;
}
