import type { Config } from './config.js';
import type { Logger } from './logger.js';
import type { Db } from './db/pool.js';
import type { Storage } from './services/storage.js';
import type { SupabaseAuthApi, TokenVerifier } from './auth.js';
import type { Presence } from './services/presence.js';

export interface Deps {
  config: Config;
  log: Logger;
  db: Db;
  storage: Storage;
  verifyToken: TokenVerifier;
  supabase: SupabaseAuthApi;
  presence: Presence;
}
