import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SignJWT, generateKeyPair } from 'jose';
import { startHarness, newUser, type Harness, SUPABASE_URL } from './helpers.js';

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h.close();
});

describe('token verification', () => {
  it('rejects requests without a token', async () => {
    expect((await h.api().get('/api/me')).status).toBe(401);
  });
  it('rejects a garbage token', async () => {
    expect((await h.api('not.a.jwt').get('/api/me')).status).toBe(401);
  });
  it('rejects an expired token', async () => {
    const t = await h.tokenFor(newUser('exp'), { expired: true });
    expect((await h.api(t).get('/api/me')).status).toBe(401);
  });
  it('rejects a token from another issuer', async () => {
    const t = await h.tokenFor(newUser('iss'), { issuer: 'https://evil.example/auth/v1' });
    expect((await h.api(t).get('/api/me')).status).toBe(401);
  });
  it('rejects a token signed with a key the server does not know', async () => {
    const { privateKey } = await generateKeyPair('ES256');
    const t = await new SignJWT({ email: 'x@example.com' })
      .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
      .setSubject(newUser('forged').id)
      .setIssuer(`${SUPABASE_URL}/auth/v1`)
      .setAudience('authenticated')
      .setExpirationTime('1h')
      .sign(privateKey);
    expect((await h.api(t).get('/api/me')).status).toBe(401);
  });
  it('rejects an unsigned (alg none) token', async () => {
    const b = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const t = `${b({ alg: 'none' })}.${b({ sub: newUser('none').id, aud: 'authenticated', iss: `${SUPABASE_URL}/auth/v1`, exp: Date.now() / 1000 + 100 })}.`;
    expect((await h.api(t).get('/api/me')).status).toBe(401);
  });
  it('accepts a valid token and reports no profile yet', async () => {
    const u = newUser('fresh');
    const r = await h.api(await h.tokenFor(u)).get('/api/me');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ email: 'fresh@example.com', profile: null });
  });
});

describe('otp endpoints', () => {
  it('signup checks username then asks Supabase for a code with the username in metadata', async () => {
    const r = await h.api().post('/api/auth/otp/start', { identifier: 'new@example.com', mode: 'signup', username: 'NewPerson' });
    expect(r.status).toBe(200);
    expect(r.body.maskedEmail).toMatch(/@/);
    expect(h.sentOtps.at(-1)).toMatchObject({ email: 'new@example.com', createUser: true, data: { username: 'newperson' } });
  });
  it('signup rejects bad and reserved usernames', async () => {
    expect((await h.api().post('/api/auth/otp/start', { identifier: 'a@example.com', mode: 'signup', username: 'a b' })).status).toBe(400);
    expect((await h.api().post('/api/auth/otp/start', { identifier: 'a@example.com', mode: 'signup', username: 'admin' })).body.error.code).toBe('reserved_username');
  });
  it('login answers the same for unknown accounts and sends nothing', async () => {
    const before = h.sentOtps.length;
    const r = await h.api().post('/api/auth/otp/start', { identifier: 'ghost@example.com', mode: 'login' });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    const r2 = await h.api().post('/api/auth/otp/start', { identifier: 'nobody_here', mode: 'login' });
    expect(r2.status).toBe(200);
    expect(h.sentOtps.length).toBe(before);
  });
  it('verify returns a session only for the right code', async () => {
    await h.api().post('/api/auth/otp/start', { identifier: 'dana@example.com', mode: 'signup', username: 'dana' });
    const bad = await h.api().post('/api/auth/otp/verify', { identifier: 'dana@example.com', code: '000000' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('invalid_code');
    const good = await h.api().post('/api/auth/otp/verify', { identifier: 'dana@example.com', code: '123456' });
    expect(good.status).toBe(200);
    expect(good.body.access_token).toBe('session-for-dana@example.com');
  });
  it('login by username resolves the email on the server', async () => {
    const u = newUser('erin');
    await h.api(await h.tokenFor(u)).post('/api/me/onboarding', { username: 'erin', fullName: 'Erin' });
    const before = h.sentOtps.length;
    await h.api().post('/api/auth/otp/start', { identifier: 'erin', mode: 'signup', username: 'x' }).catch(() => undefined);
    h.sentOtps.length = before;
    // make Supabase "know" the address, then log in with the username only
    await h.deps.supabase.sendOtp('erin@example.com', { createUser: true });
    const r = await h.api().post('/api/auth/otp/start', { identifier: '@erin', mode: 'login' });
    expect(r.status).toBe(200);
    expect(r.body.maskedEmail).toMatch(/@/);
    expect(JSON.stringify(r.body)).not.toContain('erin@example.com');
    const v = await h.api().post('/api/auth/otp/verify', { identifier: 'erin', code: '123456' });
    expect(v.body.access_token).toBe('session-for-erin@example.com');
  });
  it('username availability', async () => {
    expect((await h.api().get('/api/auth/username-available?u=erin')).body).toEqual({ available: false, reason: 'taken' });
    expect((await h.api().get('/api/auth/username-available?u=free_name')).body).toEqual({ available: true });
    expect((await h.api().get('/api/auth/username-available?u=Bad%20Name')).body.reason).toBe('invalid');
  });
});

describe('onboarding and profile', () => {
  it('creates the profile once, and blocks other endpoints until then', async () => {
    const u = newUser('gina');
    const t = await h.tokenFor(u);
    expect((await h.api(t).get('/api/conversations')).body.error.code).toBe('not_onboarded');
    const r = await h.api(t).post('/api/me/onboarding', { username: 'Gina_1', fullName: ' Gina ', bio: 'hi' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ username: 'gina_1', fullName: 'Gina', bio: 'hi', avatarUrl: null });
    expect(r.body.connectCode).toMatch(/^[A-Z2-9]{10}$/);
    expect((await h.api(t).post('/api/me/onboarding', { username: 'gina_2', fullName: 'G' })).status).toBe(409);
    expect((await h.api(t).get('/api/conversations')).status).toBe(200);
  });
  it('refuses a username that is taken (case-insensitive)', async () => {
    const r = await h.api(await h.tokenFor(newUser('hank'))).post('/api/me/onboarding', { username: 'GINA_1', fullName: 'Hank' });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('username_taken');
  });
  it('updates name, bio and privacy settings; rejects junk', async () => {
    const t = await h.tokenFor(newUser('ivy'));
    const api = h.api(t);
    await api.post('/api/me/onboarding', { username: 'ivy', fullName: 'Ivy' });
    expect((await api.patch('/api/me', { fullName: 'Ivy Lee', bio: 'x'.repeat(161) })).status).toBe(400);
    const ok = await api.patch('/api/me', { fullName: 'Ivy Lee', bio: 'hello' });
    expect(ok.body).toMatchObject({ fullName: 'Ivy Lee', bio: 'hello' });
    const s = await api.patch('/api/me/settings', { showLastSeen: false, whoCanMessage: 'everyone' });
    expect(s.body.settings).toMatchObject({ showLastSeen: false, whoCanMessage: 'everyone', showOnline: true });
    expect((await api.patch('/api/me/settings', { whoCanMessage: 'nobody' })).status).toBe(400);
  });
  it('regenerates the connect code', async () => {
    const t = await h.tokenFor(newUser('jon'));
    const api = h.api(t);
    const first = (await api.post('/api/me/onboarding', { username: 'jon', fullName: 'Jon' })).body.connectCode;
    const next = (await api.post('/api/me/connect-code/regenerate')).body.connectCode;
    expect(next).not.toBe(first);
  });
});
