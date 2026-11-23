import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './pool.js';
import type { Logger } from '../logger.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// src/db (development) and dist/backend/src/db (compiled) sit at different depths from backend/migrations
const dir = [path.resolve(here, '../../migrations'), path.resolve(here, '../../../../migrations')].find((d) => fs.existsSync(d)) ?? path.resolve(here, '../../migrations');

export async function migrate(db: Db, log: Logger): Promise<string[]> {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const applied: string[] = [];
  const client = await db.pool.connect();
  try {
    // One migrator at a time, even with several server instances starting together.
    await client.query('select pg_advisory_lock(727001)');
    await client.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
    const done = new Set((await client.query<{ name: string }>('select name from schema_migrations')).rows.map((r) => r.name));
    for (const f of files) {
      if (done.has(f)) continue;
      const sql = fs.readFileSync(path.join(dir, f), 'utf8');
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into schema_migrations (name) values ($1)', [f]);
        await client.query('commit');
        applied.push(f);
        log.info({ migration: f }, 'migration applied');
      } catch (err) {
        await client.query('rollback');
        throw err;
      }
    }
  } finally {
    await client.query('select pg_advisory_unlock(727001)').catch(() => undefined);
    client.release();
  }
  return applied;
}
