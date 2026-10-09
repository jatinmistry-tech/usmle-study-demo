// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { createMockApi } from '../src/mock-api';
import { mockQuestions } from '../src/mock-data';
const first = mockQuestions[0]!;
beforeEach(() => localStorage.clear());
describe('standalone mock data', () => {
  it('filters and paginates catalog data without returning explanations or answer keys', async () => {
    const api = createMockApi();
    const subjects = await api.subjects();
    expect(subjects.data).toHaveLength(3);
    expect((await api.topics(first.subjectId)).data).toHaveLength(1);
    const questions = await api.questions({ topicId: first.topicId });
    expect(questions.total).toBe(1);
    expect(JSON.stringify(questions)).not.toContain('correctOptionId');
    expect(JSON.stringify(await api.question(first.id))).not.toContain('explanation');
    expect((await api.questions({ difficulty: 'HARD' })).total).toBe(0);
    expect((await api.questions({ page: 2 })).data).toHaveLength(0);
  });
  it('records submissions and retries, computes metrics, and persists explanation review', async () => {
    const api = createMockApi();
    const initial = await api.dashboard();
    const wrong = first.options.find(option => option.id !== first.correctOptionId)!;
    const answer = await api.answer({ questionId: first.id, optionId: wrong.id, timeTaken: 20 });
    expect(answer.correct).toBe(false);
    expect((await api.dashboard()).progress.correct).toBe(initial.progress.correct - 1);
    await api.answer({ questionId: first.id, optionId: first.correctOptionId });
    const restored = createMockApi();
    expect((await restored.dashboard()).performance.totalAttempts).toBe(initial.performance.totalAttempts + 2);
    expect((await restored.dashboard()).progress.correct).toBe(initial.progress.correct);
    expect((await restored.explanation(answer.attemptId!)).explanation).toBe(first.explanation);
    await expect(api.answer({ questionId: first.id, optionId: mockQuestions[1]!.options[0]!.id })).rejects.toThrow('Choose an option');
  });
  it('keeps bookmark writes idempotent and restores removals', async () => {
    const api = createMockApi();
    const bookmark = await api.saveBookmark(mockQuestions[1]!.id);
    expect((await api.saveBookmark(bookmark.questionId)).id).toBe(bookmark.id);
    await api.removeBookmark(bookmark.id);
    expect(await createMockApi().findBookmark(bookmark.questionId)).toBeNull();
  });
  it('recovers from corrupt storage and cancels obsolete reads', async () => {
    localStorage.setItem('stepwise-mock-data-v1', '{invalid');
    const api = createMockApi();
    expect((await api.dashboard()).performance.totalAttempts).toBe(3);
    const controller = new AbortController(); controller.abort();
    await expect(api.subjects(1, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
