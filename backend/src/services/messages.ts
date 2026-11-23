import type { Db, Queryable } from '../db/pool.js';
import { HttpError, forbidden, notFound } from '../lib/errors.js';
import { signFileUrl } from '../lib/signing.js';
import { blockedEitherWay, canMessage } from './friends.js';
import { PROFILE_COLS, toPublicUser } from './mappers.js';
import type { Presence } from './presence.js';
import { MAX_ATTACHMENTS, MAX_BODY_LENGTH } from '../../../shared/constants.js';
import type { Attachment, Conversation, Message, MessageKind, MessagePage, ReactionGroup, SearchMessageHit } from '../../../shared/types.js';
import { normalizeSettings } from './presence.js';

export interface MsgCtx {
  fileSecret: string;
}

const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : null);

const MESSAGE_SELECT = `
  select m.id, m.seq, m.conversation_id, m.sender_id, m.kind, m.body, m.attachments, m.reply_to_id, m.client_id, m.edited_at, m.deleted_at, m.created_at,
    coalesce((select json_agg(json_build_object('emoji', r.emoji, 'userId', r.user_id) order by r.created_at) from reactions r where r.message_id = m.id), '[]'::json) as reactions,
    (select json_build_object('id', rm.id, 'senderId', rm.sender_id, 'kind', rm.kind, 'body', left(rm.body, 140), 'deleted', rm.deleted_at is not null) from messages rm where rm.id = m.reply_to_id) as reply_to
  from messages m`;

const NOT_HIDDEN = (viewerParam: string) => `not exists (select 1 from message_deletions d where d.message_id = m.id and d.user_id = ${viewerParam})`;

export function groupReactions(list: { emoji: string; userId: string }[]): ReactionGroup[] {
  const map = new Map<string, string[]>();
  for (const r of list) map.set(r.emoji, [...(map.get(r.emoji) ?? []), r.userId]);
  return [...map].map(([emoji, userIds]) => ({ emoji, userIds }));
}

export function hydrate(rows: any[], ctx: MsgCtx): Message[] {
  return rows.map((r) => {
    const attachments: Attachment[] = (Array.isArray(r.attachments) ? r.attachments : []).map((a: any) => ({
      id: a.id,
      kind: a.kind,
      mime: a.mime,
      size: a.size,
      name: a.name,
      width: a.width ?? null,
      height: a.height ?? null,
      url: signFileUrl(ctx.fileSecret, a.id),
    }));
    return {
      id: r.id,
      conversationId: r.conversation_id,
      seq: r.seq,
      senderId: r.sender_id,
      kind: r.kind,
      body: r.body,
      attachments,
      replyTo: r.reply_to ?? null,
      reactions: groupReactions(r.reactions ?? []),
      editedAt: iso(r.edited_at),
      deletedAt: iso(r.deleted_at),
      createdAt: iso(r.created_at)!,
      clientId: r.client_id,
    };
  });
}

export async function getMemberIds(q: Queryable, conversationId: string): Promise<string[]> {
  const r = await q.query('select user_id from conversation_members where conversation_id = $1', [conversationId]);
  return r.rows.map((x) => x.user_id as string);
}

export async function assertMember(q: Queryable, conversationId: string, userId: string): Promise<void> {
  const r = await q.query('select 1 from conversation_members where conversation_id = $1 and user_id = $2', [conversationId, userId]);
  if (!r.rowCount) throw notFound('conversation_not_found', 'Conversation not found.');
}

export async function getMessage(q: Queryable, ctx: MsgCtx, viewerId: string, messageId: string): Promise<Message | null> {
  const r = await q.query(`${MESSAGE_SELECT} where m.id = $1 and ${NOT_HIDDEN('$2')}`, [messageId, viewerId]);
  return r.rows[0] ? hydrate(r.rows, ctx)[0]! : null;
}

export async function listMessages(
  q: Queryable,
  ctx: MsgCtx,
  viewerId: string,
  conversationId: string,
  opts: { before?: number; around?: number; limit: number },
): Promise<MessagePage> {
  await assertMember(q, conversationId, viewerId);
  const { limit } = opts;
  if (opts.around !== undefined) {
    const older = await q.query(`${MESSAGE_SELECT} where m.conversation_id = $1 and m.seq <= $3 and ${NOT_HIDDEN('$2')} order by m.seq desc limit $4`, [conversationId, viewerId, opts.around, limit + 1]);
    const newer = await q.query(`${MESSAGE_SELECT} where m.conversation_id = $1 and m.seq > $3 and ${NOT_HIDDEN('$2')} order by m.seq asc limit $4`, [conversationId, viewerId, opts.around, limit + 1]);
    const hasMore = older.rows.length > limit;
    const hasNewer = newer.rows.length > limit;
    const rows = [...older.rows.slice(0, limit).reverse(), ...newer.rows.slice(0, limit)];
    return { messages: hydrate(rows, ctx), hasMore, hasNewer };
  }
  const params: unknown[] = [conversationId, viewerId, limit + 1];
  let cond = '';
  if (opts.before !== undefined) {
    params.push(opts.before);
    cond = 'and m.seq < $4';
  }
  const r = await q.query(`${MESSAGE_SELECT} where m.conversation_id = $1 and ${NOT_HIDDEN('$2')} ${cond} order by m.seq desc limit $3`, params);
  const hasMore = r.rows.length > limit;
  return { messages: hydrate(r.rows.slice(0, limit).reverse(), ctx), hasMore, hasNewer: false };
}

export async function searchMessages(
  q: Queryable,
  ctx: MsgCtx,
  viewerId: string,
  term: string,
  conversationId: string | undefined,
  presence: Presence,
): Promise<SearchMessageHit[]> {
  const esc = term.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
  const params: unknown[] = [viewerId, `%${esc}%`];
  let extra = '';
  if (conversationId) {
    params.push(conversationId);
    extra = 'and m.conversation_id = $3';
  }
  const r = await q.query(
    `${MESSAGE_SELECT}
     where m.deleted_at is null and m.body ilike $2 ${extra}
       and exists (select 1 from conversation_members cm where cm.conversation_id = m.conversation_id and cm.user_id = $1)
       and ${NOT_HIDDEN('$1')}
     order by m.seq desc limit 30`,
    params,
  );
  if (!r.rows.length) return [];
  const convIds = [...new Set(r.rows.map((x) => x.conversation_id as string))];
  const peers = await q.query(
    `select cm.conversation_id, ${PROFILE_COLS} from conversation_members cm join profiles p on p.id = cm.user_id where cm.conversation_id = any($1) and cm.user_id <> $2`,
    [convIds, viewerId],
  );
  const peerByConv = new Map(peers.rows.map((p) => [p.conversation_id as string, toPublicUser(p, presence)]));
  return hydrate(r.rows, ctx).flatMap((message) => {
    const peer = peerByConv.get(message.conversationId);
    return peer ? [{ message, conversationId: message.conversationId, peer }] : [];
  });
}

export async function listConversations(q: Queryable, viewerId: string, presence: Presence): Promise<Conversation[]> {
  const r = await q.query(
    `select c.id as conversation_id, c.created_at, c.last_message_at,
       cm.unread_count, cm.muted, cm.pinned, cm.archived, cm.last_read_seq as my_last_read_seq,
       pm.last_read_seq as peer_last_read_seq, me.settings as my_settings,
       ${PROFILE_COLS},
       lm.id as lm_id, lm.sender_id as lm_sender, lm.kind as lm_kind, left(lm.body, 140) as lm_body, lm.deleted_at as lm_deleted_at, lm.created_at as lm_created_at,
       exists (select 1 from friendships f where f.user_low = least($1::uuid, p.id) and f.user_high = greatest($1::uuid, p.id) and f.status = 'accepted') as is_friend,
       exists (select 1 from blocks b where (b.blocker_id = $1 and b.blocked_id = p.id) or (b.blocker_id = p.id and b.blocked_id = $1)) as is_blocked
     from conversation_members cm
     join conversations c on c.id = cm.conversation_id and c.type = 'direct'
     join conversation_members pm on pm.conversation_id = c.id and pm.user_id <> cm.user_id
     join profiles p on p.id = pm.user_id
     join profiles me on me.id = cm.user_id
     left join messages lm on lm.id = c.last_message_id
     where cm.user_id = $1
     order by cm.pinned desc, coalesce(c.last_message_at, c.created_at) desc`,
    [viewerId],
  );
  return r.rows.map((row) => {
    const mine = normalizeSettings(row.my_settings);
    const theirs = normalizeSettings(row.settings);
    return {
      id: row.conversation_id,
      type: 'direct' as const,
      peer: toPublicUser(row, presence),
      lastMessage: row.lm_id
        ? { id: row.lm_id, senderId: row.lm_sender, kind: row.lm_kind as MessageKind, body: row.lm_deleted_at ? '' : row.lm_body, deleted: Boolean(row.lm_deleted_at), createdAt: iso(row.lm_created_at)! }
        : null,
      lastMessageAt: iso(row.last_message_at),
      unreadCount: row.unread_count,
      muted: row.muted,
      pinned: row.pinned,
      archived: row.archived,
      canSend: !row.is_blocked && (row.is_friend || theirs.whoCanMessage === 'everyone'),
      myLastReadSeq: row.my_last_read_seq,
      peerLastReadSeq: mine.readReceipts && theirs.readReceipts ? row.peer_last_read_seq : null,
      createdAt: iso(row.created_at)!,
    };
  });
}

export async function getConversationFor(q: Queryable, viewerId: string, conversationId: string, presence: Presence): Promise<Conversation> {
  const all = await listConversations(q, viewerId, presence);
  const c = all.find((x) => x.id === conversationId);
  if (!c) throw notFound('conversation_not_found', 'Conversation not found.');
  return c;
}

export interface SendInput {
  conversationId: string;
  senderId: string;
  clientId?: string | null;
  body?: string;
  replyToId?: string | null;
  attachmentIds?: string[];
}

export async function sendMessage(db: Db, ctx: MsgCtx, input: SendInput): Promise<{ message: Message; memberIds: string[]; duplicate: boolean }> {
  const body = (input.body ?? '').trim();
  const attachmentIds = [...new Set(input.attachmentIds ?? [])];
  if (body.length > MAX_BODY_LENGTH) throw new HttpError(400, 'message_too_long', `Messages can be up to ${MAX_BODY_LENGTH} characters.`);
  if (attachmentIds.length > MAX_ATTACHMENTS) throw new HttpError(400, 'too_many_attachments', `You can attach up to ${MAX_ATTACHMENTS} files.`);
  if (!body && !attachmentIds.length) throw new HttpError(400, 'empty_message', 'Write something or attach a file.');

  return db.tx(async (tx) => {
    const members = await getMemberIds(tx, input.conversationId);
    if (!members.includes(input.senderId)) throw notFound('conversation_not_found', 'Conversation not found.');
    const peer = members.find((m) => m !== input.senderId);
    if (!peer) throw new HttpError(400, 'no_recipient', 'Nobody to send this to.');
    if (await blockedEitherWay(tx, input.senderId, peer)) throw forbidden('blocked', "You can't message this person.");
    if (!(await canMessage(tx, input.senderId, peer))) throw forbidden('friends_only', 'This person only accepts messages from friends.');

    if (input.clientId) {
      const dup = await tx.query('select id from messages where sender_id = $1 and client_id = $2', [input.senderId, input.clientId]);
      if (dup.rows[0]) {
        const m = await getMessage(tx, ctx, input.senderId, dup.rows[0].id);
        return { message: m!, memberIds: members, duplicate: true };
      }
    }

    let replyToId: string | null = null;
    if (input.replyToId) {
      const rp = await tx.query('select 1 from messages where id = $1 and conversation_id = $2', [input.replyToId, input.conversationId]);
      if (!rp.rowCount) throw new HttpError(400, 'invalid_reply', 'The message you are replying to no longer exists.');
      replyToId = input.replyToId;
    }

    let attachments: any[] = [];
    let kind: MessageKind = 'text';
    if (attachmentIds.length) {
      const up = await tx.query('select id, kind, mime, size, name, width, height from uploads where id = any($1) and owner_id = $2 and used_at is null for update', [attachmentIds, input.senderId]);
      if (up.rows.length !== attachmentIds.length) throw new HttpError(400, 'invalid_attachment', 'One of the attachments is no longer available. Upload it again.');
      const order = new Map(attachmentIds.map((id, i) => [id, i]));
      attachments = up.rows.sort((a, b) => order.get(a.id)! - order.get(b.id)!).map((u) => ({ id: u.id, kind: u.kind, mime: u.mime, size: Number(u.size), name: u.name, width: u.width, height: u.height }));
      const kinds = new Set(attachments.map((a) => a.kind));
      kind = kinds.size === 1 ? (attachments[0].kind as MessageKind) : 'file';
      await tx.query('update uploads set used_at = now() where id = any($1)', [attachmentIds]);
    }

    const ins = await tx.query(
      `insert into messages (conversation_id, sender_id, kind, body, attachments, reply_to_id, client_id)
       values ($1, $2, $3, $4, $5::jsonb, $6, $7) returning id, seq`,
      [input.conversationId, input.senderId, kind, body, JSON.stringify(attachments), replyToId, input.clientId ?? null],
    );
    const { id, seq } = ins.rows[0];
    await tx.query('update conversations set last_message_id = $2, last_message_at = now() where id = $1', [input.conversationId, id]);
    await tx.query('update conversation_members set unread_count = unread_count + 1, archived = false where conversation_id = $1 and user_id <> $2', [input.conversationId, input.senderId]);
    await tx.query('update conversation_members set last_read_seq = $3, unread_count = 0 where conversation_id = $1 and user_id = $2', [input.conversationId, input.senderId, seq]);
    const message = (await getMessage(tx, ctx, input.senderId, id))!;
    return { message, memberIds: members, duplicate: false };
  });
}

export async function markRead(db: Db, userId: string, conversationId: string, seq: number): Promise<{ lastReadSeq: number; memberIds: string[] } | null> {
  const r = await db.query(
    `update conversation_members cm set
       last_read_seq = greatest(cm.last_read_seq, least($3::bigint, (select coalesce(max(seq), 0) from messages where conversation_id = $1))),
       unread_count = (
         select count(*) from messages m
         where m.conversation_id = $1 and m.sender_id <> $2 and m.deleted_at is null
           and m.seq > greatest(cm.last_read_seq, least($3::bigint, (select coalesce(max(seq), 0) from messages where conversation_id = $1)))
           and ${NOT_HIDDEN('$2')}
       )
     where cm.conversation_id = $1 and cm.user_id = $2
     returning cm.last_read_seq`,
    [conversationId, userId, seq],
  );
  if (!r.rows[0]) return null;
  return { lastReadSeq: r.rows[0].last_read_seq, memberIds: await getMemberIds(db, conversationId) };
}

export async function editMessage(db: Db, ctx: MsgCtx, userId: string, messageId: string, rawBody: string): Promise<{ message: Message; memberIds: string[] }> {
  const body = rawBody.trim();
  if (body.length > MAX_BODY_LENGTH) throw new HttpError(400, 'message_too_long', `Messages can be up to ${MAX_BODY_LENGTH} characters.`);
  const cur = await db.query('select conversation_id, sender_id, deleted_at, attachments from messages where id = $1', [messageId]);
  const row = cur.rows[0];
  if (!row) throw notFound('message_not_found', 'Message not found.');
  await assertMember(db, row.conversation_id, userId);
  if (row.sender_id !== userId) throw forbidden('not_author', 'You can only edit your own messages.');
  if (row.deleted_at) throw new HttpError(400, 'message_deleted', 'This message was deleted.');
  if (!body && !(row.attachments as unknown[]).length) throw new HttpError(400, 'empty_message', 'A message cannot be empty.');
  await db.query('update messages set body = $2, edited_at = now() where id = $1', [messageId, body]);
  return { message: (await getMessage(db, ctx, userId, messageId))!, memberIds: await getMemberIds(db, row.conversation_id) };
}

export async function deleteMessage(
  db: Db,
  ctx: MsgCtx,
  userId: string,
  messageId: string,
  scope: 'me' | 'everyone',
): Promise<{ conversationId: string; memberIds: string[]; message?: Message; uploadKeys: string[] }> {
  const cur = await db.query('select conversation_id, sender_id, deleted_at, attachments from messages where id = $1', [messageId]);
  const row = cur.rows[0];
  if (!row) throw notFound('message_not_found', 'Message not found.');
  await assertMember(db, row.conversation_id, userId);
  const memberIds = await getMemberIds(db, row.conversation_id);
  if (scope === 'me') {
    await db.query('insert into message_deletions (message_id, user_id) values ($1, $2) on conflict do nothing', [messageId, userId]);
    return { conversationId: row.conversation_id, memberIds, uploadKeys: [] };
  }
  if (row.sender_id !== userId) throw forbidden('not_author', 'You can only delete your own messages for everyone.');
  if (row.deleted_at) return { conversationId: row.conversation_id, memberIds, message: (await getMessage(db, ctx, userId, messageId))!, uploadKeys: [] };
  const ids = (row.attachments as { id: string }[]).map((a) => a.id);
  const uploadKeys = await db.tx(async (tx) => {
    await tx.query("update messages set deleted_at = now(), body = '', attachments = '[]'::jsonb where id = $1", [messageId]);
    await tx.query('delete from reactions where message_id = $1', [messageId]);
    if (!ids.length) return [] as string[];
    const del = await tx.query('delete from uploads where id = any($1) returning key', [ids]);
    return del.rows.map((x) => x.key as string);
  });
  return { conversationId: row.conversation_id, memberIds, message: (await getMessage(db, ctx, userId, messageId))!, uploadKeys };
}

const EMOJI_RE = /^\p{Extended_Pictographic}/u;

export async function toggleReaction(db: Db, userId: string, messageId: string, emoji: string): Promise<{ conversationId: string; memberIds: string[]; reactions: ReactionGroup[] }> {
  if (emoji.length > 16 || !EMOJI_RE.test(emoji)) throw new HttpError(400, 'invalid_emoji', 'Pick an emoji.');
  const cur = await db.query('select conversation_id, deleted_at from messages where id = $1', [messageId]);
  const row = cur.rows[0];
  if (!row) throw notFound('message_not_found', 'Message not found.');
  await assertMember(db, row.conversation_id, userId);
  if (row.deleted_at) throw new HttpError(400, 'message_deleted', 'This message was deleted.');
  const del = await db.query('delete from reactions where message_id = $1 and user_id = $2 and emoji = $3', [messageId, userId, emoji]);
  if (!del.rowCount) await db.query('insert into reactions (message_id, user_id, emoji) values ($1, $2, $3) on conflict do nothing', [messageId, userId, emoji]);
  const list = await db.query('select emoji, user_id as "userId" from reactions where message_id = $1 order by created_at', [messageId]);
  return { conversationId: row.conversation_id, memberIds: await getMemberIds(db, row.conversation_id), reactions: groupReactions(list.rows) };
}
