import type { PrivacySettings } from '../../../shared/types.js';

export const DEFAULT_SETTINGS: PrivacySettings = { showOnline: true, showLastSeen: true, readReceipts: true, whoCanMessage: 'friends' };

export function normalizeSettings(raw: unknown): PrivacySettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    showOnline: typeof r.showOnline === 'boolean' ? r.showOnline : DEFAULT_SETTINGS.showOnline,
    showLastSeen: typeof r.showLastSeen === 'boolean' ? r.showLastSeen : DEFAULT_SETTINGS.showLastSeen,
    readReceipts: typeof r.readReceipts === 'boolean' ? r.readReceipts : DEFAULT_SETTINGS.readReceipts,
    whoCanMessage: r.whoCanMessage === 'everyone' ? 'everyone' : 'friends',
  };
}

/** Who is connected right now (this server process). */
export class Presence {
  private sockets = new Map<string, Set<string>>();

  /** returns true when this is the user's first connection */
  add(userId: string, socketId: string): boolean {
    const set = this.sockets.get(userId) ?? new Set<string>();
    const first = set.size === 0;
    set.add(socketId);
    this.sockets.set(userId, set);
    return first;
  }

  /** returns true when the user has no connections left */
  remove(userId: string, socketId: string): boolean {
    const set = this.sockets.get(userId);
    if (!set) return false;
    set.delete(socketId);
    if (set.size === 0) {
      this.sockets.delete(userId);
      return true;
    }
    return false;
  }

  isOnline(userId: string): boolean {
    return (this.sockets.get(userId)?.size ?? 0) > 0;
  }

  get size() {
    return this.sockets.size;
  }
}
