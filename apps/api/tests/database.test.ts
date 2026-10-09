import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createApp as createBff } from '../../bff/src/app.js';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createPrismaClient } from '../src/prisma.js';
import { PrismaStore } from '../src/store.js';
import { createApp } from '../src/app.js';
import { questions } from '../src/questions.js';

const execute = promisify(execFile);
const first = questions[0]!;
const second = questions[1]!;
let db: PGlite;
let server: PGLiteSocketServer;
let prisma: ReturnType<typeof createPrismaClient>;
let databaseUrl: string;

describe('Prisma with embedded PostgreSQL', () => {
  beforeAll(async () => {
    db = await PGlite.create();
    server = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 0 });
    await server.start();
    databaseUrl = `postgresql://postgres:postgres@${server.getServerConn()}/postgres?sslmode=disable`;
    const apiDirectory = fileURLToPath(new URL('..', import.meta.url));
    const cliPath = fileURLToPath(new URL('../prisma/cli.ts', import.meta.url));
    for (let run = 0; run < 2; run++) {
      await execute(process.execPath, ['--import', 'tsx', cliPath, 'migrate', 'deploy'], {
        cwd: apiDirectory,
        env: { ...process.env, DIRECT_URL: databaseUrl, PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: '1' },
        timeout: 30000,
      });
    }
    prisma = createPrismaClient(databaseUrl, 1);
  }, 30000);
  afterAll(async () => {
    await prisma?.$disconnect();
    await server?.stop();
    await db?.close();
  });

  it('seeds deterministically without duplicate rows or fictional user activity', async () => {
    const seedPath = fileURLToPath(new URL('../prisma/cli.ts', import.meta.url));
    for (let run = 0; run < 2; run++) {
      await execute(process.execPath, ['--import', 'tsx', seedPath, 'db', 'seed'], {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        env: { ...process.env, DIRECT_URL: databaseUrl, DATABASE_URL: databaseUrl }, timeout: 30000,
      });
    }
    expect(await prisma.subject.count()).toBe(3);
    expect(await prisma.topic.count()).toBe(3);
    expect(await prisma.question.count()).toBe(3);
    expect(await prisma.questionOption.count()).toBe(12);
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.userQuestionAttempt.count()).toBe(0);
    for (const question of await prisma.question.findMany({ include: { options: true } })) {
      expect(question.options.filter(option => option.isCorrect)).toHaveLength(1);
    }
  }, 30000);

  it('persists complete attempt history and summarizes only the latest answer', async () => {
    const store = new PrismaStore(prisma);
    const app = createApp(store);
    const userId = randomUUID();
    const wrong = first.options.find(option => option.id !== first.correctOptionId)!;
    const response = await request(app).get('/api/questions').expect(200);
    expect(response.body[0]).not.toHaveProperty('explanation');
    expect(response.body[0].options[0]).not.toHaveProperty('isCorrect');
    for (const optionId of [wrong.id, first.correctOptionId]) {
      await request(app).post('/api/answers').set('x-session-id', userId)
        .send({ questionId: first.id, optionId, timeTaken: 17 }).expect(200);
    }
    expect(await prisma.userQuestionAttempt.count({ where: { userId } })).toBe(2);
    expect(await store.progress(userId)).toEqual({ answered: 1, correct: 1, accuracy: 100 });
    expect(await store.progress(randomUUID())).toEqual({ answered: 0, correct: 0, accuracy: 0 });
  });

  it('enforces option ownership, elapsed-time checks, and bookmark uniqueness', async () => {
    const user = await prisma.user.create({ data: { name: 'Fictional test learner', email: `${randomUUID()}@example.invalid` } });
    const base = { userId: user.id, questionId: first.id, selectedAnswer: first.correctOptionId, isCorrect: true, timeTaken: 5 };
    const insert = (optionId: string, seconds: number) => db.query(
      `INSERT INTO "UserQuestionAttempts" ("Id", "UserId", "QuestionId", "SelectedAnswer", "IsCorrect", "TimeTaken") VALUES ($1, $2, $3, $4, true, $5)`,
      [randomUUID(), user.id, first.id, optionId, seconds],
    );
    await expect(insert(second.correctOptionId, 5)).rejects.toMatchObject({ code: '23503' });
    await expect(insert(randomUUID(), 5)).rejects.toMatchObject({ code: '23503' });
    await expect(insert(first.correctOptionId, -1)).rejects.toMatchObject({ code: '23514' });
    await prisma.userQuestionAttempt.create({ data: base });
    await prisma.bookmark.create({ data: { userId: user.id, questionId: first.id } });
    await expect(db.query(
      `INSERT INTO "Bookmarks" ("Id", "UserId", "QuestionId") VALUES ($1, $2, $3)`,
      [randomUUID(), user.id, first.id],
    )).rejects.toMatchObject({ code: '23505' });
    await expect(db.query(`DELETE FROM "Questions" WHERE "Id" = $1`, [first.id])).rejects.toMatchObject({ code: '23503' });
    await prisma.user.delete({ where: { id: user.id } });
    expect(await prisma.bookmark.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.userQuestionAttempt.count({ where: { userId: user.id } })).toBe(0);
  });

  it('supports subjects/topics CRUD, pagination, validation, and admin protection', async () => {
    const app = createApp(new PrismaStore(prisma), 'service-key', { prisma, adminKey: 'admin-key' });
    const admin = { 'x-api-key': 'service-key', 'x-admin-key': 'admin-key' };
    const reader = { 'x-api-key': 'service-key' };
    await request(app).get('/api/subjects').expect(401);
    await request(app).post('/api/subjects').set(reader).send({ name: 'Unauthorized' }).expect(403);
    await request(app).post('/api/subjects').set(admin).send({ name: '   ' }).expect(400);
    await request(app).post('/api/subjects').set(admin).send({ name: 'Extra', userId: randomUUID() }).expect(400);
    const subject = (await request(app).post('/api/subjects').set(admin).send({ name: 'New subject' }).expect(201)).body;
    expect((await request(app).get(`/api/subjects/${subject.id}`).set(reader).expect(200)).body.name).toBe('New subject');
    await request(app).patch(`/api/subjects/${subject.id}`).set(admin).send({ name: 'Updated subject' }).expect(200);
    await request(app).put(`/api/subjects/${subject.id}`).set(admin).send({ name: 'Final subject' }).expect(200);
    const page = await request(app).get('/api/subjects?page=2&limit=2').set(reader).expect(200);
    expect(page.body.pagination).toMatchObject({ total: 4, page: 2, limit: 2 });
    expect(page.body.data).toHaveLength(2);
    await request(app).get('/api/subjects?limit=101').set(reader).expect(400);
    await request(app).get('/api/subjects/not-a-uuid').set(reader).expect(400);
    await request(app).get(`/api/subjects/${randomUUID()}`).set(reader).expect(404);
    await request(app).post('/api/topics').set(admin).send({ subjectId: randomUUID(), name: 'Missing parent' }).expect(404);
    const topic = (await request(app).post('/api/topics').set(admin).send({ subjectId: subject.id, name: 'New topic' }).expect(201)).body;
    await request(app).patch(`/api/topics/${topic.id}`).set(admin).send({}).expect(400);
    await request(app).patch(`/api/topics/${topic.id}`).set(admin).send({ name: 'Updated topic' }).expect(200);
    expect((await request(app).get(`/api/topics?subjectId=${subject.id}`).set(reader).expect(200)).body.data).toHaveLength(1);
    await request(app).get(`/api/topics/${topic.id}`).set(reader).expect(200);
    await request(app).put(`/api/topics/${topic.id}`).set(admin).send({ subjectId: subject.id, name: 'Final topic' }).expect(200);
    await request(app).delete(`/api/subjects/${subject.id}`).set(admin).expect(409);
    await request(app).delete(`/api/topics/${topic.id}`).set(admin).expect(204);
    await request(app).delete(`/api/subjects/${subject.id}`).set(admin).expect(204);
  });

  it('creates/updates/deletes questions and options without exposing answer keys', async () => {
    const app = createApp(new PrismaStore(prisma), '', { prisma, adminKey: 'admin-key' });
    const admin = { 'x-admin-key': 'admin-key' };
    const body = { topicId: first.topicId, questionText: 'Fictional lab: which option follows the stated premise?', explanation: 'SECRET explanation', difficulty: 'EASY', options: [{ optionText: 'Correct premise', isCorrect: true }, { optionText: 'Incorrect premise', isCorrect: false }] };
    await request(app).post('/api/questions').set(admin).send({ ...body, options: body.options.map(option => ({ ...option, isCorrect: true })) }).expect(400);
    await request(app).post('/api/questions').set(admin).send({ ...body, options: body.options.map(option => ({ ...option, isCorrect: false })) }).expect(400);
    const question = (await request(app).post('/api/questions').set(admin).send(body).expect(201)).body;
    const hidden = (value: unknown) => {
      const json = JSON.stringify(value);
      expect(json).not.toContain('isCorrect'); expect(json).not.toContain('explanation'); expect(json).not.toContain('SECRET');
    };
    hidden(question);
    hidden((await request(app).get(`/api/questions/${question.id}`).expect(200)).body);
    const list = await request(app).get(`/api/questions?topicId=${first.topicId}&difficulty=EASY`).expect(200);
    expect(list.body.map((row: { id: string }) => row.id)).toEqual([question.id]);
    expect(list.headers['x-total-count']).toBe('1'); hidden(list.body);
    await request(app).patch(`/api/questions/${question.id}`).set(admin).send({ questionText: 'Updated fictional lab premise' }).expect(200);
    hidden((await request(app).put(`/api/questions/${question.id}`).set(admin).send({ topicId: body.topicId, questionText: body.questionText, explanation: body.explanation, difficulty: body.difficulty }).expect(200)).body);
    const added = (await request(app).post(`/api/questions/${question.id}/options`).set(admin).send({ optionText: 'Extra distractor', isCorrect: false }).expect(201)).body;
    hidden(added);
    await request(app).get(`/api/questions/${question.id}/options/${added.id}`).expect(200);
    await request(app).patch(`/api/questions/${question.id}/options/${added.id}`).set(admin).send({ optionText: 'Edited distractor' }).expect(200);
    await request(app).delete(`/api/questions/${question.id}/options/${added.id}`).set(admin).expect(204);
    await request(app).delete(`/api/questions/${question.id}/options/${question.options[0].id}`).set(admin).expect(400);
    await request(app).post(`/api/questions/${question.id}/options`).set(admin).send({ optionText: 'Second correct answer', isCorrect: true }).expect(400);
    const options = (await request(app).put(`/api/questions/${question.id}/options`).set(admin).send({ options: body.options }).expect(200)).body;
    hidden(options); expect(options).toHaveLength(2);
    hidden((await request(app).get(`/api/questions/${question.id}/options`).expect(200)).body);
    await request(app).delete(`/api/topics/${first.topicId}`).set(admin).expect(409);
    await request(app).delete(`/api/questions/${question.id}`).set(admin).expect(204);
    await request(app).get(`/api/questions/${question.id}`).expect(404);
    expect(await prisma.questionOption.count({ where: { questionId: question.id } })).toBe(0);
  });

  it('grades on the server, scopes attempts/statistics, and protects recorded history', async () => {
    const app = createApp(new PrismaStore(prisma), '', { prisma, adminKey: 'admin-key' });
    const userId = randomUUID();
    const headers = { 'x-session-id': userId };
    const wrong = first.options.find(option => option.id !== first.correctOptionId)!;
    await request(app).get('/api/attempts').expect(400);
    await request(app).post('/api/answers').set(headers).send({ questionId: first.id, optionId: wrong.id, isCorrect: true }).expect(400);
    await request(app).post('/api/answers').set(headers).send({ questionId: first.id, optionId: second.correctOptionId }).expect(400);
    expect(await prisma.userQuestionAttempt.count({ where: { userId } })).toBe(0);
    const incorrect = (await request(app).post('/api/answers').set(headers).send({ questionId: first.id, optionId: wrong.id, timeTaken: 10 }).expect(200)).body;
    expect(incorrect.correct).toBe(false); expect(incorrect.explanation).toBe(first.explanation);
    const correct = (await request(app).post('/api/answers').set(headers).send({ questionId: first.id, optionId: first.correctOptionId, timeTaken: 20 }).expect(200)).body;
    expect(correct.correct).toBe(true);
    const review = await request(app).get(`/api/attempts/${correct.attemptId}/explanation`).set(headers).expect(200);
    expect(review.body.explanation).toBe(first.explanation);
    await request(app).get(`/api/attempts/${correct.attemptId}/explanation`).set('x-session-id', randomUUID()).expect(404);
    const attempts = (await request(app).get(`/api/attempts?questionId=${first.id}`).set(headers).expect(200)).body;
    expect(attempts.pagination.total).toBe(2);
    expect(attempts.data.map((attempt: { isCorrect: boolean }) => attempt.isCorrect).sort()).toEqual([false, true]);
    await request(app).get(`/api/attempts/${correct.attemptId}`).set(headers).expect(200);
    await request(app).get(`/api/attempts/${correct.attemptId}`).set('x-session-id', randomUUID()).expect(404);
    await request(app).get(`/api/attempts?userId=${randomUUID()}`).set(headers).expect(400);
    const stats = (await request(app).get('/api/statistics').set(headers).expect(200)).body;
    expect(stats).toMatchObject({ totalAttempts: 2, correctAttempts: 1, questionsAnswered: 1, accuracy: 50, averageTimeTaken: 15 });
    expect(stats.bySubject[0]).toMatchObject({ id: first.subjectId, totalAttempts: 2, accuracy: 50 });
    expect(stats.byTopic[0]).toMatchObject({ id: first.topicId, totalAttempts: 2 });
    const empty = (await request(app).get('/api/statistics').set('x-session-id', randomUUID()).expect(200)).body;
    expect(empty).toMatchObject({ totalAttempts: 0, accuracy: 0, averageTimeTaken: 0, bySubject: [], byTopic: [] });
    expect((await request(app).get('/api/statistics?from=2999-01-01T00:00:00Z').set(headers).expect(200)).body.totalAttempts).toBe(0);
    await request(app).get('/api/statistics?from=2026-10-08T00:00:00Z&to=2026-01-01T00:00:00Z').set(headers).expect(400);
    await request(app).patch(`/api/questions/${first.id}`).set('x-admin-key', 'admin-key').send({ explanation: 'Changed' }).expect(409);
    await request(app).put(`/api/questions/${first.id}/options`).set('x-admin-key', 'admin-key').send({ options: [{ optionText: 'A', isCorrect: true }, { optionText: 'B', isCorrect: false }] }).expect(409);
    await request(app).delete(`/api/questions/${first.id}`).set('x-admin-key', 'admin-key').expect(409);
  });

  it('handles bookmarks idempotently, hides keys, and enforces session ownership', async () => {
    const app = createApp(new PrismaStore(prisma), '', { prisma, adminKey: 'admin-key' });
    const headers = { 'x-session-id': randomUUID() };
    await request(app).post('/api/bookmarks').set(headers).send({ questionId: randomUUID() }).expect(404);
    const bookmark = (await request(app).post('/api/bookmarks').set(headers).send({ questionId: second.id }).expect(201)).body;
    const duplicate = (await request(app).post('/api/bookmarks').set(headers).send({ questionId: second.id }).expect(200)).body;
    expect(duplicate.id).toBe(bookmark.id);
    const list = (await request(app).get('/api/bookmarks').set(headers).expect(200)).body;
    expect(list.data).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain('isCorrect'); expect(JSON.stringify(list)).not.toContain('explanation');
    expect((await request(app).get('/api/bookmarks').set('x-session-id', randomUUID()).expect(200)).body.data).toEqual([]);
    await request(app).delete(`/api/bookmarks/${bookmark.id}`).set('x-session-id', randomUUID()).expect(404);
    await request(app).delete(`/api/bookmarks/${bookmark.id}`).set(headers).expect(204);
    await request(app).delete(`/api/bookmarks/${bookmark.id}`).set(headers).expect(404);
  });


  it('serves React-facing BFF routes through the real REST API without database access in the BFF', async () => {
    const api = createApp(new PrismaStore(prisma), 'service-key', { prisma });
    const apiServer = api.listen(0, '127.0.0.1');
    await once(apiServer, 'listening');
    try {
      const { port } = apiServer.address() as AddressInfo;
      const bff = createBff({ apiBaseUrl: `http://127.0.0.1:${port}`, apiKey: 'service-key', webOrigin: 'http://localhost:5173' });
      const session = randomUUID();
      const headers = { 'x-session-id': session };
      const subjects = await request(bff).get('/bff/subjects').expect(200);
      expect(subjects.body.data).toHaveLength(3);
      const content = await request(bff).get('/bff/questions').expect(200);
      expect(content.body).toHaveLength(3);
      expect(JSON.stringify(content.body)).not.toContain('isCorrect');
      const answer = await request(bff).post('/bff/attempts').set(headers)
        .send({ questionId: first.id, optionId: first.correctOptionId, timeTaken: 12 }).expect(200);
      expect(answer.body.correct).toBe(true);
      const review = await request(bff).get(`/bff/attempts/${answer.body.attemptId}/explanation`).set(headers).expect(200);
      expect(review.body.explanation).toBe(first.explanation);
      await request(bff).post('/bff/bookmarks').set(headers).send({ questionId: first.id }).expect(201);
      const dashboard = await request(bff).get('/bff/dashboard').set(headers).expect(200);
      expect(dashboard.body.progress).toEqual({ answered: 1, correct: 1, accuracy: 100 });
      expect(dashboard.body.performance).toMatchObject({ totalAttempts: 1, accuracy: 100, averageTimeTaken: 12 });
      expect(dashboard.body.recentAttempts).toHaveLength(1);
      expect(dashboard.body.bookmarkCount).toBe(1);
      expect(JSON.stringify(dashboard.body.bookmarks)).not.toContain('isCorrect');
      await request(bff).get('/ready').expect(200);
    } finally {
      await new Promise<void>((resolve, reject) => apiServer.close(error => error ? reject(error) : resolve()));
    }
  });

});
