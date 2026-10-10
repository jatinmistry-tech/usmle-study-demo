import { PrismaClient } from './generated/prisma/client.js';
import { createDatabaseAdapter } from './database-adapter.js';
export function createPrismaClient(connectionString = process.env.DATABASE_URL, max = 5): PrismaClient {
  return new PrismaClient({ adapter: createDatabaseAdapter(connectionString, max) });
}
