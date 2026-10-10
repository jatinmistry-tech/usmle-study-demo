import { z } from 'zod';
export const uuid = z.uuid().transform(value => value.toLowerCase());
export const idParams = z.strictObject({ id: uuid });
export const sessionSchema = z.uuidv4().transform(value => value.toLowerCase());
const name = (max: number) => z.string().trim().min(1).max(max);
export const subjectInput = z.strictObject({ name: name(100) });
export const topicInput = z.strictObject({ subjectId: uuid, name: name(200) });
export const topicPatch = topicInput.partial().refine(value => Object.keys(value).length > 0, 'Provide at least one field');
export const difficulty = z.enum(['EASY', 'MEDIUM', 'HARD']);
export const optionInput = z.strictObject({ optionText: name(10000), isCorrect: z.boolean() });
export const optionPatch = optionInput.partial().refine(value => Object.keys(value).length > 0, 'Provide at least one field');
export const optionsInput = z.array(optionInput).min(2).max(8).refine(options => options.filter(option => option.isCorrect).length === 1, 'Exactly one option must be correct');
export const questionFields = z.strictObject({ topicId: uuid, questionText: name(20000), explanation: name(20000), difficulty });
export const questionInput = questionFields.extend({ difficulty: difficulty.default('MEDIUM'), options: optionsInput });
export const questionPatch = questionFields.partial().refine(value => Object.keys(value).length > 0, 'Provide at least one field');
export const replaceOptions = z.strictObject({ options: optionsInput });
export const answerInput = z.strictObject({ questionId: uuid, optionId: uuid, timeTaken: z.number().int().min(0).max(2147483647).default(0) });
export const bookmarkInput = z.strictObject({ questionId: uuid });
const positiveQuery = (max: number) => z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(max));
export const pageQuery = z.strictObject({ page: positiveQuery(10000).default(1), limit: positiveQuery(100).default(50) });
export const topicQuery = pageQuery.extend({ subjectId: uuid.optional() });
export const questionQuery = pageQuery.extend({ subjectId: uuid.optional(), topicId: uuid.optional(), difficulty: difficulty.optional() });
export const attemptQuery = pageQuery.extend({ questionId: uuid.optional() });
export const statsQuery = z.strictObject({
  from: z.iso.datetime({ offset: true }).optional(), to: z.iso.datetime({ offset: true }).optional(),
}).refine(value => !value.from || !value.to || Date.parse(value.from) <= Date.parse(value.to), 'from must precede to');
