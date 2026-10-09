import './src/env.js';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // A placeholder lets validate/generate run without credentials or a live DB.
    // Database commands use the wrapper, which requires a real DIRECT_URL.
    //url: process.env.DIRECT_URL || 'postgresql://unused:unused@localhost:5432/unused',
    url: env('DIRECT_URL'),
  },
});
