import type { Db, Queryable } from '../db/pool.js';
import { HttpError, conflict, forbidden, notFound } from '../lib/errors.js';
import { PROFILE_COLS, toPublicUser, type ProfileRow } from './mappers.js';
import { normalizeSettings, type Presence } from './presence.js';
import type { FriendRequest, Relation, UserCard } from '../../../shared/types.js';

export const pair = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

export async function blockedEitherWay(q: Queryable, a: string, b: string): Promise<boolean> {
  const r = await q.query('select 1 from blocks where (blocker_id = $1 and blocked_id = $2) or (blocker_id = $2 and blocked_id = $1) limit 1', [a, b]);
  return r.rowCount! > 0;
}

export async function areFriends(q: Queryable, a: string, b: string): Promise<boolean> {
  const [lo, hi] = pair(a, b);
  const r = await q.query("select 1 from friendships where user_low = $1 and user_high = $2 and status = 'accepted'", [lo, hi]);
  return r.rowCount! > 0;
}

export async function ensureDirectConversation(q: Queryable, a: string, b: string): Promise<string> {
  const [lo, hi] = pair(a, b);
  const key = `${lo}:${hi}`;
  const ins = await q.query("insert into conversations (type, direct_key, created_by) values ('direct', $1, $2) on conflict (direct_key) do nothing returning id", [key, a]);
  const id: string = ins.rows[0]?.id ?? (await q.query('select id from conversations where direct_key = $1', [key])).rows[0].id;
  await q.query('insert into conversation_members (conversation_id, user_id) values ($1, $2), ($1, $3) on conflict do nothing', [id, lo, hi]);
  return id;
}

/** May `sender` start or continue a chat with `target`? */
export async function canMessage(q: Queryable, sender: string, target: string): Promise<boolean> {
  if (await blockedEitherWay(q, sender, target)) return false;
  if (await areFriends(q, sender, target)) return true;
  const r = await q.query('select settings from profiles where id = $1', [target]);
  return r.rows[0] ? normalizeSettings(r.rows[0].settings).whoCanMessage === 'everyone' : false;
}

export interface RelationInfo {
  relation: Relation;
  requestId: string | null;
}

export function relationFrom(me: string, row: { fr_id: string | null; fr_status: string | null; fr_by: string | null; blocked_by_me: boolean; blocked_me: boolean; id: string }): RelationInfo {
  if (row.id === me) return { relation: 'self', requestId: null };
  if (row.blocked_by_me) return { relation: 'blocked', requestId: null };
  if (row.blocked_me) return { relation: 'blocked_by', requestId: null };
  if (row.fr_status === 'accepted') return { relation: 'friends', requestId: row.fr_id };
  if (row.fr_status === 'pending') return { relation: row.fr_by === me ? 'request_sent' : 'request_received', requestId: row.fr_id };
  return { relation: 'none', requestId: null };
}

const RELATION_SQL = `
  f.id as fr_id, f.status as fr_status, f.requested_by as fr_by,
  exists (select 1 from blocks b where b.blocker_id = $1 and b.blocked_id = p.id) as blocked_by_me,
  exists (select 1 from blocks b where b.blocker_id = p.id and b.blocked_id = $1) as blocked_me`;
const RELATION_JOIN = `left join friendships f on f.user_low = least($1::uuid, p.id) and f.user_high = greatest($1::uuid, p.id)`;

export function toUserCard(me: string, row: ProfileRow & any, presence: Presence): UserCard {
  const { relation, requestId } = relationFrom(me, row);
  const settings = normalizeSettings(row.settings);
  return {
    ...toPublicUser(row, presence),
    relation,
    requestId,
    canMessage: relation === 'friends' || (relation !== 'blocked' && relation !== 'blocked_by' && relation !== 'self' && settings.whoCanMessage === 'everyone'),
  };
}

export async function userCardById(q: Queryable, me: string, id: string, presence: Presence): Promise<UserCard | null> {
  const r = await q.query(`select ${PROFILE_COLS}, ${RELATION_SQL} from profiles p ${RELATION_JOIN} where p.id = $2`, [me, id]);
  return r.rows[0] ? toUserCard(me, r.rows[0], presence) : null;
}

export async function userCardByCode(q: Queryable, me: string, code: string, presence: Presence): Promise<UserCard | null> {
  const r = await q.query(`select ${PROFILE_COLS}, ${RELATION_SQL} from profiles p ${RELATION_JOIN} where p.connect_code = $2`, [me, code.toUpperCase()]);
  return r.rows[0] ? toUserCard(me, r.rows[0], presence) : null;
}

export async function userCardByUsername(q: Queryable, me: string, username: string, presence: Presence): Promise<UserCard | null> {
  const r = await q.query(`select ${PROFILE_COLS}, ${RELATION_SQL} from profiles p ${RELATION_JOIN} where lower(p.username) = $2`, [me, username.toLowerCase()]);
  return r.rows[0] ? toUserCard(me, r.rows[0], presence) : null;
}

export async function searchUsers(q: Queryable, me: string, term: string, presence: Presence): Promise<UserCard[]> {
  const t = term.trim().toLowerCase().replace(/^@/, '');
  const esc = t.replace(/[\\%_]/g, (c) => `\\${c}`);
  const r = await q.query(
    `select ${PROFILE_COLS}, ${RELATION_SQL}
     from profiles p ${RELATION_JOIN}
     where p.id <> $1
       and (lower(p.username) like $3 or lower(p.full_name) like $2)
       and not exists (select 1 from blocks b where b.blocker_id = p.id and b.blocked_id = $1)
     order by (lower(p.username) = $4) desc, (lower(p.username) like $3) desc, p.username
     limit 20`,
    [me, `%${esc}%`, `${esc}%`, t],
  );
  return r.rows.map((row) => toUserCard(me, row, presence));
}

export async function listFriends(q: Queryable, me: string, presence: Presence) {
  const r = await q.query(
    `select ${PROFILE_COLS} from friendships f
     join profiles p on p.id = case when f.user_low = $1 then f.user_high else f.user_low end
     where (f.user_low = $1 or f.user_high = $1) and f.status = 'accepted'
     order by lower(p.username)`,
    [me],
  );
  return r.rows.map((row) => toPublicUser(row, presence));
}

export async function listRequests(q: Queryable, me: string, presence: Presence): Promise<FriendRequest[]> {
  const r = await q.query(
    `select f.id, f.created_at, f.requested_by, ${PROFILE_COLS} from friendships f
     join profiles p on p.id = case when f.user_low = $1 then f.user_high else f.user_low end
     where (f.user_low = $1 or f.user_high = $1) and f.status = 'pending'
     order by f.created_at desc`,
    [me],
  );
  return r.rows.map((row) => ({
    id: row.id,
    direction: row.requested_by === me ? ('outgoing' as const) : ('incoming' as const),
    user: toPublicUser(row, presence),
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

export type RequestOutcome = { status: 'sent'; friendshipId: string } | { status: 'accepted'; friendshipId: string; conversationId: string };

export async function sendRequest(db: Db, me: string, target: string): Promise<RequestOutcome> {
  if (target === me) throw new HttpError(400, 'self_request', "You can't add yourself.");
  const exists = await db.query('select 1 from profiles where id = $1', [target]);
  if (!exists.rowCount) throw notFound('user_not_found', 'We could not find that person.');
  if (await blockedEitherWay(db, me, target)) throw forbidden('blocked', "You can't send a request to this person.");
  const [lo, hi] = pair(me, target);
  const ins = await db.query(
    "insert into friendships (user_low, user_high, requested_by, status) values ($1, $2, $3, 'pending') on conflict (user_low, user_high) do nothing returning id",
    [lo, hi, me],
  );
  if (ins.rows[0]) return { status: 'sent', friendshipId: ins.rows[0].id };
  const cur = (await db.query('select id, status, requested_by from friendships where user_low = $1 and user_high = $2', [lo, hi])).rows[0];
  if (!cur) throw new HttpError(409, 'try_again', 'Please try again.');
  if (cur.status === 'accepted') throw conflict('already_friends', 'You are already friends.');
  if (cur.requested_by === me) throw conflict('request_pending', 'You already sent a request to this person.');
  // they asked first: sending a request back means yes
  const accepted = await acceptRequest(db, me, cur.id);
  return { status: 'accepted', friendshipId: cur.id, conversationId: accepted.conversationId };
}

export async function acceptRequest(db: Db, me: string, friendshipId: string): Promise<{ otherId: string; conversationId: string }> {
  return db.tx(async (tx) => {
    const r = await tx.query('select * from friendships where id = $1 for update', [friendshipId]);
    const f = r.rows[0];
    if (!f || (f.user_low !== me && f.user_high !== me)) throw notFound('request_not_found', 'That request no longer exists.');
    const other: string = f.user_low === me ? f.user_high : f.user_low;
    if (f.status === 'accepted') return { otherId: other, conversationId: await ensureDirectConversation(tx, me, other) };
    if (f.requested_by === me) throw forbidden('not_recipient', 'Only the person who received the request can accept it.');
    if (await blockedEitherWay(tx, me, other)) throw forbidden('blocked', 'This request can no longer be accepted.');
    await tx.query("update friendships set status = 'accepted', responded_at = now() where id = $1", [friendshipId]);
    return { otherId: other, conversationId: await ensureDirectConversation(tx, me, other) };
  });
}

/** Decline an incoming request or cancel one you sent. Returns the other person's id. */
export async function dropRequest(db: Db, me: string, friendshipId: string): Promise<string> {
  const r = await db.query(
    "delete from friendships where id = $1 and status = 'pending' and (user_low = $2 or user_high = $2) returning user_low, user_high",
    [friendshipId, me],
  );
  const row = r.rows[0];
  if (!row) throw notFound('request_not_found', 'That request no longer exists.');
  return row.user_low === me ? row.user_high : row.user_low;
}

export async function unfriend(db: Db, me: string, other: string): Promise<boolean> {
  const [lo, hi] = pair(me, other);
  const r = await db.query("delete from friendships where user_low = $1 and user_high = $2 and status = 'accepted'", [lo, hi]);
  return r.rowCount! > 0;
}

export async function blockUser(db: Db, me: string, target: string): Promise<void> {
  if (me === target) throw new HttpError(400, 'self_block', "You can't block yourself.");
  const exists = await db.query('select 1 from profiles where id = $1', [target]);
  if (!exists.rowCount) throw notFound('user_not_found', 'We could not find that person.');
  const [lo, hi] = pair(me, target);
  await db.tx(async (tx) => {
    await tx.query('insert into blocks (blocker_id, blocked_id) values ($1, $2) on conflict do nothing', [me, target]);
    await tx.query('delete from friendships where user_low = $1 and user_high = $2', [lo, hi]);
  });
}

export async function unblockUser(db: Db, me: string, target: string): Promise<void> {
  await db.query('delete from blocks where blocker_id = $1 and blocked_id = $2', [me, target]);
}

export async function listBlocked(q: Queryable, me: string, presence: Presence) {
  const r = await q.query(`select ${PROFILE_COLS} from blocks b join profiles p on p.id = b.blocked_id where b.blocker_id = $1 order by b.created_at desc`, [me]);
  return r.rows.map((row) => toPublicUser(row, presence));
}

/** Everyone who should hear about this user's presence: friends and chat partners. */
export async function presenceAudience(q: Queryable, userId: string): Promise<string[]> {
  const r = await q.query(
    `select case when user_low = $1 then user_high else user_low end as id from friendships where (user_low = $1 or user_high = $1) and status = 'accepted'
     union
     select pm.user_id as id from conversation_members cm join conversation_members pm on pm.conversation_id = cm.conversation_id and pm.user_id <> cm.user_id where cm.user_id = $1`,
    [userId],
  );
  return r.rows.map((x) => x.id as string);
}
