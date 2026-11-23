import { Router } from 'express';
import { z } from 'zod';
import type { Deps } from '../deps.js';
import { HttpError, notFound } from '../lib/errors.js';
import { KeyedLimiter } from '../lib/limiter.js';
import { parse, uuid } from '../lib/validate.js';
import { requireAuth, requireProfile } from '../middleware.js';
import { realtime } from '../realtime.js';
import * as F from '../services/friends.js';
import { toPublicUser } from '../services/mappers.js';
import { getProfile } from '../services/profiles.js';
import { CONNECT_CODE_LENGTH } from '../../../shared/constants.js';
import type { FriendRequest } from '../../../shared/types.js';

export function socialRoutes(deps: Deps): Router {
  const r = Router();
  const mw = [requireAuth(deps), requireProfile(deps)];
  const searchLimiter = new KeyedLimiter(60_000, deps.config.NODE_ENV === 'test' ? 10_000 : 40);
  const requestLimiter = new KeyedLimiter(60 * 60_000, deps.config.NODE_ENV === 'test' ? 10_000 : 40);
  const lookupLimiter = new KeyedLimiter(60_000, deps.config.NODE_ENV === 'test' ? 10_000 : 20);

  r.get('/users/search', ...mw, async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 2) return void res.json([]);
    if (!searchLimiter.take(req.auth.id)) throw new HttpError(429, 'rate_limited', 'Searching too fast. Slow down a little.');
    res.json(await F.searchUsers(deps.db, req.auth.id, q.slice(0, 40), deps.presence));
  });

  r.get('/users/by-code/:code', ...mw, async (req, res) => {
    if (!lookupLimiter.take(req.auth.id)) throw new HttpError(429, 'rate_limited', 'Too many lookups. Wait a moment.');
    const code = String(req.params.code ?? '').trim();
    if (code.length !== CONNECT_CODE_LENGTH) throw notFound('code_not_found', 'No one has that connect code.');
    const card = await F.userCardByCode(deps.db, req.auth.id, code, deps.presence);
    if (!card || card.relation === 'blocked_by') throw notFound('code_not_found', 'No one has that connect code.');
    res.json(card);
  });

  r.get('/users/by-username/:username', ...mw, async (req, res) => {
    const card = await F.userCardByUsername(deps.db, req.auth.id, String(req.params.username ?? '').replace(/^@/, ''), deps.presence);
    if (!card || card.relation === 'blocked_by') throw notFound('user_not_found', 'We could not find that person.');
    res.json(card);
  });

  r.get('/users/:id', ...mw, async (req, res) => {
    const id = parse(uuid, req.params.id);
    const card = await F.userCardById(deps.db, req.auth.id, id, deps.presence);
    if (!card || card.relation === 'blocked_by') throw notFound('user_not_found', 'We could not find that person.');
    res.json(card);
  });

  r.get('/friends', ...mw, async (req, res) => res.json(await F.listFriends(deps.db, req.auth.id, deps.presence)));
  r.get('/friends/requests', ...mw, async (req, res) => res.json(await F.listRequests(deps.db, req.auth.id, deps.presence)));

  r.post('/friends/requests', ...mw, async (req, res) => {
    const body = parse(z.object({ userId: z.string().uuid().optional(), username: z.string().trim().max(40).optional(), code: z.string().trim().max(32).optional() }), req.body);
    if (!requestLimiter.take(req.auth.id)) throw new HttpError(429, 'rate_limited', 'You sent many requests. Try again later.');
    let targetId = body.userId;
    if (!targetId && body.username) targetId = (await F.userCardByUsername(deps.db, req.auth.id, body.username.replace(/^@/, ''), deps.presence))?.id;
    if (!targetId && body.code) targetId = (await F.userCardByCode(deps.db, req.auth.id, body.code, deps.presence))?.id;
    if (!targetId) throw notFound('user_not_found', 'We could not find that person.');
    const outcome = await F.sendRequest(deps.db, req.auth.id, targetId);
    const meRow = (await getProfile(deps.db, req.auth.id))!;
    const mePublic = toPublicUser(meRow, deps.presence);
    if (outcome.status === 'sent') {
      const request: FriendRequest = { id: outcome.friendshipId, direction: 'incoming', user: mePublic, createdAt: new Date().toISOString() };
      realtime.toUser(targetId, 'friend:request', { request });
      return void res.status(201).json({ status: 'sent', requestId: outcome.friendshipId });
    }
    const otherRow = (await getProfile(deps.db, targetId))!;
    realtime.toUser(targetId, 'friend:accepted', { user: mePublic, conversationId: outcome.conversationId });
    realtime.toUser(req.auth.id, 'friend:accepted', { user: toPublicUser(otherRow, deps.presence), conversationId: outcome.conversationId });
    res.status(200).json({ status: 'accepted', conversationId: outcome.conversationId });
  });

  r.post('/friends/requests/:id/accept', ...mw, async (req, res) => {
    const id = parse(uuid, req.params.id);
    const { otherId, conversationId } = await F.acceptRequest(deps.db, req.auth.id, id);
    const meRow = (await getProfile(deps.db, req.auth.id))!;
    const otherRow = (await getProfile(deps.db, otherId))!;
    realtime.toUser(otherId, 'friend:accepted', { user: toPublicUser(meRow, deps.presence), conversationId });
    realtime.toUser(req.auth.id, 'friend:accepted', { user: toPublicUser(otherRow, deps.presence), conversationId });
    res.json({ conversationId });
  });

  r.delete('/friends/requests/:id', ...mw, async (req, res) => {
    const other = await F.dropRequest(deps.db, req.auth.id, parse(uuid, req.params.id));
    realtime.toUser(other, 'friend:removed', { userId: req.auth.id });
    realtime.toUser(req.auth.id, 'friend:removed', { userId: other });
    res.status(204).end();
  });

  r.delete('/friends/:userId', ...mw, async (req, res) => {
    const other = parse(uuid, req.params.userId);
    await F.unfriend(deps.db, req.auth.id, other);
    realtime.toUser(other, 'friend:removed', { userId: req.auth.id });
    realtime.toUser(req.auth.id, 'friend:removed', { userId: other });
    res.status(204).end();
  });

  r.get('/blocks', ...mw, async (req, res) => res.json(await F.listBlocked(deps.db, req.auth.id, deps.presence)));

  r.post('/blocks/:userId', ...mw, async (req, res) => {
    const other = parse(uuid, req.params.userId);
    await F.blockUser(deps.db, req.auth.id, other);
    realtime.toUser(other, 'friend:removed', { userId: req.auth.id });
    realtime.toUser(req.auth.id, 'conversation:updated', { conversationId: '' });
    res.status(204).end();
  });

  r.delete('/blocks/:userId', ...mw, async (req, res) => {
    await F.unblockUser(deps.db, req.auth.id, parse(uuid, req.params.userId));
    res.status(204).end();
  });

  return r;
}
