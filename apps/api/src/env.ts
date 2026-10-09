import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
// Load only the root server environment; injected platform values take precedence.
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });
