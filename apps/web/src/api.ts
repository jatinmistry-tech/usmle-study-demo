import type { SubmitAnswerRequest } from '@usmle/shared';
import type { Subject, Topic, Page, StudyQuestion, Attempt, Bookmark, Dashboard, SubmittedAnswer } from './types';
export const useMockData = import.meta.env.VITE_USE_MOCK_DATA === 'true';
const configuredUrl = (import.meta.env.VITE_BFF_URL ?? '').replace(/\/$/, '');
if (!useMockData && configuredUrl) {
  const url = new URL(configuredUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('VITE_BFF_URL must be a BFF origin without credentials or a path');
}
const storageKey = 'stepwise-session';
let sessionId: string | null = null;
try { sessionId = localStorage.getItem(storageKey); } catch { /* Storage can be disabled; keep a session in memory. */ }
if (!sessionId || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
  sessionId = crypto.randomUUID();
  try { localStorage.setItem(storageKey, sessionId); } catch { /* Continue without persistent browser storage. */ }
}
async function request<T>(path: string, options: RequestInit = {}): Promise<{ data: T; headers: Headers }> {
  const response = await fetch(`${configuredUrl}/bff${path}`, {
    ...options, headers: { 'Content-Type': 'application/json', 'x-session-id': sessionId! },
    signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? 'The study service is unavailable. Please try again.');
  }
  return { data: response.status === 204 ? undefined as T : await response.json() as T, headers: response.headers };
}
function query(values: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== '') params.set(key, String(value));
  return params.size ? `?${params}` : '';
}
async function get<T>(path: string, signal?: AbortSignal): Promise<T> { return (await request<T>(path, { signal })).data; }
const bffApi = {
  dashboard: (signal?: AbortSignal) => get<Dashboard>('/dashboard', signal),
  subjects: (page = 1, signal?: AbortSignal) => get<Page<Subject>>(`/subjects${query({ page, limit: 12 })}`, signal),
  subject: (id: string, signal?: AbortSignal) => get<Subject>(`/subjects/${encodeURIComponent(id)}`, signal),
  topics: (subjectId: string | undefined, page = 1, signal?: AbortSignal) => get<Page<Topic>>(`/topics${query({ subjectId, page, limit: 12 })}`, signal),
  questions: async (filters: { subjectId?: string; topicId?: string; difficulty?: string; page?: number } = {}, signal?: AbortSignal) => {
    const response = await request<StudyQuestion[]>(`/questions${query({ ...filters, page: filters.page ?? 1, limit: 10 })}`, { signal });
    return { data: response.data, total: Number(response.headers.get('x-total-count') ?? response.data.length) };
  },
  question: (id: string, signal?: AbortSignal) => get<StudyQuestion>(`/questions/${encodeURIComponent(id)}`, signal),
  answer: async (answer: SubmitAnswerRequest) => (await request<SubmittedAnswer>('/attempts', { method: 'POST', body: JSON.stringify(answer) })).data,
  attempts: (page = 1, signal?: AbortSignal) => get<Page<Attempt>>(`/attempts${query({ page, limit: 10 })}`, signal),
  explanation: (id: string, signal?: AbortSignal) => get<SubmittedAnswer>(`/attempts/${encodeURIComponent(id)}/explanation`, signal),
  bookmarks: (page = 1, signal?: AbortSignal) => get<Page<Bookmark>>(`/bookmarks${query({ page, limit: 12 })}`, signal),
  saveBookmark: async (questionId: string) => (await request<Bookmark>('/bookmarks', { method: 'POST', body: JSON.stringify({ questionId }) })).data,
  removeBookmark: async (id: string) => { await request<void>(`/bookmarks/${encodeURIComponent(id)}`, { method: 'DELETE' }); },
  findBookmark: async (questionId: string, signal?: AbortSignal): Promise<Bookmark | null> => {
    let page = 1;
    while (true) {
      const result = await get<Page<Bookmark>>(`/bookmarks${query({ page, limit: 100 })}`, signal);
      const found = result.data.find(bookmark => bookmark.questionId === questionId);
      if (found) return found;
      if (page >= result.pagination.pages) return null;
      page++;
    }
  },
};
export type StudyApi = typeof bffApi;
// Load demo fixtures only when enabled; real BFF requests remain unchanged.
let mockClient: Promise<StudyApi> | undefined;
function mock() { return mockClient ??= import('./mock-api').then(module => module.mockApi); }
const localApi: StudyApi = {
  dashboard: (...args) => mock().then(client => client.dashboard(...args)),
  subjects: (...args) => mock().then(client => client.subjects(...args)),
  subject: (...args) => mock().then(client => client.subject(...args)),
  topics: (...args) => mock().then(client => client.topics(...args)),
  questions: (...args) => mock().then(client => client.questions(...args)),
  question: (...args) => mock().then(client => client.question(...args)),
  answer: (...args) => mock().then(client => client.answer(...args)),
  attempts: (...args) => mock().then(client => client.attempts(...args)),
  explanation: (...args) => mock().then(client => client.explanation(...args)),
  bookmarks: (...args) => mock().then(client => client.bookmarks(...args)),
  saveBookmark: (...args) => mock().then(client => client.saveBookmark(...args)),
  removeBookmark: (...args) => mock().then(client => client.removeBookmark(...args)),
  findBookmark: (...args) => mock().then(client => client.findBookmark(...args)),
};
export const api: StudyApi = useMockData ? localApi : bffApi;
