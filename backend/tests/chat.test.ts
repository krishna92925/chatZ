import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness, onboard, makeFriends, emitAck, waitFor, sleep, type Harness } from './helpers.js';
import { randomUUID } from 'node:crypto';

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h.close();
});

async function pair(an: string, bn: string) {
  const a = await onboard(h, an);
  const b = await onboard(h, bn);
  const convo = await makeFriends(a, b);
  const sa = await h.connect(a.token);
  const sb = await h.connect(b.token);
  return { a, b, convo, sa, sb };
}
const send = (s: any, conversationId: string, body: string, extra: object = {}) => emitAck(s, 'message:send', { conversationId, clientId: randomUUID(), body, ...extra });

describe('socket security', () => {
  it('refuses connections without a token, with a bad token, and from a foreign origin', async () => {
    await expect(h.connect('')).rejects.toThrow();
    await expect(h.connect('garbage')).rejects.toThrow();
    const u = await onboard(h, 'sockuser');
    await expect(h.connect(u.token, 'https://evil.example')).rejects.toThrow(/origin_not_allowed/);
  });
  it('refuses users who have not finished onboarding', async () => {
    const t = await h.tokenFor({ id: '00000000-0000-4000-8000-0000000fffff', email: 'noprof@example.com' });
    await expect(h.connect(t)).rejects.toThrow(/not_onboarded/);
  });
});

describe('messaging', () => {
  it('delivers a message in real time, updates unread, and acks the sender', async () => {
    const { a, b, convo, sa, sb } = await pair('amy', 'ben');
    const got = waitFor(sb, 'message:new');
    const r = await send(sa, convo, '  hello ben  ');
    expect(r.ok).toBe(true);
    expect(r.data).toMatchObject({ body: 'hello ben', senderId: a.id, kind: 'text', conversationId: convo });
    expect((await got).message.id).toBe(r.data.id);
    const list = (await b.api.get('/api/conversations')).body;
    expect(list[0]).toMatchObject({ unreadCount: 1, lastMessage: { body: 'hello ben', senderId: a.id } });
    expect((await a.api.get('/api/conversations')).body[0].unreadCount).toBe(0);
  });
  it('is idempotent on clientId (retry after a lost ack does not duplicate)', async () => {
    const { a, convo, sa } = await pair('cat', 'dan');
    const clientId = randomUUID();
    const one = await emitAck(sa, 'message:send', { conversationId: convo, clientId, body: 'once' });
    const two = await emitAck(sa, 'message:send', { conversationId: convo, clientId, body: 'once' });
    expect(two.data.id).toBe(one.data.id);
    const page = (await a.api.get(`/api/conversations/${convo}/messages`)).body;
    expect(page.messages).toHaveLength(1);
  });
  it('counts unread atomically under concurrent sends', async () => {
    const { b, convo, sa } = await pair('eli', 'fay');
    const rs = await Promise.all(Array.from({ length: 25 }, (_, i) => send(sa, convo, `m${i}`)));
    expect(rs.every((r) => r.ok)).toBe(true);
    expect((await b.api.get('/api/conversations')).body[0].unreadCount).toBe(25);
  });
  it('rejects empty, oversized, and non-member sends; validates payloads', async () => {
    const { convo, sa } = await pair('gus', 'hal');
    const outsider = await onboard(h, 'outsider');
    const so = await h.connect(outsider.token);
    expect((await send(sa, convo, '   ')).error?.code).toBe('empty_message');
    expect((await send(sa, convo, 'x'.repeat(4001))).error?.code).toBe('message_too_long');
    expect((await send(so, convo, 'let me in')).error?.code).toBe('conversation_not_found');
    expect((await emitAck(sa, 'message:send', { conversationId: 'nope', clientId: 'abc' })).error?.code).toBe('invalid_input');
    expect((await emitAck(sa, 'message:send', null)).error?.code).toBe('invalid_input');
  });
  it('messages are stored as plain text; markup is never interpreted by the server', async () => {
    const { convo, sa } = await pair('ida', 'jay');
    const r = await send(sa, convo, '<img src=x onerror=alert(1)>');
    expect(r.data.body).toBe('<img src=x onerror=alert(1)>');
  });
  it('pagination is keyset based and ordered oldest to newest', async () => {
    const { a, convo, sa } = await pair('kim', 'lou');
    for (let i = 1; i <= 7; i++) await send(sa, convo, `msg ${i}`);
    const p1 = (await a.api.get(`/api/conversations/${convo}/messages?limit=3`)).body;
    expect(p1.messages.map((m: any) => m.body)).toEqual(['msg 5', 'msg 6', 'msg 7']);
    expect(p1.hasMore).toBe(true);
    const p2 = (await a.api.get(`/api/conversations/${convo}/messages?limit=3&before=${p1.messages[0].seq}`)).body;
    expect(p2.messages.map((m: any) => m.body)).toEqual(['msg 2', 'msg 3', 'msg 4']);
    const p3 = (await a.api.get(`/api/conversations/${convo}/messages?limit=3&before=${p2.messages[0].seq}`)).body;
    expect(p3.messages.map((m: any) => m.body)).toEqual(['msg 1']);
    expect(p3.hasMore).toBe(false);
    const mid = (await a.api.get(`/api/conversations/${convo}/messages?limit=2&around=${p2.messages[1].seq}`)).body;
    expect(mid.messages.map((m: any) => m.body)).toEqual(['msg 2', 'msg 3', 'msg 4', 'msg 5']);
    expect(mid.hasMore).toBe(true);
    expect(mid.hasNewer).toBe(true);
  });
  it('only members can read a conversation', async () => {
    const { convo } = await pair('mia', 'ned');
    const o = await onboard(h, 'snoop');
    expect((await o.api.get(`/api/conversations/${convo}/messages`)).status).toBe(404);
    expect((await o.api.patch(`/api/conversations/${convo}`, { pinned: true })).status).toBe(404);
  });
});

describe('read receipts and typing', () => {
  it('marks read, zeroes unread, and tells the sender', async () => {
    const { a, b, convo, sa, sb } = await pair('ola', 'pat');
    const last = (await send(sa, convo, 'one')).data;
    await send(sa, convo, 'two');
    const receipt = waitFor(sa, 'receipt:updated');
    const r = await emitAck(sb, 'conversation:read', { conversationId: convo, seq: 999_999_999 });
    expect(r.ok).toBe(true);
    const ev = await receipt;
    expect(ev.userId).toBe(b.id);
    expect(ev.lastReadSeq).toBeGreaterThanOrEqual(last.seq);
    expect(ev.lastReadSeq).toBeLessThan(999_999_999);
    const mine = (await b.api.get('/api/conversations')).body[0];
    expect(mine.unreadCount).toBe(0);
    expect((await a.api.get('/api/conversations')).body[0].peerLastReadSeq).toBe(ev.lastReadSeq);
  });
  it('hides read state when either person disabled read receipts', async () => {
    const { a, b, convo, sa, sb } = await pair('quo', 'rex');
    await send(sa, convo, 'hi');
    await emitAck(sb, 'conversation:read', { conversationId: convo, seq: 1e9 });
    await b.api.patch('/api/me/settings', { readReceipts: false });
    expect((await a.api.get('/api/conversations')).body[0].peerLastReadSeq).toBeNull();
  });
  it('sends no live read receipt to the sender when the reader turned receipts off', async () => {
    const { b, convo, sa, sb } = await pair('rho', 'sia');
    await send(sa, convo, 'did you see this?');
    await b.api.patch('/api/me/settings', { readReceipts: false });
    let leaked = false;
    sa.once('receipt:updated', () => (leaked = true));
    await emitAck(sb, 'conversation:read', { conversationId: convo, seq: 1e9 });
    await sleep(250);
    expect(leaked).toBe(false);
    expect((await b.api.get('/api/conversations')).body[0].unreadCount).toBe(0);
  });
  it('relays typing to the other person only', async () => {
    const { a, convo, sa, sb } = await pair('sue', 'tom');
    const t = waitFor(sb, 'typing');
    sa.emit('typing', { conversationId: convo, isTyping: true });
    expect(await t).toEqual({ conversationId: convo, userId: a.id, isTyping: true });
    let echoed = false;
    sa.once('typing', () => (echoed = true));
    sa.emit('typing', { conversationId: convo, isTyping: false });
    await sleep(200);
    expect(echoed).toBe(false);
  });
  it('ignores typing for conversations you are not in', async () => {
    const { convo, sb } = await pair('uma', 'val');
    const o = await onboard(h, 'lurker');
    const so = await h.connect(o.token);
    let heard = false;
    sb.once('typing', () => (heard = true));
    so.emit('typing', { conversationId: convo, isTyping: true });
    await sleep(250);
    expect(heard).toBe(false);
  });
});

describe('edit, delete, react, reply', () => {
  it('edits own messages only and broadcasts the change', async () => {
    const { convo, sa, sb } = await pair('wil', 'xan');
    const m = (await send(sa, convo, 'typo')).data;
    const upd = waitFor(sb, 'message:updated');
    const e = await emitAck(sa, 'message:edit', { messageId: m.id, body: 'fixed' });
    expect(e.data.body).toBe('fixed');
    expect(e.data.editedAt).toBeTruthy();
    expect((await upd).message.body).toBe('fixed');
    expect((await emitAck(sb, 'message:edit', { messageId: m.id, body: 'hijack' })).error?.code).toBe('not_author');
  });
  it('delete for everyone blanks the message for both; delete for me hides it only for me', async () => {
    const { a, b, convo, sa, sb } = await pair('yan', 'zed');
    const m1 = (await send(sa, convo, 'secret')).data;
    const m2 = (await send(sa, convo, 'keep')).data;
    expect((await emitAck(sb, 'message:delete', { messageId: m1.id, scope: 'everyone' })).error?.code).toBe('not_author');
    const upd = waitFor(sb, 'message:updated');
    expect((await emitAck(sa, 'message:delete', { messageId: m1.id, scope: 'everyone' })).ok).toBe(true);
    expect((await upd).message).toMatchObject({ body: '', deletedAt: expect.any(String) });
    expect((await emitAck(sb, 'message:delete', { messageId: m2.id, scope: 'me' })).ok).toBe(true);
    const bView = (await b.api.get(`/api/conversations/${convo}/messages`)).body.messages;
    expect(bView.map((m: any) => m.id)).toEqual([m1.id]);
    expect(bView[0].body).toBe('');
    const aView = (await a.api.get(`/api/conversations/${convo}/messages`)).body.messages;
    expect(aView).toHaveLength(2);
    expect((await emitAck(sa, 'message:edit', { messageId: m1.id, body: 'zombie' })).error?.code).toBe('message_deleted');
  });
  it('toggles reactions and rejects non-emoji', async () => {
    const { a, b, convo, sa, sb } = await pair('abe', 'bea');
    const m = (await send(sa, convo, 'react to me')).data;
    const ev = waitFor(sa, 'reaction:updated');
    const r1 = await emitAck(sb, 'reaction:toggle', { messageId: m.id, emoji: '❤️' });
    expect(r1.data).toEqual([{ emoji: '❤️', userIds: [b.id] }]);
    expect((await ev).reactions).toEqual(r1.data);
    await emitAck(sa, 'reaction:toggle', { messageId: m.id, emoji: '❤️' });
    const page = (await a.api.get(`/api/conversations/${convo}/messages`)).body.messages[0];
    expect(page.reactions[0].userIds.sort()).toEqual([a.id, b.id].sort());
    const off = await emitAck(sb, 'reaction:toggle', { messageId: m.id, emoji: '❤️' });
    expect(off.data[0].userIds).toEqual([a.id]);
    expect((await emitAck(sb, 'reaction:toggle', { messageId: m.id, emoji: 'abc' })).error?.code).toBe('invalid_emoji');
  });
  it('replies keep a preview and reject messages from other conversations', async () => {
    const { convo, sa, sb } = await pair('cid', 'dee');
    const m = (await send(sa, convo, 'original text')).data;
    const r = await send(sb, convo, 'my reply', { replyToId: m.id });
    expect(r.data.replyTo).toMatchObject({ id: m.id, body: 'original text', deleted: false });
    const other = await pair('eve2', 'fox');
    const foreign = (await send(other.sa, other.convo, 'x')).data;
    expect((await send(sa, convo, 'bad', { replyToId: foreign.id })).error?.code).toBe('invalid_reply');
  });
});

describe('search, pin/mute/archive, presence', () => {
  it('searches only your own conversations (substring, case-insensitive, escapes wildcards)', async () => {
    const { a, convo, sa } = await pair('gil', 'han');
    await send(sa, convo, 'Dinner at the Taj tonight');
    await send(sa, convo, '100% sure');
    const outsider = await onboard(h, 'nosy');
    expect((await a.api.get('/api/search/messages?q=taj')).body[0].message.body).toContain('Taj');
    expect((await a.api.get('/api/search/messages?q=100%25')).body).toHaveLength(1);
    expect((await a.api.get('/api/search/messages?q=%25%25')).body).toEqual([]);
    expect((await outsider.api.get('/api/search/messages?q=taj')).body).toEqual([]);
    expect((await a.api.get(`/api/search/messages?q=taj&conversationId=${convo}`)).body).toHaveLength(1);
  });
  it('pins, mutes and archives per person; a new message un-archives for the receiver', async () => {
    const { a, b, convo, sa } = await pair('ivo', 'jen');
    const r = await a.api.patch(`/api/conversations/${convo}`, { pinned: true, muted: true });
    expect(r.body).toMatchObject({ pinned: true, muted: true });
    expect((await b.api.get('/api/conversations')).body[0]).toMatchObject({ pinned: false, muted: false });
    await b.api.patch(`/api/conversations/${convo}`, { archived: true });
    await send(sa, convo, 'wake up');
    expect((await b.api.get('/api/conversations')).body[0].archived).toBe(false);
  });
  it('broadcasts presence to friends and records last seen on the last disconnect', async () => {
    const a = await onboard(h, 'kay');
    const b = await onboard(h, 'leo');
    await makeFriends(a, b);
    const sa = await h.connect(a.token);
    const online = waitFor(sa, 'presence:update');
    const sb = await h.connect(b.token);
    expect(await online).toMatchObject({ userId: b.id, online: true });
    const second = await h.connect(b.token);
    const off = waitFor(sa, 'presence:update');
    sb.close();
    await sleep(150);
    expect((await a.api.get('/api/friends')).body[0].online).toBe(true);
    second.close();
    const ev = await off;
    expect(ev).toMatchObject({ userId: b.id, online: false });
    expect(ev.lastSeenAt).toBeTruthy();
  });
});
