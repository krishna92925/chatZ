import type { Profile, PublicUser } from '../../../shared/types.js';
import { normalizeSettings, type Presence } from './presence.js';

export interface ProfileRow {
  id: string;
  username: string;
  full_name: string;
  bio: string;
  avatar_key: string | null;
  avatar_version: number;
  connect_code?: string;
  settings: unknown;
  last_seen_at: Date | string | null;
  created_at?: Date | string;
}

export const avatarPath = (id: string, key: string | null, version: number) => (key ? `/api/avatars/${id}?v=${version}` : null);
const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

export function toProfile(r: ProfileRow): Profile {
  return {
    id: r.id,
    username: r.username,
    fullName: r.full_name,
    bio: r.bio,
    avatarUrl: avatarPath(r.id, r.avatar_key, r.avatar_version),
    connectCode: r.connect_code ?? '',
    settings: normalizeSettings(r.settings),
    createdAt: iso(r.created_at) ?? new Date().toISOString(),
  };
}

/** What other people may see: online state and last seen follow the person's privacy settings. */
export function toPublicUser(r: ProfileRow, presence: Presence): PublicUser {
  const s = normalizeSettings(r.settings);
  const online = s.showOnline && presence.isOnline(r.id);
  return {
    id: r.id,
    username: r.username,
    fullName: r.full_name,
    bio: r.bio,
    avatarUrl: avatarPath(r.id, r.avatar_key, r.avatar_version),
    online,
    lastSeenAt: s.showOnline && s.showLastSeen && !online ? iso(r.last_seen_at) : null,
  };
}

export const PROFILE_COLS = 'p.id, p.username, p.full_name, p.bio, p.avatar_key, p.avatar_version, p.settings, p.last_seen_at';
