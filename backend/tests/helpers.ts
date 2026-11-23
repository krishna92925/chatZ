import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet } from 'jose';
import { io as ioClient, type Socket } from 'socket.io-client';
import sharp from 'sharp';
import { createLogger } from '../src/logger.js';
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db/pool.js';
import { migrate } from '../src/db/migrate.js';
import { createApp } from '../src/app.js';
import { attachSocket } from '../src/socket/index.js';
import { createTokenVerifier, type SupabaseAuthApi, UnknownAccountError } from '../src/auth.js';
import { Presence } from '../src/services/presence.js';
import { MemoryStorage } from '../src/services/storage-memory.js';
import type { Deps } from '../src/deps.js';
import { realtime } from '../src/realtime.js';

export const SUPABASE_URL = 'https://fake-project.supabase.co';
export const ORIGIN = 'http://localhost:5173';

export interface Harness {
  deps: Deps;
  server: http.Server;
  url: string;
  storage: MemoryStorage;
  sentOtps: { email: string; createUser: boolean; data?: Record<string, unknown> }[];
  tokenFor(user: { id: string; email: string; username?: string }, opts?: { expired?: boolean; issuer?: string }): Promise<string>;
  api(token?: string): { get: (p: string) => Promise<Resp>; post: (p: string, b?: unknown) => Promise<Resp>; patch: (p: string, b?: unknown) => Promise<Resp>; del: (p: string, b?: unknown) => Promise<Resp> };
  connect(token: string, origin?: string): Promise<Socket>;
  close(): Promise<void>;
}
export interface Resp {
  status: number;
  body: any;
  headers: Headers;
}

export async function startHarness(): Promise<Harness> {
  const config = loadConfig({
    NODE_ENV: 'test',
    CLIENT_ORIGIN: ORIGIN,
    DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://chatz:chatz@127.0.0.1:5432/chatz_test',
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key_000000',
    FILE_URL_SECRET: 'test-file-secret-test-file-secret-123456',
    LOG_LEVEL: 'silent',
    AUTO_MIGRATE: 'false',
  } as NodeJS.ProcessEnv);
  const log = createLogger('silent');
  const db = createDb(config.DATABASE_URL, 5, log);
  await db.query('drop schema public cascade; create schema public;');
  await migrate(db, log);

  const { publicKey, privateKey } = await generateKeyPair('ES256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'ES256', use: 'sig' };
  const verifyToken = createTokenVerifier(config, createLocalJWKSet({ keys: [jwk] }));

  const sentOtps: Harness['sentOtps'] = [];
  const knownEmails = new Set<string>();
  const supabase: SupabaseAuthApi = {
    async sendOtp(email, opts) {
      if (!opts.createUser && !knownEmails.has(email)) throw new UnknownAccountError();
      knownEmails.add(email);
      sentOtps.push({ email, createUser: opts.createUser, data: opts.data });
    },
    async verifyOtp(email, token) {
      if (token !== '123456') throw Object.assign(new Error('bad'), { status: 400, code: 'invalid_code' });
      return { access_token: `session-for-${email}`, refresh_token: 'r', expires_in: 3600, token_type: 'bearer' };
    },
  };
  // make the fake mirror the real error shape for wrong codes
  const realVerify = supabase.verifyOtp;
  supabase.verifyOtp = async (e, t) => {
    try {
      return await realVerify(e, t);
    } catch {
      const { HttpError } = await import('../src/lib/errors.js');
      throw new HttpError(400, 'invalid_code', 'That code is wrong or has expired.');
    }
  };

  const storage = new MemoryStorage();
  const deps: Deps = { config, log, db, storage, verifyToken, supabase, presence: new Presence() };
  const app = createApp(deps);
  const server = http.createServer(app);
  attachSocket(server, deps);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const sockets: Socket[] = [];

  async function tokenFor(user: { id: string; email: string; username?: string }, opts: { expired?: boolean; issuer?: string } = {}) {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ email: user.email, role: 'authenticated', user_metadata: { username: user.username } })
      .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
      .setSubject(user.id)
      .setIssuer(opts.issuer ?? `${SUPABASE_URL}/auth/v1`)
      .setAudience('authenticated')
      .setIssuedAt(now - 100)
      .setExpirationTime(opts.expired ? now - 10 : now + 3600)
      .sign(privateKey);
  }

  function api(token?: string) {
    const call = async (method: string, path: string, body?: unknown): Promise<Resp> => {
      const res = await fetch(`${url}${path}`, {
        method,
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), Origin: ORIGIN },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let json: any;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = text;
      }
      return { status: res.status, body: json, headers: res.headers };
    };
    return { get: (p: string) => call('GET', p), post: (p: string, b?: unknown) => call('POST', p, b ?? {}), patch: (p: string, b?: unknown) => call('PATCH', p, b ?? {}), del: (p: string, b?: unknown) => call('DELETE', p, b) };
  }

  async function connect(token: string, origin: string = ORIGIN) {
    const s = ioClient(url, { auth: { token }, transports: ['websocket'], reconnection: false, extraHeaders: { Origin: origin } });
    sockets.push(s);
    await new Promise<void>((resolve, reject) => {
      s.once('connect', () => resolve());
      s.once('connect_error', (e) => reject(e));
    });
    return s;
  }

  return {
    deps, server, url, storage, sentOtps, tokenFor, api, connect,
    async close() {
      for (const s of sockets) s.close();
      realtime.io?.close();
      await db.close();
    },
  };
}

export const emitAck = <T = any>(s: Socket, event: string, payload: unknown): Promise<{ ok: boolean; data?: T; error?: { code: string; message: string } }> =>
  new Promise((resolve) => s.timeout(8000).emit(event, payload, (err: Error | null, res: any) => resolve(err ? { ok: false, error: { code: 'timeout', message: err.message } } : res)));

export const waitFor = <T = any>(s: Socket, event: string, ms = 4000): Promise<T> =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
    s.once(event, (p: T) => {
      clearTimeout(t);
      resolve(p);
    });
  });

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let counter = 0;
export function newUser(name: string) {
  counter++;
  const hex = counter.toString(16).padStart(12, '0');
  return { id: `00000000-0000-4000-8000-${hex}`, email: `${name}@example.com`, username: name };
}

export async function onboard(h: Harness, name: string, fullName = name) {
  const user = newUser(name);
  const token = await h.tokenFor(user);
  const res = await h.api(token).post('/api/me/onboarding', { username: name, fullName });
  if (res.status !== 201) throw new Error(`onboarding failed ${res.status} ${JSON.stringify(res.body)}`);
  return { ...user, token, profile: res.body, api: h.api(token) };
}

export async function makeFriends(a: Awaited<ReturnType<typeof onboard>>, b: Awaited<ReturnType<typeof onboard>>) {
  const r = await a.api.post('/api/friends/requests', { username: b.username });
  if (r.status !== 201) throw new Error(`request failed ${JSON.stringify(r.body)}`);
  const acc = await b.api.post(`/api/friends/requests/${r.body.requestId}/accept`);
  if (acc.status !== 200) throw new Error(`accept failed ${JSON.stringify(acc.body)}`);
  return acc.body.conversationId as string;
}

export async function pngBuffer(w = 600, h = 400) {
  return sharp({ create: { width: w, height: h, channels: 3, background: { r: 188, g: 171, b: 174 } } }).png().toBuffer();
}

export async function upload(_api: unknown, token: string, h: Harness, file: Buffer, name: string, type: string) {
  const fd = new FormData();
  fd.append('file', new Blob([new Uint8Array(file)], { type }), name);
  const res = await fetch(`${h.url}/api/uploads`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, Origin: ORIGIN }, body: fd });
  return { status: res.status, body: await res.json() };
}
