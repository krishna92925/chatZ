import http from 'node:http';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { createDb } from './db/pool.js';
import { migrate } from './db/migrate.js';
import { createSupabaseAuthApi, createTokenVerifier } from './auth.js';
import { createStorage } from './services/storage.js';
import { Presence } from './services/presence.js';
import { createApp } from './app.js';
import { attachSocket } from './socket/index.js';
import type { Deps } from './deps.js';

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
const log = createLogger(config.LOG_LEVEL, !config.isProd);
const db = createDb(config.DATABASE_URL, config.DATABASE_POOL_MAX, log);

if (config.AUTO_MIGRATE) await migrate(db, log);
if (!config.storageEnabled) log.warn('Object storage is not configured: photo and file uploads are disabled.');

const deps: Deps = {
  config,
  log,
  db,
  storage: createStorage(config),
  verifyToken: createTokenVerifier(config),
  supabase: createSupabaseAuthApi(config),
  presence: new Presence(),
};

const app = createApp(deps);
const server = http.createServer(app);
const io = attachSocket(server, deps);

// Files that were uploaded but never attached to a message are removed after a few hours.
const cleanup = setInterval(async () => {
  try {
    const old = await db.query("select id, key from uploads where used_at is null and created_at < now() - interval '6 hours' limit 200");
    if (!old.rows.length) return;
    await deps.storage.delete(old.rows.map((r) => r.key as string));
    await db.query('delete from uploads where id = any($1)', [old.rows.map((r) => r.id)]);
    log.info({ count: old.rows.length }, 'removed unused uploads');
  } catch (err) {
    log.warn({ err }, 'upload cleanup failed');
  }
}, 60 * 60_000);
cleanup.unref();

server.listen(config.PORT, () => log.info({ port: config.PORT, env: config.NODE_ENV }, 'chatZ API listening'));
server.on('error', (err) => {
  log.fatal({ err }, 'server error');
  process.exit(1);
});

let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  log.info({ signal }, 'shutting down');
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  io.close();
  server.close(async () => {
    await db.close().catch(() => undefined);
    process.exit(0);
  });
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (err) => log.error({ err }, 'unhandled rejection'));
