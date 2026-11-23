import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import multer from 'multer';
import type { Deps } from './deps.js';
import type { AuthUser } from './auth.js';
import { HttpError, forbidden, unauthorized } from './lib/errors.js';

declare global {
  namespace Express {
    interface Request {
      auth: AuthUser;
    }
  }
}

export function requireAuth(deps: Deps): RequestHandler {
  return async (req, _res, next) => {
    try {
      const h = req.headers.authorization ?? '';
      const m = /^Bearer (.+)$/i.exec(h);
      if (!m) throw unauthorized();
      req.auth = await deps.verifyToken(m[1]!);
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Users that finished onboarding. Only positive answers are cached, so a new profile works immediately. */
const known = new Set<string>();

export async function isOnboarded(deps: Pick<Deps, 'db'>, userId: string): Promise<boolean> {
  if (known.has(userId)) return true;
  const r = await deps.db.query('select 1 from profiles where id = $1', [userId]);
  if (r.rowCount) {
    if (known.size > 50_000) known.clear();
    known.add(userId);
    return true;
  }
  return false;
}

export function forgetOnboarded(userId: string) {
  known.delete(userId);
}

export function requireProfile(deps: Deps): RequestHandler {
  return async (req, _res, next) => {
    try {
      if (!(await isOnboarded(deps, req.auth.id))) throw forbidden('not_onboarded', 'Finish setting up your profile first.');
      next();
    } catch (err) {
      next(err);
    }
  };
}

export const notFoundHandler: RequestHandler = (_req, _res, next) => next(new HttpError(404, 'not_found', 'Not found.'));

export function errorHandler(deps: Pick<Deps, 'log'>): ErrorRequestHandler {
  return (err, req: Request, res: Response, _next: NextFunction) => {
    let status = 500;
    let code = 'server_error';
    let message = 'Something went wrong on our side. Please try again.';
    if (err instanceof HttpError) {
      status = err.status;
      code = err.code;
      message = err.message;
    } else if (err instanceof multer.MulterError) {
      status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      code = err.code === 'LIMIT_FILE_SIZE' ? 'file_too_large' : 'upload_error';
      message = err.code === 'LIMIT_FILE_SIZE' ? 'That file is too large.' : 'The upload could not be processed.';
    } else if (err?.type === 'entity.too.large') {
      status = 413;
      code = 'payload_too_large';
      message = 'That request is too large.';
    } else if (err?.type === 'entity.parse.failed') {
      status = 400;
      code = 'invalid_json';
      message = 'The request body is not valid JSON.';
    }
    if (status >= 500) deps.log.error({ err, url: req.url, method: req.method }, 'request failed');
    res.status(status).json({ error: { code, message } });
  };
}
