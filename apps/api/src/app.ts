import express from 'express';
import helmet from 'helmet';
import type { PrismaClient } from './generated/prisma/client.js';
import type { AttemptStore } from './store.js';
import { errorHandler, HttpError } from './errors.js';
import { secretMatches, sessionId } from './auth.js';
import { answerInput } from './validation.js';
import { contentRouter } from './routes/content.js';
import { learnerRouter } from './routes/learner.js';

interface AppOptions { prisma?: PrismaClient; adminKey?: string; readiness?: () => Promise<unknown> }
export function createApp(store: AttemptStore, apiKey = '', options: AppOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/ready', async (_req, res) => {
    try {
      if (options.readiness) await options.readiness();
      else if (options.prisma) await options.prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ready', storage: options.prisma ? 'postgresql' : 'memory' });
    }
    catch { res.status(503).json({ status: 'unavailable' }); }
  });
  app.use('/api', (req, _res, next) => {
    if (apiKey && !secretMatches(req.header('x-api-key') ?? '', apiKey)) throw new HttpError(401, 'Unauthorized', 'UNAUTHORIZED');
    next();
  });
  if (options.prisma) {
    app.use('/api', contentRouter(options.prisma, options.adminKey ?? ''));
    app.use('/api', learnerRouter(options.prisma));
  } else {
    app.get('/api/questions', async (_req, res) => res.json(await store.questions()));
    app.use('/api', (req, _res, next) => {
      if (/^\/(subjects|topics|bookmarks|attempts|statistics)(\/|$)/.test(req.path) || (req.path.startsWith('/questions') && (req.method !== 'GET' || req.path !== '/questions'))) {
        throw new HttpError(503, 'Configure DATABASE_URL and apply migrations to use this endpoint');
      }
      next();
    });
  }
  app.get('/api/progress', async (req, res) => res.json(await store.progress(sessionId(req))));
  app.post('/api/answers', async (req, res) => {
    const userId = sessionId(req);
    const data = answerInput.parse(req.body);
    res.json(await store.submit(userId, data));
  });
  app.use((_req, _res) => { throw new HttpError(404, 'Route not found'); });
  app.use(errorHandler);
  return app;
}
