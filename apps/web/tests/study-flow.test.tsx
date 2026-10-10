// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
const mocked = vi.hoisted(() => ({ dashboard: vi.fn(), subjects: vi.fn(), subject: vi.fn(), topics: vi.fn(), questions: vi.fn(), question: vi.fn(), answer: vi.fn(), attempts: vi.fn(), explanation: vi.fn(), bookmarks: vi.fn(), findBookmark: vi.fn(), saveBookmark: vi.fn(), removeBookmark: vi.fn() }));
vi.mock('../src/api', () => ({ api: mocked, useMockData: false }));
const subject = { id: '20000000-0000-4000-8000-000000000001', name: 'Biochemistry' };
const topic = { id: '30000000-0000-4000-8000-000000000001', subjectId: subject.id, name: 'Enzyme kinetics' };
const question = { id: '10000000-0000-4000-8000-000000000001', subject: subject.name, topicId: topic.id, prompt: 'Which change is expected in the fictional experiment?', options: [{ id: '40000000-0000-4000-8000-000000000011', text: 'First choice' }, { id: '40000000-0000-4000-8000-000000000012', text: 'Second choice' }] };
const result = { attemptId: '50000000-0000-4000-8000-000000000001', questionId: question.id, selectedOptionId: question.options[1]!.id, correctOptionId: question.options[0]!.id, correct: false, explanation: 'The server explanation is only available after submission.' };
const bookmark = { id: '60000000-0000-4000-8000-000000000001', questionId: question.id, createdAt: '2026-10-09T12:00:00Z', question };
const page = <T,>(data: T[]) => ({ data, pagination: { page: 1, limit: 12, total: data.length, pages: data.length ? 1 : 0 } });
function open(path: string) { render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>); }
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  mocked.subjects.mockResolvedValue(page([subject])); mocked.subject.mockResolvedValue(subject);
  mocked.topics.mockResolvedValue(page([topic])); mocked.questions.mockResolvedValue({ data: [question], total: 1 }); mocked.question.mockResolvedValue(question);
  mocked.answer.mockResolvedValue(result); mocked.explanation.mockResolvedValue(result);
  mocked.bookmarks.mockResolvedValue(page([])); mocked.findBookmark.mockResolvedValue(null);
  mocked.saveBookmark.mockResolvedValue(bookmark); mocked.removeBookmark.mockResolvedValue(undefined);
  mocked.attempts.mockResolvedValue(page([]));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe('routed study flows', () => {
  it('navigates from subjects to filtered topics and practice', async () => {
    open('/subjects');
    await screen.findByRole('heading', { name: 'Biochemistry' });
    fireEvent.click(screen.getByRole('link', { name: /Browse topics/ }));
    await screen.findByRole('heading', { name: 'Enzyme kinetics' });
    expect(mocked.topics).toHaveBeenCalledWith(subject.id, 1, expect.any(AbortSignal));
    fireEvent.click(screen.getByRole('link', { name: /Practice topic/ }));
    await screen.findByText(question.prompt);
    expect(mocked.questions).toHaveBeenCalledWith(expect.objectContaining({ topicId: topic.id }), expect.any(AbortSignal));
  });
  it('hides feedback until submission and navigates to a persisted explanation', async () => {
    open('/practice');
    await screen.findByText(question.prompt);
    expect(screen.queryByText(result.explanation)).toBeNull();
    const check = screen.getByRole('button', { name: /Check answer/ }) as HTMLButtonElement;
    expect(check.disabled).toBe(true);
    fireEvent.click(screen.getAllByRole('radio')[1]!);
    fireEvent.click(check);
    await screen.findByText(result.explanation);
    expect(mocked.answer).toHaveBeenCalledWith({ questionId: question.id, optionId: question.options[1]!.id, timeTaken: expect.any(Number) });
    expect(screen.getAllByRole('radio').every(radio => radio.matches(':disabled'))).toBe(true);
    fireEvent.click(screen.getByRole('link', { name: /Open answer review/ }));
    await screen.findByRole('heading', { name: 'Understand the reasoning.' });
    await screen.findByText(result.explanation);
    expect(mocked.explanation).toHaveBeenCalledWith(result.attemptId, expect.any(AbortSignal));
  });
  it('leaves a failed submission retryable without revealing feedback', async () => {
    mocked.answer.mockRejectedValueOnce(new Error('Submission unavailable'));
    open('/practice'); await screen.findByText(question.prompt);
    fireEvent.click(screen.getAllByRole('radio')[1]!);
    fireEvent.click(screen.getByRole('button', { name: /Check answer/ }));
    await screen.findByRole('alert');
    expect(screen.queryByText(result.explanation)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Check answer/ }));
    await screen.findByText(result.explanation);
    expect(mocked.answer).toHaveBeenCalledTimes(2);
  });
  it('removes a bookmark and reloads the collection', async () => {
    mocked.bookmarks.mockResolvedValueOnce(page([bookmark])).mockResolvedValue(page([]));
    open('/bookmarks'); await screen.findByText(question.prompt);
    fireEvent.click(screen.getByRole('button', { name: 'Saved' }));
    await screen.findByRole('heading', { name: 'Your collection starts with one question' });
    expect(mocked.removeBookmark).toHaveBeenCalledWith(bookmark.id);
  });
  it('reopens an explanation without router state, and does not display it after an ownership failure', async () => {
    mocked.explanation.mockRejectedValue(new Error('Resource not found'));
    open(`/explanations/${result.attemptId}`);
    await screen.findByRole('alert');
    expect(mocked.explanation).toHaveBeenCalledWith(result.attemptId, expect.any(AbortSignal));
    expect(screen.queryByText(result.explanation)).toBeNull();
    mocked.explanation.mockResolvedValue(result);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText(result.explanation);
  });
});
