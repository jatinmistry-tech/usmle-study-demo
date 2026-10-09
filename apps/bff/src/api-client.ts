export class GatewayError extends Error {
  constructor(public status: number, message: string, public code: string) { super(message); }
}
export interface ApiResponse { status: number; body: unknown; headers: Record<string, string> }
interface Options { baseUrl: string; apiKey: string; timeoutMs?: number; fetcher?: typeof fetch }
const maximumResponseBytes = 2 * 1024 * 1024;
export function normalizeBaseUrl(value: string): string {
  // Render's hostport environment references omit the scheme.
  const input = /^[a-z\d.-]+:\d+$/i.test(value) ? `http://${value}` : value;
  let url: URL;
  try { url = new URL(input); } catch { throw new Error('API_BASE_URL must be a valid HTTP(S) origin'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('API_BASE_URL must be an HTTP(S) origin without credentials or a path');
  }
  return url.origin;
}
const invalidUpstream = () => new GatewayError(502, 'Practice service is temporarily unavailable', 'UPSTREAM_ERROR');
async function readJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw invalidUpstream();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) cancel();
  const decoder = new TextDecoder();
  let length = 0;
  let text = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximumResponseBytes) { await reader.cancel(); throw invalidUpstream(); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
}
export function createApiClient({ baseUrl, apiKey, timeoutMs = 8000, fetcher = fetch }: Options) {
  const origin = normalizeBaseUrl(baseUrl);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new Error('API_TIMEOUT_MS must be between 1 and 30000');
  return async (path: string, options: { method?: 'GET' | 'POST' | 'DELETE'; session?: string; body?: unknown; query?: Record<string, string | number | undefined>; signal?: AbortSignal } = {}): Promise<ApiResponse> => {
    // Callers use fixed allowlisted paths and validated UUIDs; never accept arbitrary upstream URLs.
    if ((path !== '/ready' && !path.startsWith('/api/')) || path.includes('..') || path.includes('?') || path.includes('#')) throw invalidUpstream();
    const url = new URL(path, origin);
    for (const [key, value] of Object.entries(options.query ?? {})) if (value !== undefined) url.searchParams.set(key, String(value));
    const controller = new AbortController();
    const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
    let expired = false;
    const timer = setTimeout(() => { expired = true; controller.abort(); }, timeoutMs);
    let abortListener: () => void = () => {};
    const aborted = new Promise<never>((_resolve, reject) => {
      abortListener = () => reject(expired ? new GatewayError(504, 'Practice service timed out', 'UPSTREAM_TIMEOUT') : invalidUpstream());
      signal.addEventListener('abort', abortListener, { once: true });
      if (signal.aborted) abortListener();
    });
    try {
      return await Promise.race([aborted, (async () => {
        const response = await fetcher(url.toString(), {
          method: options.method ?? 'GET', redirect: 'error', signal,
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'x-api-key': apiKey, 'x-session-id': options.session ?? '' },
          ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        });
        if (!response.ok) {
          // Never relay upstream driver messages, secrets, or service-auth errors.
          await response.body?.cancel();
          const messages: Record<number, string> = { 400: 'Invalid request', 404: 'Resource not found', 409: 'Resource conflict', 413: 'Request body too large', 422: 'Invalid request', 429: 'Too many requests' };
          if (messages[response.status]) throw new GatewayError(response.status, messages[response.status]!, 'UPSTREAM_REQUEST_ERROR');
          throw invalidUpstream();
        }
        const body = response.status === 204 ? null : await readJson(response, signal);
        const headers: Record<string, string> = {};
        for (const name of ['x-total-count', 'x-page', 'x-limit']) {
          const value = response.headers.get(name);
          if (value && /^\d+$/.test(value)) headers[name] = value;
        }
        return { status: response.status, body, headers };
      })()]);
    } catch (error) {
      if (error instanceof GatewayError) throw error;
      if (expired) throw new GatewayError(504, 'Practice service timed out', 'UPSTREAM_TIMEOUT');
      throw invalidUpstream();
    } finally {
      clearTimeout(timer); signal.removeEventListener('abort', abortListener); controller.abort();
    }
  };
}
// Defense against accidental answer leakage from future API response changes.
export function hideAnswers(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(hideAnswers);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !['explanation', 'isCorrect', 'correctOptionId', 'correct', 'selectedAnswer', 'selectedOptionId'].includes(key)).map(([key, item]) => [key, hideAnswers(item)]));
  }
  return value;
}
