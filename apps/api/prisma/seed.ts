import '../src/env.js';
import { createPrismaClient } from '../src/prisma.js';
import { questions } from '../src/questions.js';
// Explicitly invoked only. No real users, attempts, or bookmarks are fabricated.
const prisma = createPrismaClient(process.env.DIRECT_URL);
try {
  await prisma.$transaction(async tx => {
    for (const question of questions) {
      await tx.subject.upsert({
        where: { id: question.subjectId },
        create: { id: question.subjectId, name: question.subject },
        update: { name: question.subject },
      });
      await tx.topic.upsert({
        where: { id: question.topicId },
        create: { id: question.topicId, subjectId: question.subjectId, name: question.topicName },
        update: { subjectId: question.subjectId, name: question.topicName },
      });
      await tx.question.upsert({
        where: { id: question.id },
        create: { id: question.id, topicId: question.topicId, questionText: question.prompt, explanation: question.explanation, difficulty: question.difficulty },
        update: { topicId: question.topicId, questionText: question.prompt, explanation: question.explanation, difficulty: question.difficulty },
      });
      for (const option of question.options) {
        const data = { questionId: question.id, optionText: option.text, isCorrect: option.id === question.correctOptionId };
        await tx.questionOption.upsert({ where: { id: option.id }, create: { id: option.id, ...data }, update: data });
      }
    }
  }, { timeout: 30000 });
  console.log(`Seeded ${questions.length} fictional demonstration questions`);
} catch {
  // Avoid logging an ORM error that may contain connection details.
  console.error('Seed failed. Verify database access and apply migrations first.');
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
