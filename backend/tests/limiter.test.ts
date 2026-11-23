import { describe, expect, it } from 'vitest';
import { KeyedLimiter } from '../src/lib/limiter.js';
import { signFileUrl, verifyFileSignature, fileExpiry } from '../src/lib/signing.js';

describe('KeyedLimiter', () => {
  it('allows up to max per window then blocks, per key', () => {
    const l = new KeyedLimiter(1000, 3);
    const t = 1_000_000;
    expect([1, 2, 3, 4].map(() => l.take('a', t))).toEqual([true, true, true, false]);
    expect(l.take('b', t)).toBe(true);
    expect(l.take('a', t + 1001)).toBe(true);
    l.stop();
  });
});

describe('file url signing', () => {
  const secret = 's'.repeat(40);
  const id = '11111111-1111-4111-8111-111111111111';
  it('verifies its own signature and rejects tampering and expiry', () => {
    const url = new URL('http://x' + signFileUrl(secret, id));
    const e = Number(url.searchParams.get('e'));
    const s = url.searchParams.get('s')!;
    expect(verifyFileSignature(secret, id, e, s)).toBe(true);
    expect(verifyFileSignature(secret, id.replace('1111', '2222'), e, s)).toBe(false);
    expect(verifyFileSignature(secret, id, e + 1, s)).toBe(false);
    expect(verifyFileSignature(secret + 'x', id, e, s)).toBe(false);
    expect(verifyFileSignature(secret, id, e, s, (e + 5) * 1000)).toBe(false);
  });
  it('expiry is stable inside a 6 hour window and always at least 6 hours away', () => {
    const now = Date.UTC(2026, 0, 1, 10, 0, 0);
    expect(fileExpiry(now)).toBe(fileExpiry(now + 60_000));
    expect(fileExpiry(now) * 1000 - now).toBeGreaterThanOrEqual(6 * 3600 * 1000);
  });
});
