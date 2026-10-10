import './env.js';
export const apiKey = process.env.API_KEY ?? '';
export const adminKey = process.env.API_ADMIN_KEY ?? '';
export const databaseUrl = process.env.DATABASE_URL;
if (process.env.NODE_ENV === 'production' && (!apiKey || !adminKey || !databaseUrl)) {
  throw new Error('Production API requires API_KEY, API_ADMIN_KEY and DATABASE_URL');
}

if (adminKey && adminKey === apiKey) throw new Error('API_ADMIN_KEY must differ from API_KEY');
