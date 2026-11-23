import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { Config } from './config.js';
import type { SessionResponse } from '../../shared/types.js';
import { HttpError, unauthorized } from './lib/errors.js';

export interface AuthUser {
  id: string;
  email: string;
  metadata: Record<string, unknown>;
}

export type TokenVerifier = (token: string) => Promise<AuthUser>;

export function createTokenVerifier(cfg: Pick<Config, 'SUPABASE_URL' | 'SUPABASE_JWT_SECRET'>, getKey?: JWTVerifyGetKey): TokenVerifier {
  const issuer = `${cfg.SUPABASE_URL.replace(/\/+$/, '')}/auth/v1`;
  const jwks = getKey ?? createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), { cooldownDuration: 30_000, cacheMaxAge: 10 * 60_000 });
  const secret = cfg.SUPABASE_JWT_SECRET ? new TextEncoder().encode(cfg.SUPABASE_JWT_SECRET) : null;

  return async (token) => {
    try {
      const { alg } = decodeProtectedHeader(token);
      let payload;
      if (alg === 'HS256') {
        if (!secret) throw new Error('hs256 token but no secret configured');
        ({ payload } = await jwtVerify(token, secret, { issuer, audience: 'authenticated', algorithms: ['HS256'] }));
      } else {
        ({ payload } = await jwtVerify(token, jwks, { issuer, audience: 'authenticated', algorithms: ['ES256', 'RS256', 'EdDSA'] }));
      }
      if (!payload.sub) throw new Error('no subject');
      return {
        id: payload.sub,
        email: typeof payload.email === 'string' ? payload.email.toLowerCase() : '',
        metadata: (payload.user_metadata as Record<string, unknown>) ?? {},
      };
    } catch {
      throw unauthorized();
    }
  };
}

export interface SupabaseAuthApi {
  sendOtp(email: string, opts: { createUser: boolean; data?: Record<string, unknown> }): Promise<void>;
  verifyOtp(email: string, token: string): Promise<SessionResponse>;
}

/** Thrown by sendOtp when the address has no account and creating one was not requested. */
export class UnknownAccountError extends Error {}

export function createSupabaseAuthApi(cfg: Pick<Config, 'SUPABASE_URL' | 'SUPABASE_PUBLISHABLE_KEY'>): SupabaseAuthApi {
  const base = `${cfg.SUPABASE_URL.replace(/\/+$/, '')}/auth/v1`;
  const headers = { apikey: cfg.SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' };

  async function call(path: string, body: unknown) {
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(12_000) });
    } catch {
      throw new HttpError(502, 'auth_provider_unreachable', 'Sign-in is temporarily unavailable. Try again in a moment.');
    }
    const text = await res.text();
    let json: any = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      /* not json */
    }
    return { res, json };
  }

  return {
    async sendOtp(email, { createUser, data }) {
      const { res, json } = await call('/otp', { email, create_user: createUser, data: data ?? {} });
      if (res.ok) return;
      const code = String(json.error_code ?? json.code ?? '');
      if (res.status === 429 || code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') {
        throw new HttpError(429, 'otp_rate_limited', 'Too many codes requested. Wait a minute and try again.');
      }
      if (code === 'otp_disabled' || code === 'signup_disabled' || /signups not allowed/i.test(String(json.msg ?? json.message ?? ''))) {
        throw new UnknownAccountError();
      }
      throw new HttpError(502, 'auth_provider_error', 'We could not send the code. Try again in a moment.');
    },
    async verifyOtp(email, token) {
      const { res, json } = await call('/verify', { type: 'email', email, token });
      if (res.ok && json.access_token) {
        return { access_token: json.access_token, refresh_token: json.refresh_token, expires_in: json.expires_in, token_type: json.token_type ?? 'bearer' };
      }
      if (res.status === 429) throw new HttpError(429, 'otp_rate_limited', 'Too many attempts. Wait a minute and try again.');
      if (res.status >= 500) throw new HttpError(502, 'auth_provider_error', 'Sign-in is temporarily unavailable. Try again in a moment.');
      throw new HttpError(400, 'invalid_code', 'That code is wrong or has expired.');
    },
  };
}
