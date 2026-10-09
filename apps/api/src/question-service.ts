import type { AnswerResult } from '@usmle/shared';
import type { PrismaClient, Prisma } from './generated/prisma/client.js';
import { HttpError } from './errors.js';
import type { z } from 'zod';
import type { answerInput } from './validation.js';
export type AnswerInput = z.infer<typeof answerInput>;
export async function lockQuestion(tx: Prisma.TransactionClient, id: string): Promise<void> {
  const found = await tx.$queryRaw<{ Id: string }[]>`SELECT "Id" FROM "Questions" WHERE "Id" = ${id}::uuid FOR UPDATE`;
  if (!found.length) throw new HttpError(404, 'Question not found');
}
export async function editableQuestion(tx: Prisma.TransactionClient, id: string): Promise<void> {
  await lockQuestion(tx, id);
  if (await tx.userQuestionAttempt.count({ where: { questionId: id } })) {
    throw new HttpError(409, 'Questions with recorded attempts cannot be changed; create a new question');
  }
}
export async function ensureSessionUser(tx: Prisma.TransactionClient, id: string): Promise<void> {
  await tx.user.upsert({ where: { id }, create: { id, name: 'Demo learner', email: `guest-${id}@demo.invalid` }, update: {} });
}
export async function submitAnswer(prisma: PrismaClient, userId: string, input: AnswerInput): Promise<AnswerResult & { attemptId: string }> {
  return prisma.$transaction(async tx => {
    // Content mutations acquire the same parent lock, so grading observes one consistent answer key.
    await lockQuestion(tx, input.questionId);
    const question = await tx.question.findUniqueOrThrow({ where: { id: input.questionId }, include: { options: true } });
    const selected = question.options.find(option => option.id === input.optionId);
    if (!selected) throw new HttpError(400, 'Selected option does not belong to this question');
    const correctOptions = question.options.filter(option => option.isCorrect);
    if (correctOptions.length !== 1) throw new HttpError(409, 'Question must have exactly one correct option');
    const correctOption = correctOptions[0]!;
    await ensureSessionUser(tx, userId);
    const attempt = await tx.userQuestionAttempt.create({ data: {
      userId, questionId: question.id, selectedAnswer: selected.id, isCorrect: selected.isCorrect, timeTaken: input.timeTaken,
    } });
    return { attemptId: attempt.id, questionId: question.id, selectedOptionId: selected.id, correctOptionId: correctOption.id, correct: selected.isCorrect, explanation: question.explanation };
  });
}
