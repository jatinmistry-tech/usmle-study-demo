import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { createApp } from './app.js';
import { readConfig } from './config.js';
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });
const { port, ...options } = readConfig(process.env);
const server = createApp(options).listen(port, '0.0.0.0', () => console.log(`BFF listening on ${port}`));
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    const deadline = setTimeout(() => process.exit(1), 10000);
    deadline.unref();
    server.close(() => process.exit(0));
  });
}
