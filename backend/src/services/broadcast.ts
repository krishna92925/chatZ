import type { Deps } from '../deps.js';
import { realtime } from '../realtime.js';
import { presenceAudience } from './friends.js';
import { normalizeSettings } from './presence.js';

/** Tell friends and chat partners that this user came online or went offline (respecting privacy settings). */
export async function broadcastPresence(deps: Pick<Deps, 'db' | 'presence'>, userId: string, lastSeen?: Date | null) {
  const p = await deps.db.query('select settings, last_seen_at from profiles where id = $1', [userId]);
  if (!p.rows[0]) return;
  const s = normalizeSettings(p.rows[0].settings);
  const online = s.showOnline && deps.presence.isOnline(userId);
  const seen = lastSeen ?? p.rows[0].last_seen_at;
  const lastSeenAt = s.showOnline && s.showLastSeen && !online && seen ? new Date(seen).toISOString() : null;
  const audience = await presenceAudience(deps.db, userId);
  realtime.toUsers(audience, 'presence:update', { userId, online, lastSeenAt });
}
