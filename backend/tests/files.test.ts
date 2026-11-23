import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { startHarness, onboard, makeFriends, emitAck, pngBuffer, upload, ORIGIN, type Harness } from './helpers.js';
import { randomUUID } from 'node:crypto';

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h.close();
});

const mp4 = () => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.from([0, 0, 0, 0]), Buffer.from('mp42isom'), Buffer.alloc(2000, 1)]);

async function setup(an: string, bn: string) {
  const a = await onboard(h, an);
  const b = await onboard(h, bn);
  const convo = await makeFriends(a, b);
  return { a, b, convo, sa: await h.connect(a.token), sb: await h.connect(b.token) };
}

describe('uploads', () => {
  it('re-encodes images (EXIF stripped, resized, webp) and reports size', async () => {
    const a = await onboard(h, 'upl1');
    const big = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: '#bcabae' } }).jpeg().withMetadata({ exif: { IFD0: { Copyright: 'secret-gps' } } }).toBuffer();
    const r = await upload(a.api, a.token, h, big, 'holiday.jpg', 'image/jpeg');
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ kind: 'image', mime: 'image/webp' });
    expect(Math.max(r.body.width, r.body.height)).toBeLessThanOrEqual(1920);
    const stored = [...h.storage.objects.values()].at(-1)!.body;
    const meta = await sharp(stored).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
  });
  it('accepts video and plain files, rejects executables and fake images', async () => {
    const a = await onboard(h, 'upl2');
    expect((await upload(a.api, a.token, h, mp4(), 'clip.mp4', 'video/mp4')).body).toMatchObject({ kind: 'video', mime: 'video/mp4' });
    expect((await upload(a.api, a.token, h, Buffer.from('hello'), 'notes.txt', 'text/plain')).body).toMatchObject({ kind: 'file', name: 'notes.txt' });
    expect((await upload(a.api, a.token, h, Buffer.from('MZ\x90\x00'), 'setup.exe', 'application/octet-stream')).status).toBe(400);
    const lie = await upload(a.api, a.token, h, Buffer.from('not really an image'), 'cat.png', 'image/png');
    expect(lie.body.kind).toBe('file'); // detected by content, not by the name the client claimed
  });
  it('rejects unauthenticated uploads and sanitises file names', async () => {
    const res = await fetch(`${h.url}/api/uploads`, { method: 'POST', body: new FormData(), headers: { Origin: ORIGIN } });
    expect(res.status).toBe(401);
    const a = await onboard(h, 'upl3');
    const r = await upload(a.api, a.token, h, Buffer.from('x'), '../../etc/passwd', 'text/plain');
    expect(r.body.name).toBe('passwd');
  });
  it('enforces the 50 MB multipart ceiling', async () => {
    const a = await onboard(h, 'upl4');
    const r = await upload(a.api, a.token, h, Buffer.alloc(51 * 1024 * 1024, 7), 'huge.bin', 'application/octet-stream');
    expect(r.status).toBe(413);
    expect(r.body.error.code).toBe('file_too_large');
  }, 60_000);
});

describe('attachments in messages', () => {
  it('sends an image with a caption, the friend can open it through a signed link', async () => {
    const { a, b, convo, sa, sb } = await setup('att1', 'att2');
    const up = await upload(a.api, a.token, h, await pngBuffer(), 'pic.png', 'image/png');
    const got = new Promise<any>((r) => sb.once('message:new', r));
    const sent = await emitAck(sa, 'message:send', { conversationId: convo, clientId: randomUUID(), body: 'look', attachmentIds: [up.body.id] });
    expect(sent.ok).toBe(true);
    expect(sent.data.kind).toBe('image');
    const att = (await got).message.attachments[0];
    expect(att.url).toMatch(/^\/api\/files\/[0-9a-f-]+\?e=\d+&s=[0-9a-f]+$/);
    const file = await fetch(`${h.url}${att.url}`);
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('image/webp');
    expect(file.headers.get('x-content-type-options')).toBe('nosniff');
    expect((await sharp(Buffer.from(await file.arrayBuffer())).metadata()).format).toBe('webp');
    const history = (await b.api.get(`/api/conversations/${convo}/messages`)).body.messages[0];
    expect(history.attachments[0].id).toBe(up.body.id);
  });
  it('rejects tampered or expired links, and attachments owned by someone else or reused', async () => {
    const { a, convo, sa, sb } = await setup('att3', 'att4');
    const up = await upload(a.api, a.token, h, await pngBuffer(), 'p.png', 'image/png');
    const stolen = await emitAck(sb, 'message:send', { conversationId: convo, clientId: randomUUID(), attachmentIds: [up.body.id] });
    expect(stolen.error?.code).toBe('invalid_attachment');
    const ok = await emitAck(sa, 'message:send', { conversationId: convo, clientId: randomUUID(), attachmentIds: [up.body.id] });
    expect(ok.ok).toBe(true);
    const again = await emitAck(sa, 'message:send', { conversationId: convo, clientId: randomUUID(), attachmentIds: [up.body.id] });
    expect(again.error?.code).toBe('invalid_attachment');
    const url = ok.data.attachments[0].url as string;
    expect((await fetch(`${h.url}${url.replace(/s=[0-9a-f]/, 's=0')}`)).status).toBe(404);
    expect((await fetch(`${h.url}${url.replace(/e=\d+/, 'e=1')}`)).status).toBe(404);
    expect((await fetch(`${h.url}/api/files/${up.body.id}`)).status).toBe(404);
  });
  it('serves byte ranges so video can seek, and forces download for plain files', async () => {
    const { a, convo, sa } = await setup('att5', 'att6');
    const v = await upload(a.api, a.token, h, mp4(), 'v.mp4', 'video/mp4');
    const f = await upload(a.api, a.token, h, Buffer.from('<script>alert(1)</script>'), 'page.html', 'text/html');
    const m1 = await emitAck(sa, 'message:send', { conversationId: convo, clientId: randomUUID(), attachmentIds: [v.body.id] });
    const m2 = await emitAck(sa, 'message:send', { conversationId: convo, clientId: randomUUID(), attachmentIds: [f.body.id] });
    const part = await fetch(`${h.url}${m1.data.attachments[0].url}`, { headers: { Range: 'bytes=0-99' } });
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toMatch(/^bytes 0-99\//);
    expect((await part.arrayBuffer()).byteLength).toBe(100);
    const dl = await fetch(`${h.url}${m2.data.attachments[0].url}`);
    expect(dl.headers.get('content-type')).toBe('application/octet-stream');
    expect(dl.headers.get('content-disposition')).toMatch(/^attachment/);
    expect(dl.headers.get('content-security-policy')).toContain("default-src 'none'");
  });
  it('deleting a message for everyone removes the files from storage', async () => {
    const { a, convo, sa } = await setup('att7', 'att8');
    const up = await upload(a.api, a.token, h, await pngBuffer(), 'p.png', 'image/png');
    const before = h.storage.objects.size;
    const m = await emitAck(sa, 'message:send', { conversationId: convo, clientId: randomUUID(), attachmentIds: [up.body.id] });
    await emitAck(sa, 'message:delete', { messageId: m.data.id, scope: 'everyone' });
    await new Promise((r) => setTimeout(r, 100));
    expect(h.storage.objects.size).toBe(before - 1);
    expect((await fetch(`${h.url}${m.data.attachments[0].url}`)).status).toBe(404);
  });
});

describe('avatars', () => {
  it('uploads a square webp avatar, serves it publicly with long cache, and removes it', async () => {
    const a = await onboard(h, 'avat1');
    const fd = new FormData();
    fd.append('file', new Blob([new Uint8Array(await pngBuffer(900, 500))], { type: 'image/png' }), 'me.png');
    const res = await fetch(`${h.url}/api/me/avatar`, { method: 'POST', headers: { Authorization: `Bearer ${a.token}`, Origin: ORIGIN }, body: fd });
    const profile = await res.json();
    expect(res.status).toBe(200);
    expect(profile.avatarUrl).toBe(`/api/avatars/${a.id}?v=1`);
    const img = await fetch(`${h.url}${profile.avatarUrl}`);
    expect(img.status).toBe(200);
    expect(img.headers.get('cache-control')).toContain('immutable');
    expect(img.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
    const meta = await sharp(Buffer.from(await img.arrayBuffer())).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([384, 384, 'webp']);
    const del = await a.api.del('/api/me/avatar');
    expect(del.body.avatarUrl).toBeNull();
    expect((await fetch(`${h.url}/api/avatars/${a.id}`)).status).toBe(404);
  });
  it('rejects non-images as avatars', async () => {
    const a = await onboard(h, 'avat2');
    const fd = new FormData();
    fd.append('file', new Blob(['plain text'], { type: 'text/plain' }), 'x.txt');
    const res = await fetch(`${h.url}/api/me/avatar`, { method: 'POST', headers: { Authorization: `Bearer ${a.token}`, Origin: ORIGIN }, body: fd });
    expect(res.status).toBe(400);
  });
});

describe('http hardening', () => {
  it('sets security headers, hides the framework, and answers unknown routes with JSON', async () => {
    const res = await fetch(`${h.url}/api/nope`);
    expect(res.status).toBe(404);
    expect(res.headers.get('x-powered-by')).toBeNull();
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect((await res.json()).error.code).toBe('not_found');
  });
  it('only reflects CORS for configured origins', async () => {
    const good = await fetch(`${h.url}/health`, { headers: { Origin: ORIGIN } });
    expect(good.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    const bad = await fetch(`${h.url}/health`, { headers: { Origin: 'https://evil.example' } });
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
  });
  it('rejects malformed JSON and oversize bodies cleanly', async () => {
    const bad = await fetch(`${h.url}/api/auth/otp/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops' });
    expect(bad.status).toBe(400);
    const big = await fetch(`${h.url}/api/auth/otp/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ x: 'a'.repeat(200_000) }) });
    expect(big.status).toBe(413);
  });
  it('/health reports database and storage', async () => {
    expect((await fetch(`${h.url}/health`).then((r) => r.json()))).toMatchObject({ ok: true, db: true, storage: true });
  });
});
