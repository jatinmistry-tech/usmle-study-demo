import { apiKey, adminKey, databaseUrl } from './config.js';
import { createApp } from './app.js';
import { createPrismaClient } from './prisma.js';
import { MemoryStore, PrismaStore } from './store.js';
import { z } from 'zod';
const prisma = databaseUrl ? createPrismaClient(databaseUrl) : undefined;
// Fail startup if migrations have not been applied or the database is unavailable.
if (prisma) await prisma.question.count();
const app = createApp(prisma ? new PrismaStore(prisma) : new MemoryStore(), apiKey, { prisma, adminKey, readiness: () => prisma ? prisma.$queryRaw`SELECT 1` : Promise.resolve() });
const port = z.coerce.number().int().min(1).max(65535).parse(process.env.PORT ?? process.env.API_PORT ?? 4001);
const server = app.listen(port, '0.0.0.0', () => console.log(`API listening on ${port} (${prisma ? 'Prisma/PostgreSQL' : 'memory'})`));
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    const timeout = setTimeout(() => process.exit(1), 10000);
    timeout.unref();
    server.close(() => { void (prisma?.$disconnect() ?? Promise.resolve()).then(() => process.exit(0)).catch(() => process.exit(1)); });
  });
}
