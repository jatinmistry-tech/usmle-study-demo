import type { AnswerResult, Progress, Question } from '@usmle/shared';
import type { PrismaClient } from './generated/prisma/client.js';
import { questions, toPublicQuestion, type PracticeQuestion } from './questions.js';
import { HttpError } from './errors.js';
import { submitAnswer, type AnswerInput } from './question-service.js';
export interface Attempt { sessionId: string; questionId: string; optionId: string; correct: boolean; timeTaken: number }
export interface AttemptStore {
  submit(userId: string, input: AnswerInput): Promise<AnswerResult>;
  questions(): Promise<Question[]>;
  question(id: string): Promise<PracticeQuestion | undefined>;
  progress(sessionId: string): Promise<Progress>;
}
function summary(answered: number, correct: number): Progress {
  return { answered, correct, accuracy: answered ? Math.round(correct / answered * 100) : 0 };
}
export class MemoryStore implements AttemptStore {
  private attempts: Attempt[] = [];
  async submit(userId: string, input: AnswerInput): Promise<AnswerResult> {
    const question = await this.question(input.questionId);
    if (!question) throw new HttpError(404, 'Question not found');
    if (!question.options.some(option => option.id === input.optionId)) throw new HttpError(400, 'Selected option does not belong to this question');
    const correct = input.optionId === question.correctOptionId;
    await this.save({ sessionId: userId, questionId: input.questionId, optionId: input.optionId, correct, timeTaken: input.timeTaken });
    return { questionId: question.id, selectedOptionId: input.optionId, correctOptionId: question.correctOptionId, correct, explanation: question.explanation };
  }
  async questions(): Promise<Question[]> { return questions.map(toPublicQuestion); }
  async question(id: string): Promise<PracticeQuestion | undefined> { return questions.find(question => question.id === id); }
  async save(attempt: Attempt): Promise<void> { this.attempts.push(attempt); }
  async progress(sessionId: string): Promise<Progress> {
    const latest = new Map<string, Attempt>();
    for (const attempt of this.attempts) {
      if (attempt.sessionId === sessionId) latest.set(attempt.questionId, attempt);
    }
    return summary(latest.size, [...latest.values()].filter(attempt => attempt.correct).length);
  }
}
export class PrismaStore implements AttemptStore {
  constructor(private prisma: PrismaClient) {}
  async submit(userId: string, input: AnswerInput): Promise<AnswerResult> { return submitAnswer(this.prisma, userId, input); }
  async questions(): Promise<Question[]> {
    const items = await this.prisma.question.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true, questionText: true,
        topic: { select: { subject: { select: { name: true } } } },
        options: { orderBy: { id: 'asc' }, select: { id: true, optionText: true } },
      },
    });
    return items.map(item => ({
      id: item.id, subject: item.topic.subject.name, prompt: item.questionText,
      options: item.options.map(option => ({ id: option.id, text: option.optionText })),
    }));
  }
  async question(id: string): Promise<PracticeQuestion | undefined> {
    const item = await this.prisma.question.findUnique({
      where: { id }, include: { topic: { include: { subject: true } }, options: { orderBy: { id: 'asc' } } },
    });
    if (!item) return undefined;
    const correctOptions = item.options.filter(option => option.isCorrect);
    if (correctOptions.length !== 1) throw new Error('Question must have exactly one correct option');
    return {
      id: item.id, subject: item.topic.subject.name, subjectId: item.topic.subjectId,
      topicId: item.topicId, topicName: item.topic.name, difficulty: item.difficulty,
      prompt: item.questionText, explanation: item.explanation,
      correctOptionId: correctOptions[0]!.id,
      options: item.options.map(option => ({ id: option.id, text: option.optionText })),
    };
  }
  async progress(sessionId: string): Promise<Progress> {
    // DISTINCT ON preserves full history while displaying the latest answer per question.
    const rows = await this.prisma.$queryRaw<{ answered: number; correct: number }[]>`
      SELECT count(*)::int AS answered, count(*) FILTER (WHERE "IsCorrect")::int AS correct
      FROM (
        SELECT DISTINCT ON ("QuestionId") "IsCorrect"
        FROM "UserQuestionAttempts"
        WHERE "UserId" = ${sessionId}::uuid
        ORDER BY "QuestionId", "AttemptedAt" DESC, "Id" DESC
      ) AS latest`;
    return summary(rows[0]?.answered ?? 0, rows[0]?.correct ?? 0);
  }
}
