import { fileURLToPath } from 'node:url';
try { process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

const origins = {
  api: process.env.HEALTH_API_URL || `http://localhost:${process.env.API_PORT || 4001}`,
  bff: process.env.HEALTH_BFF_URL || `http://localhost:${process.env.BFF_PORT || 4000}`,
  web: process.env.HEALTH_WEB_URL || 'http://localhost:5173',
};
const requireDatabase = process.argv.includes('--require-database');
let failed = false;
async function check(label, origin, path, validate, html = false) {
  try {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('invalid origin');
    const response = await fetch(new URL(path, url), { signal: AbortSignal.timeout(12000), redirect: 'error' });
    if (!response.ok) throw new Error('unavailable');
    const value = html ? await response.text() : await response.json();
    if (!validate(value)) throw new Error('unexpected response');
    console.log(`PASS ${label}`);
  } catch {
    // Do not print response bodies, environment values, or connection details.
    console.error(`FAIL ${label}: unavailable or unexpected response`);
    failed = true;
  }
}
const ready = body => body.status === 'ready' && (!requireDatabase || body.storage === 'postgresql');
await Promise.all([
  check('React HTML', origins.web, '/', body => /id=["']root["']/.test(body), true),
  check('API liveness', origins.api, '/health', body => body.status === 'ok'),
  check('API readiness' + (requireDatabase ? ' (PostgreSQL required)' : ''), origins.api, '/ready', ready),
  check('BFF liveness', origins.bff, '/health', body => body.status === 'ok'),
  check('BFF → API readiness' + (requireDatabase ? ' (PostgreSQL required)' : ''), origins.bff, '/ready', ready),
]);
if (requireDatabase) await check('BFF → API catalog', origins.bff, '/bff/subjects?limit=1', body => Array.isArray(body.data) && Number.isInteger(body.pagination?.total));
process.exitCode = failed ? 1 : 0;
