import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

const destination = new URL('../.env', import.meta.url);
let template = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
for (const key of ['API_KEY', 'API_ADMIN_KEY']) {
  template = template.replace(new RegExp(`^${key}=$`, 'm'), `${key}=${randomBytes(32).toString('hex')}`);
}
try {
  await writeFile(destination, template, { flag: 'wx', mode: 0o600 });
  console.log('Created ignored root .env with distinct development service/admin secrets.');
  console.log('Add Neon DATABASE_URL and DIRECT_URL to enable the full application.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('Root .env already exists; preserved all existing values.');
}
