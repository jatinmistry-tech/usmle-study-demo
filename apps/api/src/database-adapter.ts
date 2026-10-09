import './env.js';
import { PrismaPg } from '@prisma/adapter-pg';

export function createDatabaseAdapter(connectionString = process.env.DATABASE_URL, max = 5): PrismaPg {
  if (!connectionString) throw new Error('DATABASE_URL is required for Prisma');
  let protocol: string;
  try { protocol = new URL(connectionString).protocol; }
  catch { throw new Error('DATABASE_URL must be a valid PostgreSQL connection string'); }
  if (protocol !== 'postgres:' && protocol !== 'postgresql:') {
    throw new Error('DATABASE_URL must be a PostgreSQL connection string');
  }
  return new PrismaPg({ connectionString, max, connectionTimeoutMillis: 8000 });
}
