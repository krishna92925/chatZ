import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { Deps } from '../deps.js';
import { UnknownAccountError } from '../auth.js';
import { HttpError, conflict } from '../lib/errors.js';
import { KeyedLimiter } from '../lib/limiter.js';
import { parse } from '../lib/validate.js';
import { checkUsername, usernameTaken } from '../services/profiles.js';
import { RESERVED_USERNAMES, USERNAME_RE } from '../../../shared/constants.js';
import type { OtpStartResponse } from '../../../shared/types.js';

export function maskEmail(email: string): string {
  const [name = '', domain = ''] = email.split('@');
  const [host = '', ...rest] = domain.split('.');
  return `${name.slice(0, 1)}${'•'.repeat(Math.max(2, Math.min(name.length - 1, 5)))}@${host.slice(0, 1)}${'•'.repeat(2)}.${rest.join('.')}`;
}

const emailSchema = z.string().trim().toLowerCase().email().max(254);

export function authRoutes(deps: Deps): Router {
  const r = Router();
  const perIp = rateLimit({ windowMs: 15 * 60_000, limit: deps.config.NODE_ENV === 'test' ? 10_000 : 30, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'rate_limited', message: 'Too many attempts. Please wait a little.' } } });
  const startLimiter = new KeyedLimiter(60 * 60_000, deps.config.NODE_ENV === 'test' ? 10_000 : 6);
  const verifyLimiter = new KeyedLimiter(15 * 60_000, deps.config.NODE_ENV === 'test' ? 10_000 : 10);

  async function resolveEmail(identifier: string): Promise<string | null> {
    const id = identifier.trim().toLowerCase();
    if (id.includes('@')) return emailSchema.parse(id);
    const res = await deps.db.query('select email from profiles where lower(username) = $1', [id.replace(/^@/, '')]);
    return res.rows[0]?.email ?? null;
  }

  r.get('/username-available', rateLimit({ windowMs: 60_000, limit: deps.config.NODE_ENV === 'test' ? 10_000 : 60, standardHeaders: true, legacyHeaders: false }), async (req, res) => {
    const u = String(req.query.u ?? '').trim().toLowerCase();
    if (!USERNAME_RE.test(u)) return void res.json({ available: false, reason: 'invalid' });
    if (RESERVED_USERNAMES.includes(u)) return void res.json({ available: false, reason: 'reserved' });
    res.json((await usernameTaken(deps.db, u)) ? { available: false, reason: 'taken' } : { available: true });
  });

  const startSchema = z.object({
    identifier: z.string().trim().min(2).max(254),
    mode: z.enum(['login', 'signup']),
    username: z.string().trim().max(40).optional(),
  });

  r.post('/otp/start', perIp, async (req, res) => {
    const body = parse(startSchema, req.body);
    const id = body.identifier.toLowerCase();
    if (!startLimiter.take(id)) throw new HttpError(429, 'otp_rate_limited', 'Too many codes requested for this account. Try again in a while.');

    if (body.mode === 'signup') {
      const email = parse(emailSchema, id);
      const username = checkUsername(body.username ?? '');
      if (await usernameTaken(deps.db, username)) throw conflict('username_taken', 'That username is already taken.');
      await deps.supabase.sendOtp(email, { createUser: true, data: { username } });
      const out: OtpStartResponse = { ok: true, maskedEmail: maskEmail(email) };
      return void res.json(out);
    }

    // login: same answer whether or not the account exists
    const email = await resolveEmail(id).catch(() => null);
    if (email) {
      try {
        await deps.supabase.sendOtp(email, { createUser: false });
      } catch (err) {
        if (!(err instanceof UnknownAccountError)) throw err;
      }
    }
    const out: OtpStartResponse = { ok: true, maskedEmail: email ? maskEmail(email) : id.includes('@') ? maskEmail(id) : null };
    res.json(out);
  });

  const verifySchema = z.object({ identifier: z.string().trim().min(2).max(254), code: z.string().trim().regex(/^\d{6,10}$/, 'Enter the numeric code from the email.') });

  r.post('/otp/verify', perIp, async (req, res) => {
    const body = parse(verifySchema, req.body);
    const id = body.identifier.toLowerCase();
    if (!verifyLimiter.take(id)) throw new HttpError(429, 'otp_rate_limited', 'Too many wrong codes. Wait a few minutes and request a new code.');
    const email = await resolveEmail(id).catch(() => null);
    if (!email) throw new HttpError(400, 'invalid_code', 'That code is wrong or has expired.');
    res.json(await deps.supabase.verifyOtp(email, body.code));
  });

  return r;
}
