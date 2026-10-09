import { Router, type Response } from 'express';
import type { PrismaClient, Prisma } from '../generated/prisma/client.js';
import { requireAdmin } from '../auth.js';
import { HttpError } from '../errors.js';
import { editableQuestion } from '../question-service.js';
import { z } from 'zod';
import { uuid, idParams, subjectInput, topicInput, topicPatch, questionInput, questionPatch, questionFields, optionInput, optionPatch, replaceOptions, optionsInput, pageQuery, topicQuery, questionQuery } from '../validation.js';

export const publicQuestionSelect = {
  id: true, topicId: true, questionText: true, difficulty: true, createdDate: true,
  topic: { select: { subject: { select: { name: true } } } },
  options: { orderBy: { id: 'asc' }, select: { id: true, questionId: true, optionText: true } },
} as const satisfies Prisma.QuestionSelect;
type PublicRow = Prisma.QuestionGetPayload<{ select: typeof publicQuestionSelect }>;
export function questionResponse(row: PublicRow) {
  return {
    id: row.id, topicId: row.topicId, questionText: row.questionText, prompt: row.questionText,
    difficulty: row.difficulty, createdDate: row.createdDate, subject: row.topic.subject.name,
    options: row.options.map(option => ({ ...option, text: option.optionText })),
  };
}
const publicOption = { id: true, questionId: true, optionText: true } as const;
const optionParams = z.strictObject({ questionId: uuid, id: uuid });
const questionParams = z.strictObject({ questionId: uuid });
export function pagination(query: { page: number; limit: number }) { return { skip: (query.page - 1) * query.limit, take: query.limit }; }
export function paged<T>(res: Response, data: T[], total: number, query: { page: number; limit: number }) {
  res.json({ data, pagination: { ...query, total, pages: Math.ceil(total / query.limit) } });
}
function required<T>(value: T | null, resource: string): T {
  if (!value) throw new HttpError(404, `${resource} not found`);
  return value;
}
export function contentRouter(prisma: PrismaClient, adminKey: string) {
  const router = Router();
  const admin = requireAdmin(adminKey);
  router.get('/subjects', async (req, res) => {
    const query = pageQuery.parse(req.query);
    const [data, count] = await prisma.$transaction([prisma.subject.findMany({ ...pagination(query), orderBy: { id: 'asc' } }), prisma.subject.count()]);
    paged(res, data, count, query);
  });
  router.get('/subjects/:id', async (req, res) => {
    const { id } = idParams.parse(req.params);
    res.json(required(await prisma.subject.findUnique({ where: { id } }), 'Subject'));
  });
  router.post('/subjects', admin, async (req, res) => {
    res.status(201).json(await prisma.subject.create({ data: subjectInput.parse(req.body) }));
  });
  for (const method of ['put', 'patch'] as const) router[method]('/subjects/:id', admin, async (req, res) => {
    const { id } = idParams.parse(req.params);
    res.json(await prisma.subject.update({ where: { id }, data: subjectInput.parse(req.body) }));
  });
  router.delete('/subjects/:id', admin, async (req, res) => {
    const { id } = idParams.parse(req.params);
    await prisma.$transaction(async tx => {
      if (await tx.topic.count({ where: { subjectId: id } })) throw new HttpError(409, 'Subject still has topics');
      await tx.subject.delete({ where: { id } });
    });
    res.sendStatus(204);
  });
  router.get('/topics', async (req, res) => {
    const query = topicQuery.parse(req.query);
    const where = { subjectId: query.subjectId };
    const [data, count] = await prisma.$transaction([prisma.topic.findMany({ where, ...pagination(query), orderBy: { id: 'asc' } }), prisma.topic.count({ where })]);
    paged(res, data, count, { page: query.page, limit: query.limit });
  });
  router.get('/topics/:id', async (req, res) => {
    const { id } = idParams.parse(req.params);
    res.json(required(await prisma.topic.findUnique({ where: { id } }), 'Topic'));
  });
  router.post('/topics', admin, async (req, res) => {
    const data = topicInput.parse(req.body);
    required(await prisma.subject.findUnique({ where: { id: data.subjectId } }), 'Subject');
    res.status(201).json(await prisma.topic.create({ data }));
  });
  for (const method of ['put', 'patch'] as const) router[method]('/topics/:id', admin, async (req, res) => {
    const { id } = idParams.parse(req.params);
    const data = (method === 'put' ? topicInput : topicPatch).parse(req.body);
    if (data.subjectId) required(await prisma.subject.findUnique({ where: { id: data.subjectId } }), 'Subject');
    res.json(await prisma.topic.update({ where: { id }, data }));
  });
  router.delete('/topics/:id', admin, async (req, res) => {
    const { id } = idParams.parse(req.params);
    await prisma.$transaction(async tx => {
      if (await tx.question.count({ where: { topicId: id } })) throw new HttpError(409, 'Topic still has questions');
      await tx.topic.delete({ where: { id } });
    });
    res.sendStatus(204);
  });
  router.get('/questions', async (req, res) => {
    const query = questionQuery.parse(req.query);
    const where = { topicId: query.topicId, difficulty: query.difficulty, ...(query.subjectId ? { topic: { subjectId: query.subjectId } } : {}) };
    const [data, count] = await prisma.$transaction([
      prisma.question.findMany({ where, ...pagination(query), orderBy: { id: 'asc' }, select: publicQuestionSelect }), prisma.question.count({ where }),
    ]);
    // Keep the array contract used by the existing practice UI.
    res.set({ 'X-Total-Count': String(count), 'X-Page': String(query.page), 'X-Limit': String(query.limit) }).json(data.map(questionResponse));
  });
  router.get('/questions/:id', async (req, res) => {
    const { id } = idParams.parse(req.params);
    res.json(questionResponse(required(await prisma.question.findUnique({ where: { id }, select: publicQuestionSelect }), 'Question')));
  });
  router.post('/questions', admin, async (req, res) => {
    const { options, ...data } = questionInput.parse(req.body);
    required(await prisma.topic.findUnique({ where: { id: data.topicId } }), 'Topic');
    const row = await prisma.question.create({ data: { ...data, options: { create: options } }, select: publicQuestionSelect });
    res.status(201).json(questionResponse(row));
  });
  for (const method of ['put', 'patch'] as const) router[method]('/questions/:id', admin, async (req, res) => {
    const { id } = idParams.parse(req.params);
    const data = (method === 'put' ? questionFields : questionPatch).parse(req.body);
    const row = await prisma.$transaction(async tx => {
      await editableQuestion(tx, id);
      if (data.topicId) required(await tx.topic.findUnique({ where: { id: data.topicId } }), 'Topic');
      return tx.question.update({ where: { id }, data, select: publicQuestionSelect });
    });
    res.json(questionResponse(row));
  });
  router.delete('/questions/:id', admin, async (req, res) => {
    const { id } = idParams.parse(req.params);
    await prisma.$transaction(async tx => {
      await editableQuestion(tx, id);
      if (await tx.bookmark.count({ where: { questionId: id } })) throw new HttpError(409, 'Bookmarked questions cannot be deleted');
      await tx.questionOption.deleteMany({ where: { questionId: id } });
      await tx.question.delete({ where: { id } });
    });
    res.sendStatus(204);
  });
  router.get('/questions/:questionId/options', async (req, res) => {
    const { questionId } = questionParams.parse(req.params);
    required(await prisma.question.findUnique({ where: { id: questionId }, select: { id: true } }), 'Question');
    res.json(await prisma.questionOption.findMany({ where: { questionId }, select: publicOption, orderBy: { id: 'asc' } }));
  });
  router.get('/questions/:questionId/options/:id', async (req, res) => {
    const { id, questionId } = optionParams.parse(req.params);
    res.json(required(await prisma.questionOption.findFirst({ where: { id, questionId }, select: publicOption }), 'Option'));
  });
  router.post('/questions/:questionId/options', admin, async (req, res) => {
    const { questionId } = questionParams.parse(req.params);
    const data = optionInput.parse(req.body);
    const row = await prisma.$transaction(async tx => {
      await editableQuestion(tx, questionId);
      const current = await tx.questionOption.findMany({ where: { questionId }, select: { optionText: true, isCorrect: true } });
      optionsInput.parse([...current, data]);
      return tx.questionOption.create({ data: { ...data, questionId }, select: publicOption });
    });
    res.status(201).json(row);
  });
  router.put('/questions/:questionId/options', admin, async (req, res) => {
    const { questionId } = questionParams.parse(req.params);
    const { options } = replaceOptions.parse(req.body);
    const rows = await prisma.$transaction(async tx => {
      await editableQuestion(tx, questionId);
      await tx.questionOption.deleteMany({ where: { questionId } });
      await tx.questionOption.createMany({ data: options.map(option => ({ ...option, questionId })) });
      return tx.questionOption.findMany({ where: { questionId }, select: publicOption, orderBy: { id: 'asc' } });
    });
    res.json(rows);
  });
  router.patch('/questions/:questionId/options/:id', admin, async (req, res) => {
    const { id, questionId } = optionParams.parse(req.params);
    const data = optionPatch.parse(req.body);
    const row = await prisma.$transaction(async tx => {
      await editableQuestion(tx, questionId);
      const current = await tx.questionOption.findMany({ where: { questionId } });
      required(current.find(option => option.id === id) ?? null, 'Option');
      optionsInput.parse(current.map(option => ({ optionText: option.optionText, isCorrect: option.isCorrect, ...(option.id === id ? data : {}) })));
      return tx.questionOption.update({ where: { id }, data, select: publicOption });
    });
    res.json(row);
  });
  router.delete('/questions/:questionId/options/:id', admin, async (req, res) => {
    const { id, questionId } = optionParams.parse(req.params);
    await prisma.$transaction(async tx => {
      await editableQuestion(tx, questionId);
      const current = await tx.questionOption.findMany({ where: { questionId } });
      required(current.find(option => option.id === id) ?? null, 'Option');
      optionsInput.parse(current.filter(option => option.id !== id).map(({ optionText, isCorrect }) => ({ optionText, isCorrect })));
      await tx.questionOption.delete({ where: { id } });
    });
    res.sendStatus(204);
  });
  return router;
}
