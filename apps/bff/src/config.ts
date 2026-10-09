import { z } from 'zod';
import { normalizeBaseUrl } from './api-client.js';
export function readConfig(env: NodeJS.ProcessEnv) {
  const production = env.NODE_ENV === 'production';
  const rawUrl = env.API_BASE_URL || 'http://localhost:4001';
  const apiBaseUrl = normalizeBaseUrl(rawUrl);
  const privateHostport = /^[a-z\d.-]+:\d+$/i.test(rawUrl);
  if (production && (!env.API_BASE_URL || !env.API_KEY || !env.WEB_ORIGIN)) {
    throw new Error('Production BFF requires API_BASE_URL, API_KEY and WEB_ORIGIN');
  }
  if (production && new URL(apiBaseUrl).protocol !== 'https:' && !privateHostport) {
    throw new Error('Production API_BASE_URL must use HTTPS or a Render private hostport reference');
  }
  const webOrigin = env.WEB_ORIGIN || 'http://localhost:5173';
  if (normalizeBaseUrl(webOrigin) !== webOrigin || (production && new URL(webOrigin).protocol !== 'https:')) {
    throw new Error('WEB_ORIGIN must be an exact browser origin; production requires HTTPS');
  }
  const port = z.coerce.number().int().min(1).max(65535).safeParse(env.PORT ?? env.BFF_PORT ?? 4000);
  const timeout = z.coerce.number().int().min(1).max(30000).safeParse(env.API_TIMEOUT_MS ?? 8000);
  if (!port.success || !timeout.success) throw new Error('Invalid BFF port or API_TIMEOUT_MS configuration');
  return { apiBaseUrl, apiKey: env.API_KEY ?? '', webOrigin, port: port.data, timeoutMs: timeout.data };
}
