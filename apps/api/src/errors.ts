import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string, public code = 'REQUEST_ERROR') { super(message); }
}
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', issues: error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })) }); return;
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message, code: error.code }); return;
  }
  if (error?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Invalid JSON body', code: 'INVALID_JSON' }); return;
  }
  if (error?.type === 'entity.too.large') {
    res.status(413).json({ error: 'Request body too large', code: 'BODY_TOO_LARGE' }); return;
  }
  const databaseErrors: Record<string, [number, string]> = {
    P2002: [409, 'Resource already exists'], P2003: [409, 'A referenced resource is missing or still in use'],
    P2025: [404, 'Resource not found'], P2034: [409, 'Concurrent update; please retry'],
    P1001: [503, 'Database is temporarily unavailable'], P1002: [503, 'Database is temporarily unavailable'],
    P2024: [503, 'Database is temporarily unavailable'], P2028: [503, 'Transaction could not complete; please retry'],
  };
  const mapped = typeof error?.code === 'string' ? databaseErrors[error.code] : undefined;
  if (mapped) { res.status(mapped[0]).json({ error: mapped[1], code: error.code }); return; }
  // Never serialize SQL, stack traces, connection URLs, or driver messages to clients/logs.
  console.error('Unhandled API request error');
  res.status(500).json({ error: 'Unable to process request', code: 'INTERNAL_ERROR' });
};
