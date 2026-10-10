import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import React, { type ComponentType } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { createApp as createApi } from '../../apps/api/src/app';
import { createApp as createBff } from '../../apps/bff/src/app';
import { createPrismaClient } from '../../apps/api/src/prisma';
import { PrismaStore } from '../../apps/api/src/store';
import { questions } from '../../apps/api/src/questions';

const first = questions[0]!;
let dom: import('jsdom').JSDOM;
let ui: typeof import('@testing-library/react');
let MemoryRouter: typeof import('react-router-dom').MemoryRouter;
let db: PGlite;
let socket: PGLiteSocketServer;
let prisma: ReturnType<typeof createPrismaClient>;
let apiServer: Server;
let bffServer: Server;
let apiOrigin: string;
let bffOrigin: string;
let App: ComponentType;
let databaseAvailable = true;
const origin = (server: Server) => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const open = (path: string) => ui.render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
async function close(server?: Server) {
  if (!server?.listening) return;
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

describe('React → BFF → REST API → Prisma → PostgreSQL', () => {
  beforeAll(async () => {
    db = await PGlite.create();
    const sql = await readFile(new URL('../../apps/api/prisma/migrations/20261009000000_initial_schema/migration.sql', import.meta.url), 'utf8');
    await db.exec(sql);
    socket = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 0 });
    await socket.start();
    const databaseUrl = `postgresql://postgres:postgres@${socket.getServerConn()}/postgres?sslmode=disable`;
    await promisify(execFile)(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('../../apps/api/prisma/cli.ts', import.meta.url)), 'db', 'seed'], {
      cwd: fileURLToPath(new URL('../../apps/api', import.meta.url)),
      env: { ...process.env, DIRECT_URL: databaseUrl, DATABASE_URL: databaseUrl }, timeout: 30000,
    });
    prisma = createPrismaClient(databaseUrl, 1);
    apiServer = createApi(new PrismaStore(prisma), 'integration-service-key', {
      prisma, adminKey: 'integration-admin-key', readiness: async () => {
        if (!databaseAvailable) throw new Error('Database unavailable');
        return prisma.$queryRaw`SELECT 1`;
      },
    }).listen(0, '127.0.0.1');
    await once(apiServer, 'listening');
    apiOrigin = origin(apiServer);
    bffServer = createBff({ apiBaseUrl: apiOrigin, apiKey: 'integration-service-key', webOrigin: 'http://localhost:5173' }).listen(0, '127.0.0.1');
    await once(bffServer, 'listening');
    bffOrigin = origin(bffServer);
    // No mocked API/fetch: load the real browser client after configuring its BFF origin.
    vi.stubEnv('VITE_BFF_URL', bffOrigin);
    ({ dom } = await import('./dom'));
    ui = await import('@testing-library/react');
    ({ MemoryRouter } = await import('react-router-dom'));
    localStorage.clear();
    App = (await import('../../apps/web/src/App')).default;
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  }, 30000);
  afterEach(() => { ui?.cleanup(); });
  afterAll(async () => {
    ui?.cleanup(); vi.unstubAllEnvs(); vi.restoreAllMocks();
    await close(bffServer); await close(apiServer);
    await prisma?.$disconnect(); await socket?.stop(); await db?.close(); dom?.window.close();
  });

  it('submits from React, persists an incorrect grade, saves/removes a bookmark, and reopens history', async () => {
    open(`/topics?subjectId=${first.subjectId}`);
    await ui.screen.findByRole('heading', { name: first.topicName }, { timeout: 10000 });
    ui.fireEvent.click(ui.screen.getByRole('link', { name: /Practice topic/ }));
    await ui.screen.findByText(first.prompt);
    expect(ui.screen.queryByText(first.explanation)).toBeNull();
    const wrong = first.options.find(option => option.id !== first.correctOptionId)!;
    ui.fireEvent.click(ui.screen.getByRole('radio', { name: new RegExp(wrong.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }));
    ui.fireEvent.click(ui.screen.getByRole('button', { name: /Check answer/ }));
    await ui.screen.findByText(first.explanation);
    const userId = localStorage.getItem('stepwise-session')!;
    const attempts = await prisma.userQuestionAttempt.findMany({ where: { userId } });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ questionId: first.id, selectedAnswer: wrong.id, isCorrect: false });
    await ui.waitFor(() => expect((ui.screen.getByRole('button', { name: 'Save question' }) as HTMLButtonElement).disabled).toBe(false));
    ui.fireEvent.click(ui.screen.getByRole('button', { name: 'Save question' }));
    await ui.screen.findByRole('button', { name: 'Saved' });
    expect(await prisma.bookmark.count({ where: { userId } })).toBe(1);

    // Remounting exercises persisted server state rather than practice router state.
    ui?.cleanup(); open('/attempts');
    const history = await ui.screen.findByText(first.prompt);
    ui.fireEvent.click(history.closest('a')!);
    await ui.screen.findByText(first.explanation);
    expect(ui.screen.getByText('Your answer')).toBeTruthy();
    ui?.cleanup(); open('/performance');
    await ui.screen.findByRole('img', { name: 'Latest-answer accuracy 0%' });
    expect(ui.screen.getByText(/0 latest answers correct out of 1 unique questions/)).toBeTruthy();
    ui?.cleanup(); open('/');
    await ui.screen.findByText('1 unique questions · 0 latest answers correct · 0% accuracy');
    ui?.cleanup(); open('/bookmarks');
    await ui.screen.findByText(first.prompt);
    ui.fireEvent.click(ui.screen.getByRole('button', { name: 'Saved' }));
    await ui.screen.findByRole('heading', { name: 'Your collection starts with one question' });
    expect(await prisma.bookmark.count({ where: { userId } })).toBe(0);
  }, 20000);

  it('checks health, CORS preflight, service protection, and database readiness failures', async () => {
    for (const service of [apiOrigin, bffOrigin]) {
      expect((await fetch(`${service}/health`)).status).toBe(200);
      const response = await fetch(`${service}/ready`);
      expect(await response.json()).toEqual({ status: 'ready', storage: 'postgresql' });
    }
    expect((await fetch(`${apiOrigin}/api/questions`)).status).toBe(401);
    const preflight = await fetch(`${bffOrigin}/bff/attempts`, { method: 'OPTIONS', headers: {
      Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-session-id',
    } });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect((await fetch(`${bffOrigin}/bff/subjects`, { headers: { Origin: 'https://untrusted.example' } })).status).toBe(403);
    databaseAvailable = false;
    try {
      for (const service of [apiOrigin, bffOrigin]) {
        expect((await fetch(`${service}/health`)).status).toBe(200);
        expect((await fetch(`${service}/ready`)).status).toBe(503);
      }
    } finally { databaseAvailable = true; }
  });

  it('runs the health command and fails when PostgreSQL readiness is unavailable', async () => {
    const html = await readFile(new URL('../../apps/web/index.html', import.meta.url), 'utf8');
    // Serve the actual HTML shell for the CLI's HTML check; React interactions
    // are covered above. This does not claim to test the Vite proxy or rendering.
    const web = createServer((_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(html); }).listen(0, '127.0.0.1');
    await once(web, 'listening');
    const run = () => promisify(execFile)(process.execPath, [fileURLToPath(new URL('../../scripts/check-health.mjs', import.meta.url)), '--require-database'], {
      env: { ...process.env, HEALTH_API_URL: apiOrigin, HEALTH_BFF_URL: bffOrigin, HEALTH_WEB_URL: origin(web) }, timeout: 20000,
    });
    try {
      const result = await run();
      expect(result.stdout.match(/PASS /g)).toHaveLength(6);
      expect(result.stderr).toBe('');
      databaseAvailable = false;
      await expect(run()).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('FAIL BFF → API readiness') });
    } finally { databaseAvailable = true; await close(web); }
  });
});
