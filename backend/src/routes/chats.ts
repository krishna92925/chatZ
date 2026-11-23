import { Router } from 'express';
import { z } from 'zod';
import type { Deps } from '../deps.js';
import { HttpError, forbidden } from '../lib/errors.js';
import { KeyedLimiter } from '../lib/limiter.js';
import { parse, uuid } from '../lib/validate.js';
import { requireAuth, requireProfile } from '../middleware.js';
import { realtime } from '../realtime.js';
import { canMessage, ensureDirectConversation } from '../services/friends.js';
import { assertMember, getConversationFor, listConversations, listMessages, searchMessages } from '../services/messages.js';

export function chatRoutes(deps: Deps): Router {
  const r = Router();
  const mw = [requireAuth(deps), requireProfile(deps)];
  const ctx = { fileSecret: deps.config.FILE_URL_SECRET };
  const searchLimiter = new KeyedLimiter(60_000, deps.config.NODE_ENV === 'test' ? 10_000 : 40);

  r.get('/conversations', ...mw, async (req, res) => res.json(await listConversations(deps.db, req.auth.id, deps.presence)));

  r.post('/conversations/direct', ...mw, async (req, res) => {
    const { userId } = parse(z.object({ userId: z.string().uuid() }), req.body);
    if (userId === req.auth.id) throw new HttpError(400, 'self_chat', "You can't message yourself.");
    const exists = await deps.db.query('select 1 from profiles where id = $1', [userId]);
    if (!exists.rowCount) throw new HttpError(404, 'user_not_found', 'We could not find that person.');
    const existing = await deps.db.query('select id from conversations where direct_key = $1', [[req.auth.id, userId].sort().join(':')]);
    if (!existing.rowCount && !(await canMessage(deps.db, req.auth.id, userId))) {
      throw forbidden('friends_only', 'This person only accepts messages from friends. Send a friend request first.');
    }
    const id = await ensureDirectConversation(deps.db, req.auth.id, userId);
    res.json(await getConversationFor(deps.db, req.auth.id, id, deps.presence));
  });

  r.patch('/conversations/:id', ...mw, async (req, res) => {
    const id = parse(uuid, req.params.id);
    const body = parse(z.object({ pinned: z.boolean().optional(), muted: z.boolean().optional(), archived: z.boolean().optional() }), req.body);
    await assertMember(deps.db, id, req.auth.id);
    await deps.db.query(
      'update conversation_members set pinned = coalesce($3, pinned), muted = coalesce($4, muted), archived = coalesce($5, archived) where conversation_id = $1 and user_id = $2',
      [id, req.auth.id, body.pinned ?? null, body.muted ?? null, body.archived ?? null],
    );
    realtime.toUser(req.auth.id, 'conversation:updated', { conversationId: id });
    res.json(await getConversationFor(deps.db, req.auth.id, id, deps.presence));
  });

  r.get('/conversations/:id/messages', ...mw, async (req, res) => {
    const id = parse(uuid, req.params.id);
    const q = parse(
      z.object({
        before: z.coerce.number().int().positive().optional(),
        around: z.coerce.number().int().positive().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(40),
      }),
      req.query,
    );
    res.json(await listMessages(deps.db, ctx, req.auth.id, id, q));
  });

  r.get('/search/messages', ...mw, async (req, res) => {
    const q = parse(z.object({ q: z.string().trim().min(2).max(100), conversationId: z.string().uuid().optional() }), req.query);
    if (!searchLimiter.take(req.auth.id)) throw new HttpError(429, 'rate_limited', 'Searching too fast. Slow down a little.');
    res.json(await searchMessages(deps.db, ctx, req.auth.id, q.q, q.conversationId, deps.presence));
  });

  return r;
}
