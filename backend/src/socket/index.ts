import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { z } from 'zod';
import type { Deps } from '../deps.js';
import { HttpError } from '../lib/errors.js';
import { KeyedLimiter } from '../lib/limiter.js';
import { isOnboarded } from '../middleware.js';
import { realtime, type IoServer } from '../realtime.js';
import { normalizeSettings } from '../services/presence.js';
import { broadcastPresence } from '../services/broadcast.js';
import { deleteMessage, editMessage, getMemberIds, markRead, sendMessage, toggleReaction } from '../services/messages.js';
import { MAX_BODY_LENGTH } from '../../../shared/constants.js';
import type { Ack, ClientToServerEvents, ServerToClientEvents } from '../../../shared/types.js';

type S = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, { userId: string }>;

const sendSchema = z.object({
  conversationId: z.string().uuid(),
  clientId: z.string().min(8).max(64),
  body: z.string().max(MAX_BODY_LENGTH + 500).optional(),
  replyToId: z.string().uuid().nullish(),
  attachmentIds: z.array(z.string().uuid()).max(10).optional(),
});
const editSchema = z.object({ messageId: z.string().uuid(), body: z.string().max(MAX_BODY_LENGTH + 500) });
const deleteSchema = z.object({ messageId: z.string().uuid(), scope: z.enum(['me', 'everyone']) });
const reactSchema = z.object({ messageId: z.string().uuid(), emoji: z.string().min(1).max(16) });
const readSchema = z.object({ conversationId: z.string().uuid(), seq: z.number().int().min(0) });
const typingSchema = z.object({ conversationId: z.string().uuid(), isTyping: z.boolean() });

export function attachSocket(httpServer: HttpServer, deps: Deps): IoServer {
  const { config, log, db, presence } = deps;
  const io: IoServer = new Server(httpServer, {
    cors: { origin: config.origins, methods: ['GET', 'POST'] },
    maxHttpBufferSize: 100_000,
    pingInterval: 25_000,
    pingTimeout: 20_000,
    connectionStateRecovery: undefined,
  });
  realtime.attach(io);

  const eventLimiter = new KeyedLimiter(10_000, config.NODE_ENV === 'test' ? 100_000 : 60);
  const typingLimiter = new KeyedLimiter(5_000, config.NODE_ENV === 'test' ? 100_000 : 25);
  const memberCache = new Map<string, { ids: string[]; at: number }>();

  async function membersOf(conversationId: string): Promise<string[]> {
    const hit = memberCache.get(conversationId);
    if (hit && Date.now() - hit.at < 60_000) return hit.ids;
    const ids = await getMemberIds(db, conversationId);
    if (memberCache.size > 5000) memberCache.clear();
    memberCache.set(conversationId, { ids, at: Date.now() });
    return ids;
  }

  // Authentication: a Supabase access token in the handshake. Cookies are never used.
  io.use(async (socket, next) => {
    try {
      const origin = socket.handshake.headers.origin;
      if (origin && !config.origins.includes(origin)) return next(new Error('origin_not_allowed'));
      const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
      if (typeof token !== 'string' || !token) return next(new Error('unauthorized'));
      const user = await deps.verifyToken(token);
      if (!(await isOnboarded(deps, user.id))) return next(new Error('not_onboarded'));
      (socket as S).data.userId = user.id;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (raw) => {
    const socket = raw as S;
    const me = socket.data.userId;
    const mine = realtime.room(me);

    function handle<T, R>(event: string, schema: z.ZodType<T>, fn: (payload: T) => Promise<R>) {
      (socket as any).on(event, async (payload: unknown, ack?: (r: Ack<R>) => void) => {
        const reply = typeof ack === 'function' ? ack : () => undefined;
        try {
          if (!eventLimiter.take(socket.id)) throw new HttpError(429, 'rate_limited', 'You are doing that too fast.');
          const parsed = schema.safeParse(payload);
          if (!parsed.success) throw new HttpError(400, 'invalid_input', parsed.error.issues[0]?.message ?? 'Invalid input');
          reply({ ok: true, data: await fn(parsed.data) });
        } catch (err) {
          if (err instanceof HttpError) return reply({ ok: false, error: { code: err.code, message: err.message } });
          log.error({ err, event }, 'socket handler failed');
          reply({ ok: false, error: { code: 'server_error', message: 'Something went wrong. Please try again.' } });
        }
      });
    }

    const ctx = { fileSecret: config.FILE_URL_SECRET };

    handle('message:send', sendSchema, async (p) => {
      const { message, memberIds, duplicate } = await sendMessage(db, ctx, {
        conversationId: p.conversationId,
        senderId: me,
        clientId: p.clientId,
        body: p.body,
        replyToId: p.replyToId ?? null,
        attachmentIds: p.attachmentIds,
      });
      if (!duplicate) io.to(memberIds.map(realtime.room)).except(socket.id).emit('message:new', { message });
      return message;
    });

    handle('message:edit', editSchema, async (p) => {
      const { message, memberIds } = await editMessage(db, ctx, me, p.messageId, p.body);
      io.to(memberIds.map(realtime.room)).except(socket.id).emit('message:updated', { message });
      return message;
    });

    handle('message:delete', deleteSchema, async (p) => {
      const r = await deleteMessage(db, ctx, me, p.messageId, p.scope);
      if (p.scope === 'me') io.to(mine).except(socket.id).emit('message:hidden', { conversationId: r.conversationId, messageId: p.messageId });
      else if (r.message) io.to(r.memberIds.map(realtime.room)).except(socket.id).emit('message:updated', { message: r.message });
      if (r.uploadKeys.length) void deps.storage.delete(r.uploadKeys).catch((err) => log.warn({ err }, 'could not delete files of deleted message'));
      return null;
    });

    handle('reaction:toggle', reactSchema, async (p) => {
      const r = await toggleReaction(db, me, p.messageId, p.emoji);
      io.to(r.memberIds.map(realtime.room)).except(socket.id).emit('reaction:updated', { conversationId: r.conversationId, messageId: p.messageId, reactions: r.reactions });
      return r.reactions;
    });

    handle('conversation:read', readSchema, async (p) => {
      const r = await markRead(db, me, p.conversationId, p.seq);
      if (!r) throw new HttpError(404, 'conversation_not_found', 'Conversation not found.');
      // Read receipts are reciprocal: nothing is sent to the other person unless both have them switched on.
      const prefs = await db.query('select id, settings from profiles where id = any($1)', [r.memberIds]);
      const enabled = new Set(prefs.rows.filter((x) => normalizeSettings(x.settings).readReceipts).map((x) => x.id as string));
      const targets = r.memberIds.filter((u) => u === me || (enabled.has(me) && enabled.has(u)));
      io.to(targets.map(realtime.room)).except(socket.id).emit('receipt:updated', { conversationId: p.conversationId, userId: me, lastReadSeq: r.lastReadSeq });
      return null;
    });

    socket.on('typing', async (payload) => {
      try {
        const p = typingSchema.safeParse(payload);
        if (!p.success || !typingLimiter.take(socket.id)) return;
        const ids = await membersOf(p.data.conversationId);
        if (!ids.includes(me)) return;
        const others = ids.filter((u) => u !== me).map(realtime.room);
        if (others.length) io.to(others).emit('typing', { conversationId: p.data.conversationId, userId: me, isTyping: p.data.isTyping });
      } catch (err) {
        log.warn({ err }, 'typing event failed');
      }
    });

    // Handlers are in place; only now do the async presence work.
    void socket.join(mine);
    const first = presence.add(me, socket.id);
    if (first) void broadcastPresence(deps, me).catch((err) => log.warn({ err }, 'presence broadcast failed'));

    socket.on('disconnect', async () => {
      eventLimiter.take(`gone:${socket.id}`);
      if (!presence.remove(me, socket.id)) return;
      try {
        const r = await db.query('update profiles set last_seen_at = now() where id = $1 returning last_seen_at', [me]);
        await broadcastPresence(deps, me, r.rows[0]?.last_seen_at ?? null);
      } catch (err) {
        log.warn({ err }, 'could not record last seen');
      }
    });
  });

  return io;
}
