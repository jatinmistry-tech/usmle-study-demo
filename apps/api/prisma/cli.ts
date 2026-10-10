import '../src/env.js';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const [command, ...args] = process.argv.slice(2);
if (!command || !['migrate', 'db'].includes(command)) {
  throw new Error('Use the documented database scripts');
}
if (!process.env.DIRECT_URL) throw new Error('Set DIRECT_URL to your Neon direct connection string');
const require = createRequire(import.meta.url);
const result = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), command, ...args], {
  stdio: 'inherit', env: process.env,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
