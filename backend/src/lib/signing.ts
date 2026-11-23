import crypto from 'node:crypto';

const WINDOW_SECONDS = 6 * 60 * 60;

/** Expiry snaps to 6 hour windows so the same URL is returned for hours and browsers can cache the file. */
export function fileExpiry(nowMs = Date.now()): number {
  return (Math.floor(nowMs / 1000 / WINDOW_SECONDS) + 2) * WINDOW_SECONDS;
}

function mac(secret: string, id: string, exp: number): string {
  return crypto.createHmac('sha256', secret).update(`${id}.${exp}`).digest('hex').slice(0, 40);
}

export function signFileUrl(secret: string, id: string, nowMs = Date.now()): string {
  const exp = fileExpiry(nowMs);
  return `/api/files/${id}?e=${exp}&s=${mac(secret, id, exp)}`;
}

export function verifyFileSignature(secret: string, id: string, exp: number, sig: string, nowMs = Date.now()): boolean {
  if (!Number.isFinite(exp) || exp * 1000 < nowMs) return false;
  const expected = Buffer.from(mac(secret, id, exp));
  const given = Buffer.from(String(sig));
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}
