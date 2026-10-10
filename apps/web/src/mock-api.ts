import type { StudyApi } from './api';
import type { Attempt, Bookmark, Metrics, Page, StudyQuestion, SubmittedAnswer } from './types';
import { mockQuestions, mockSubjects, mockTopics, type MockQuestion } from './mock-data';

const storageKey = 'stepwise-mock-data-v1';
const userId = '70000000-0000-4000-8000-000000000001';
interface State { attempts: Attempt[]; bookmarks: Omit<Bookmark, 'question'>[] }
function publicQuestion(question: MockQuestion): StudyQuestion {
  return { id: question.id, subject: question.subject, topicId: question.topicId, difficulty: question.difficulty, prompt: question.prompt, options: question.options };
}
function questionById(id: string) {
  const question = mockQuestions.find(question => question.id === id);
  if (!question) throw new Error('Question not found');
  return question;
}
function initialState(): State {
  const now = Date.now();
  return {
    attempts: mockQuestions.map((question, index) => ({
      id: `50000000-0000-4000-8000-00000000000${index + 1}`, userId, questionId: question.id,
      selectedAnswer: index === 1 ? question.options.find(option => option.id !== question.correctOptionId)!.id : question.correctOptionId,
      isCorrect: index !== 1, timeTaken: [42, 55, 36][index]!, attemptedAt: new Date(now - (index + 1) * 3600000).toISOString(),
    })),
    bookmarks: [{ id: '60000000-0000-4000-8000-000000000001', questionId: mockQuestions[0]!.id, createdAt: new Date(now).toISOString() }],
  };
}
function loadState(): State {
  try {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return initialState();
    const state = JSON.parse(saved) as State;
    const validDate = (date: string) => typeof date === 'string' && Number.isFinite(Date.parse(date));
    if (!Array.isArray(state.attempts) || !Array.isArray(state.bookmarks)) return initialState();
    if (!state.attempts.every(attempt => typeof attempt.id === 'string' && validDate(attempt.attemptedAt) && Number.isInteger(attempt.timeTaken) && attempt.timeTaken >= 0 && questionById(attempt.questionId).options.some(option => option.id === attempt.selectedAnswer))) return initialState();
    if (!state.bookmarks.every(bookmark => typeof bookmark.id === 'string' && validDate(bookmark.createdAt) && questionById(bookmark.questionId))) return initialState();
    return { ...state, attempts: state.attempts.map(attempt => ({ ...attempt, userId, isCorrect: attempt.selectedAnswer === questionById(attempt.questionId).correctOptionId })) };
  } catch { return initialState(); }
}

export function createMockApi(): StudyApi {
  const state = loadState();
  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* Continue in memory if storage is unavailable. */ }
  }
  save();
  async function result<T>(value: T, signal?: AbortSignal): Promise<T> {
    signal?.throwIfAborted();
    return structuredClone(value);
  }
  function paginate<T>(rows: T[], page: number, limit: number): Page<T> {
    return { data: rows.slice((page - 1) * limit, page * limit), pagination: { page, limit, total: rows.length, pages: Math.ceil(rows.length / limit) } };
  }
  const newestAttempts = () => [...state.attempts].reverse().sort((a, b) => b.attemptedAt.localeCompare(a.attemptedAt));
  const savedBookmarks = () => [...state.bookmarks].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(bookmark => ({ ...bookmark, question: publicQuestion(questionById(bookmark.questionId)) }));
  function metrics(attempts: Attempt[]): Metrics {
    const correctAttempts = attempts.filter(attempt => attempt.isCorrect).length;
    return {
      totalAttempts: attempts.length, correctAttempts, questionsAnswered: new Set(attempts.map(attempt => attempt.questionId)).size,
      accuracy: attempts.length ? Math.round(correctAttempts / attempts.length * 100) : 0,
      averageTimeTaken: attempts.length ? Math.round(attempts.reduce((sum, attempt) => sum + attempt.timeTaken, 0) / attempts.length) : 0,
    };
  }
  function feedback(attempt: Attempt): SubmittedAnswer {
    const question = questionById(attempt.questionId);
    return { attemptId: attempt.id, questionId: question.id, selectedOptionId: attempt.selectedAnswer, correctOptionId: question.correctOptionId, correct: attempt.isCorrect, explanation: question.explanation };
  }
  return {
    dashboard: signal => {
      const latest = [...new Map([...newestAttempts()].reverse().map(attempt => [attempt.questionId, attempt])).values()];
      const correct = latest.filter(attempt => attempt.isCorrect).length;
      const bySubject = mockSubjects.map(subject => ({ ...subject, ...metrics(state.attempts.filter(attempt => questionById(attempt.questionId).subjectId === subject.id)) }));
      const byTopic = mockTopics.map(topic => ({ id: topic.id, name: topic.name, ...metrics(state.attempts.filter(attempt => questionById(attempt.questionId).topicId === topic.id)) }));
      return result({
        progress: { answered: latest.length, correct, accuracy: latest.length ? Math.round(correct / latest.length * 100) : 0 },
        performance: { ...metrics(state.attempts), bySubject, byTopic }, recentAttempts: newestAttempts().slice(0, 5),
        bookmarks: savedBookmarks().slice(0, 5), bookmarkCount: state.bookmarks.length,
      }, signal);
    },
    subjects: (page = 1, signal) => result(paginate(mockSubjects, page, 12), signal),
    subject: async (id, signal) => {
      const subject = mockSubjects.find(subject => subject.id === id);
      if (!subject) throw new Error('Subject not found');
      return result(subject, signal);
    },
    topics: (subjectId, page = 1, signal) => result(paginate(mockTopics.filter(topic => !subjectId || topic.subjectId === subjectId), page, 12), signal),
    questions: (filters = {}, signal) => {
      const rows = mockQuestions.filter(question => (!filters.subjectId || question.subjectId === filters.subjectId) && (!filters.topicId || question.topicId === filters.topicId) && (!filters.difficulty || question.difficulty === filters.difficulty));
      const page = paginate(rows, filters.page ?? 1, 10);
      return result({ data: page.data.map(publicQuestion), total: rows.length }, signal);
    },
    question: async (id, signal) => result(publicQuestion(questionById(id)), signal),
    answer: async input => {
      const question = questionById(input.questionId);
      if (!question.options.some(option => option.id === input.optionId)) throw new Error('Choose an option for this question');
      const timeTaken = input.timeTaken ?? 0;
      if (!Number.isInteger(timeTaken) || timeTaken < 0 || timeTaken > 2147483647) throw new Error('Invalid elapsed time');
      const attempt: Attempt = { id: crypto.randomUUID(), userId, questionId: question.id, selectedAnswer: input.optionId, isCorrect: input.optionId === question.correctOptionId, timeTaken, attemptedAt: new Date().toISOString() };
      state.attempts.push(attempt); save();
      return result(feedback(attempt));
    },
    attempts: (page = 1, signal) => result(paginate(newestAttempts(), page, 10), signal),
    explanation: async (id, signal) => {
      const attempt = state.attempts.find(attempt => attempt.id === id);
      if (!attempt) throw new Error('Attempt not found');
      return result(feedback(attempt), signal);
    },
    bookmarks: (page = 1, signal) => result(paginate(savedBookmarks(), page, 12), signal),
    saveBookmark: async questionId => {
      questionById(questionId);
      let bookmark = state.bookmarks.find(bookmark => bookmark.questionId === questionId);
      if (!bookmark) {
        bookmark = { id: crypto.randomUUID(), questionId, createdAt: new Date().toISOString() };
        state.bookmarks.push(bookmark); save();
      }
      return result({ ...bookmark, question: publicQuestion(questionById(questionId)) });
    },
    removeBookmark: async id => {
      const index = state.bookmarks.findIndex(bookmark => bookmark.id === id);
      if (index < 0) throw new Error('Bookmark not found');
      state.bookmarks.splice(index, 1); save();
    },
    findBookmark: (questionId, signal) => result(savedBookmarks().find(bookmark => bookmark.questionId === questionId) ?? null, signal),
  };
}
export const mockApi = createMockApi();
