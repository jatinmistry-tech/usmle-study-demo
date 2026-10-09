import { Router } from 'express';
import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import { sessionId } from '../auth.js';
import { HttpError } from '../errors.js';
import { ensureSessionUser } from '../question-service.js';
import { idParams, pageQuery, attemptQuery, bookmarkInput, statsQuery } from '../validation.js';
import { paged, pagination, publicQuestionSelect, questionResponse } from './content.js';

interface StatsRow { totalAttempts: number; correctAttempts: number; questionsAnswered: number; averageTimeTaken: number | null }
interface GroupRow extends StatsRow { id: string; name: string }
function stats(row: StatsRow) {
  return { ...row, averageTimeTaken: Math.round((row.averageTimeTaken ?? 0) * 100) / 100, accuracy: row.totalAttempts ? Math.round(row.correctAttempts / row.totalAttempts * 100) : 0 };
}
export function learnerRouter(prisma: PrismaClient) {
  const router = Router();
  router.get('/attempts', async (req, res) => {
    const userId = sessionId(req);
    const query = attemptQuery.parse(req.query);
    const where = { userId, questionId: query.questionId };
    const [data, count] = await prisma.$transaction([
      prisma.userQuestionAttempt.findMany({ where, ...pagination(query), orderBy: [{ attemptedAt: 'desc' }, { id: 'desc' }] }),
      prisma.userQuestionAttempt.count({ where }),
    ]);
    paged(res, data, count, { page: query.page, limit: query.limit });
  });
  router.get('/attempts/:id', async (req, res) => {
    const userId = sessionId(req);
    const { id } = idParams.parse(req.params);
    const row = await prisma.userQuestionAttempt.findFirst({ where: { id, userId } });
    if (!row) throw new HttpError(404, 'Attempt not found');
    res.json(row);
  });
  router.get('/attempts/:id/explanation', async (req, res) => {
    const userId = sessionId(req);
    const { id } = idParams.parse(req.params);
    const row = await prisma.userQuestionAttempt.findFirst({
      where: { id, userId },
      include: { question: { select: { explanation: true, options: { select: { id: true, isCorrect: true } } } } },
    });
    if (!row) throw new HttpError(404, 'Attempt not found');
    const correctOptions = row.question.options.filter(option => option.isCorrect);
    if (correctOptions.length !== 1) throw new HttpError(409, 'Question must have exactly one correct option');
    res.json({ attemptId: row.id, questionId: row.questionId, selectedOptionId: row.selectedAnswer,
      correctOptionId: correctOptions[0]!.id, correct: row.isCorrect, explanation: row.question.explanation });
  });
  router.get('/bookmarks', async (req, res) => {
    const userId = sessionId(req);
    const query = pageQuery.parse(req.query);
    const [rows, count] = await prisma.$transaction([
      prisma.bookmark.findMany({ where: { userId }, ...pagination(query), orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: { question: { select: publicQuestionSelect } } }),
      prisma.bookmark.count({ where: { userId } }),
    ]);
    paged(res, rows.map(row => ({ ...row, question: questionResponse(row.question) })), count, query);
  });
  router.post('/bookmarks', async (req, res) => {
    const userId = sessionId(req);
    const { questionId } = bookmarkInput.parse(req.body);
    const result = await prisma.$transaction(async tx => {
      if (!await tx.question.findUnique({ where: { id: questionId }, select: { id: true } })) throw new HttpError(404, 'Question not found');
      await ensureSessionUser(tx, userId);
      const where = { userId_questionId: { userId, questionId } };
      const previous = await tx.bookmark.findUnique({ where });
      const bookmark = await tx.bookmark.upsert({ where, create: { userId, questionId }, update: {} });
      return { bookmark, created: !previous };
    });
    res.status(result.created ? 201 : 200).json(result.bookmark);
  });
  router.delete('/bookmarks/:id', async (req, res) => {
    const userId = sessionId(req);
    const { id } = idParams.parse(req.params);
    const result = await prisma.bookmark.deleteMany({ where: { id, userId } });
    if (!result.count) throw new HttpError(404, 'Bookmark not found');
    res.sendStatus(204);
  });
  router.get('/statistics', async (req, res) => {
    const userId = sessionId(req);
    const query = statsQuery.parse(req.query);
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;
    const base = Prisma.sql`
      FROM "UserQuestionAttempts" a
      JOIN "Questions" q ON q."Id" = a."QuestionId"
      JOIN "Topics" t ON t."Id" = q."TopicId"
      JOIN "Subjects" s ON s."Id" = t."SubjectId"
      WHERE a."UserId" = ${userId}::uuid
      AND (${from}::timestamptz IS NULL OR a."AttemptedAt" >= ${from}::timestamptz)
      AND (${to}::timestamptz IS NULL OR a."AttemptedAt" <= ${to}::timestamptz)`;
    const aggregate = Prisma.sql`count(*)::int AS "totalAttempts", count(*) FILTER (WHERE a."IsCorrect")::int AS "correctAttempts", count(DISTINCT a."QuestionId")::int AS "questionsAnswered", avg(a."TimeTaken")::float8 AS "averageTimeTaken"`;
    const [overall, subjects, topics] = await prisma.$transaction([
      prisma.$queryRaw<StatsRow[]>(Prisma.sql`SELECT ${aggregate} ${base}`),
      prisma.$queryRaw<GroupRow[]>(Prisma.sql`SELECT s."Id" AS id, s."Name" AS name, ${aggregate} ${base} GROUP BY s."Id", s."Name" ORDER BY s."Name", s."Id"`),
      prisma.$queryRaw<GroupRow[]>(Prisma.sql`SELECT t."Id" AS id, t."Name" AS name, ${aggregate} ${base} GROUP BY t."Id", t."Name" ORDER BY t."Name", t."Id"`),
    ]);
    res.json({ ...stats(overall[0] ?? { totalAttempts: 0, correctAttempts: 0, questionsAnswered: 0, averageTimeTaken: 0 }), bySubject: subjects.map(stats), byTopic: topics.map(stats) });
  });
  return router;
}
