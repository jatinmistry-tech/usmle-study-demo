import { timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import { HttpError } from './errors.js';
import { sessionSchema } from './validation.js';
export function secretMatches(supplied: string, expected: string): boolean {
  return Buffer.byteLength(supplied) === Buffer.byteLength(expected) && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}
export function requireAdmin(key: string): RequestHandler {
  return (req, _res, next) => {
    if (!key) throw new HttpError(503, 'Content administration is not configured');
    if (!secretMatches(req.header('x-admin-key') ?? '', key)) throw new HttpError(403, 'Admin key required', 'FORBIDDEN');
    next();
  };
}
export function sessionId(req: Request): string { return sessionSchema.parse(req.header('x-session-id')); }
