import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness, onboard, makeFriends, waitFor, type Harness } from './helpers.js';

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h.close();
});

describe('finding people', () => {
  it('searches by username prefix and name, never returns yourself, needs 2+ chars', async () => {
    const a = await onboard(h, 'alice', 'Alice Rao');
    await onboard(h, 'alicia', 'Alicia Stone');
    await onboard(h, 'bobby', 'Bobby');
    const r = await a.api.get('/api/users/search?q=ali');
    expect(r.body.map((u: any) => u.username)).toEqual(['alicia']);
    expect((await a.api.get('/api/users/search?q=stone')).body.map((u: any) => u.username)).toEqual(['alicia']);
    expect((await a.api.get('/api/users/search?q=a')).body).toEqual([]);
    expect((await a.api.get('/api/users/search?q=%25')).body).toEqual([]);
  });
  it('looks a person up by connect code and username', async () => {
    const a = await onboard(h, 'cara');
    const b = await onboard(h, 'dave');
    const byCode = await a.api.get(`/api/users/by-code/${b.profile.connectCode.toLowerCase()}`);
    expect(byCode.body).toMatchObject({ username: 'dave', relation: 'none', canMessage: false });
    expect((await a.api.get('/api/users/by-code/ZZZZZZZZZZ')).status).toBe(404);
    expect((await a.api.get('/api/users/by-username/@dave')).body.id).toBe(b.id);
  });
  it('does not leak email or connect code in public cards', async () => {
    const a = await onboard(h, 'eve');
    const b = await onboard(h, 'finn');
    const card = (await a.api.get('/api/users/by-username/finn')).body;
    expect(JSON.stringify(card)).not.toContain('@example.com');
    expect(card.connectCode).toBeUndefined();
    expect(b.profile.connectCode).toBeTruthy();
  });
});

describe('friend requests', () => {
  it('request → accept creates exactly one conversation; both get real-time events', async () => {
    const a = await onboard(h, 'gwen');
    const b = await onboard(h, 'hugo');
    const sb = await h.connect(b.token);
    const incoming = waitFor(sb, 'friend:request');
    const r = await a.api.post('/api/friends/requests', { username: 'hugo' });
    expect(r.status).toBe(201);
    const ev = await incoming;
    expect(ev.request).toMatchObject({ direction: 'incoming', user: { username: 'gwen' } });
    expect((await a.api.post('/api/friends/requests', { username: 'hugo' })).body.error.code).toBe('request_pending');
    expect((await b.api.get('/api/friends/requests')).body[0].direction).toBe('incoming');
    expect((await a.api.get('/api/friends/requests')).body[0].direction).toBe('outgoing');
    expect((await a.api.post(`/api/friends/requests/${r.body.requestId}/accept`)).status).toBe(403);
    const accepted = waitFor(sb, 'friend:accepted').catch(() => null);
    const acc = await b.api.post(`/api/friends/requests/${r.body.requestId}/accept`);
    expect(acc.status).toBe(200);
    expect((await accepted)?.user.username).toBe('gwen');
    expect((await a.api.get('/api/friends')).body.map((u: any) => u.username)).toEqual(['hugo']);
    expect((await a.api.get('/api/conversations')).body).toHaveLength(1);
    expect((await b.api.get('/api/conversations')).body).toHaveLength(1);
    expect((await a.api.post('/api/friends/requests', { username: 'hugo' })).body.error.code).toBe('already_friends');
  });
  it('a request in the other direction while one is pending becomes a friendship', async () => {
    const a = await onboard(h, 'iris');
    const b = await onboard(h, 'jack');
    await a.api.post('/api/friends/requests', { username: 'jack' });
    const r = await b.api.post('/api/friends/requests', { username: 'iris' });
    expect(r.body.status).toBe('accepted');
    expect((await b.api.get('/api/friends')).body).toHaveLength(1);
  });
  it('simultaneous requests from both sides never create duplicates', async () => {
    const a = await onboard(h, 'kate');
    const b = await onboard(h, 'liam');
    const [x, y] = await Promise.all([a.api.post('/api/friends/requests', { username: 'liam' }), b.api.post('/api/friends/requests', { username: 'kate' })]);
    expect([x.status, y.status].every((s) => s < 500)).toBe(true);
    const rows = await h.deps.db.query('select count(*)::int as n from friendships where (user_low = $1 and user_high = $2) or (user_low = $2 and user_high = $1)', [a.id < b.id ? a.id : b.id, a.id < b.id ? b.id : a.id]);
    expect(rows.rows[0].n).toBe(1);
  });
  it('decline and cancel remove the request; you cannot add yourself', async () => {
    const a = await onboard(h, 'mona');
    const b = await onboard(h, 'nick');
    expect((await a.api.post('/api/friends/requests', { username: 'mona' })).status).toBe(400);
    const r = await a.api.post('/api/friends/requests', { username: 'nick' });
    expect((await b.api.del(`/api/friends/requests/${r.body.requestId}`)).status).toBe(204);
    expect((await b.api.get('/api/friends/requests')).body).toEqual([]);
    expect((await a.api.post('/api/friends/requests', { username: 'nick' })).status).toBe(201);
  });
  it('only the receiver can accept', async () => {
    const a = await onboard(h, 'omar');
    const b = await onboard(h, 'pia');
    const c = await onboard(h, 'quin');
    const r = await a.api.post('/api/friends/requests', { username: 'pia' });
    expect((await a.api.post(`/api/friends/requests/${r.body.requestId}/accept`)).status).toBe(403);
    expect((await c.api.post(`/api/friends/requests/${r.body.requestId}/accept`)).status).toBe(404);
    expect((await b.api.post(`/api/friends/requests/${r.body.requestId}/accept`)).status).toBe(200);
  });
});

describe('blocking and privacy', () => {
  it('blocking removes the friendship, hides you from them and stops messages', async () => {
    const a = await onboard(h, 'ruth');
    const b = await onboard(h, 'sam');
    const convo = await makeFriends(a, b);
    expect((await a.api.post(`/api/blocks/${b.id}`)).status).toBe(204);
    expect((await a.api.get('/api/friends')).body).toEqual([]);
    expect((await b.api.get('/api/users/search?q=ruth')).body).toEqual([]);
    expect((await b.api.get('/api/users/by-username/ruth')).status).toBe(404);
    expect((await b.api.post('/api/friends/requests', { username: 'ruth' })).body.error.code).toBe('blocked');
    const conv = (await b.api.get('/api/conversations')).body.find((c: any) => c.id === convo);
    expect(conv.canSend).toBe(false);
    expect((await a.api.get('/api/blocks')).body.map((u: any) => u.username)).toEqual(['sam']);
    await a.api.del(`/api/blocks/${b.id}`);
    expect((await b.api.get('/api/users/by-username/ruth')).status).toBe(200);
  });
  it('who-can-message = everyone lets a stranger start a chat; friends-only does not', async () => {
    const a = await onboard(h, 'tara');
    const b = await onboard(h, 'ugo');
    expect((await a.api.post('/api/conversations/direct', { userId: b.id })).body.error.code).toBe('friends_only');
    await b.api.patch('/api/me/settings', { whoCanMessage: 'everyone' });
    const r = await a.api.post('/api/conversations/direct', { userId: b.id });
    expect(r.status).toBe(200);
    expect(r.body.peer.username).toBe('ugo');
    expect(r.body.canSend).toBe(true);
    const again = await a.api.post('/api/conversations/direct', { userId: b.id });
    expect(again.body.id).toBe(r.body.id);
  });
  it('hides online state and last seen when the person turns them off', async () => {
    const a = await onboard(h, 'vera');
    const b = await onboard(h, 'wes');
    await makeFriends(a, b);
    const sb = await h.connect(b.token);
    expect((await a.api.get('/api/friends')).body[0].online).toBe(true);
    await b.api.patch('/api/me/settings', { showOnline: false });
    expect((await a.api.get('/api/friends')).body[0]).toMatchObject({ online: false, lastSeenAt: null });
    sb.close();
  });
  it('account deletion needs the exact username and removes the data', async () => {
    const a = await onboard(h, 'xena');
    const b = await onboard(h, 'yuri');
    await makeFriends(a, b);
    expect((await a.api.del('/api/me', { confirm: 'nope' })).status).toBe(400);
    expect((await a.api.del('/api/me', { confirm: 'XENA' })).status).toBe(204);
    expect((await a.api.get('/api/me')).body.profile).toBeNull();
    expect((await b.api.get('/api/friends')).body).toEqual([]);
    expect((await b.api.get('/api/conversations')).body).toEqual([]);
  });
});
