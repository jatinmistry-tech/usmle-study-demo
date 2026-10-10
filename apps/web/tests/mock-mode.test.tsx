// @vitest-environment jsdom
import type { ComponentType } from 'react';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { mockQuestions } from '../src/mock-data';
let App: ComponentType;
const fetcher = vi.fn().mockRejectedValue(new Error('Mock mode must not access the network'));
beforeAll(async () => {
  vi.stubEnv('VITE_USE_MOCK_DATA', 'true');
  vi.stubEnv('VITE_BFF_URL', 'not-a-valid-origin');
  vi.stubGlobal('fetch', fetcher);
  localStorage.clear();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  App = (await import('../src/App')).default;
});
afterEach(cleanup);
afterAll(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function open(path: string) { render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>); }
it('runs actual React routes with the mock client and no BFF requests', async () => {
  open('/subjects');
  await screen.findByRole('heading', { name: 'Biochemistry' });
  expect(screen.getByRole('note').textContent).toContain('Local demo');
  fireEvent.click(screen.getAllByRole('link', { name: /Browse topics/ })[0]!);
  await screen.findByRole('heading', { name: mockQuestions[0]!.topicName });
  fireEvent.click(screen.getByRole('link', { name: /Practice topic/ }));
  const question = mockQuestions[0]!;
  await screen.findByText(question.prompt);
  expect(screen.queryByText(question.explanation)).toBeNull();
  fireEvent.click(screen.getAllByRole('radio')[0]!);
  fireEvent.click(screen.getByRole('button', { name: /Check answer/ }));
  await screen.findByText(question.explanation);
  fireEvent.click(screen.getByRole('link', { name: /Open answer review/ }));
  await screen.findByRole('heading', { name: 'Understand the reasoning.' });
  await screen.findByText(question.explanation);
  cleanup(); open('/bookmarks');
  await screen.findByText(question.prompt);
  fireEvent.click(screen.getByRole('button', { name: 'Saved' }));
  await screen.findByRole('heading', { name: 'Your collection starts with one question' });
  cleanup(); open('/');
  await screen.findByText('3 unique questions · 2 latest answers correct · 67% accuracy');
  cleanup(); open('/performance');
  await screen.findByRole('img', { name: 'Latest-answer accuracy 67%' });
  cleanup(); open('/attempts');
  await waitFor(() => expect(screen.getAllByText(question.prompt)).toHaveLength(2));
  expect(fetcher).not.toHaveBeenCalled();
});
