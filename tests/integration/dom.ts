import { JSDOM } from 'jsdom';

// Keep Node's URL, fetch and streams for real servers/Prisma, while providing
// the DOM React needs. Vitest's browser environment rewrites server asset URLs.
export const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:5173' });
for (const key of ['window', 'document', 'navigator', 'localStorage', 'HTMLElement', 'Node', 'MutationObserver', 'getComputedStyle'] as const) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
}
