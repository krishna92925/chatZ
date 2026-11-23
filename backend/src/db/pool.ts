import pg from 'pg';
import type { Logger } from '../logger.js';

// bigint (int8) columns hold counters and sequence numbers that stay far below 2^53.
pg.types.setTypeParser(20, (v) => Number(v));

export type Queryable = {
  query: <R extends pg.QueryResultRow = any>(text: string, params?: unknown[]) => Promise<pg.QueryResult<R>>;
};

const TRANSIENT = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EPIPE', '57P01', '57P03', '08006', '08003', '08001']);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Db implements Queryable {
  constructor(
    readonly pool: pg.Pool,
    private log: Logger,
  ) {}

  /** Single statement with a short retry: serverless Postgres can be asleep for a moment after idle time. */
  async query<R extends pg.QueryResultRow = any>(text: string, params?: unknown[]): Promise<pg.QueryResult<R>> {
    let attempt = 0;
    for (;;) {
      try {
        return await this.pool.query<R>(text, params as any[]);
      } catch (err: any) {
        const code = err?.code as string | undefined;
        if (attempt < 3 && code && TRANSIENT.has(code)) {
          attempt++;
          this.log.warn({ code, attempt }, 'transient database error, retrying');
          await sleep(250 * attempt);
          continue;
        }
        throw err;
      }
    }
  }

  async tx<T>(fn: (q: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const out = await fn(client);
      await client.query('commit');
      return out;
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async close() {
    await this.pool.end();
  }
}

export function createDb(url: string, max: number, log: Logger): Db {
  const needsSsl = /sslmode=(require|verify-full|verify-ca)/.test(url) || /neon\.tech/.test(url);
  const pool = new pg.Pool({
    connectionString: url,
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ...(needsSsl ? { ssl: { rejectUnauthorized: true } } : {}),
  });
  pool.on('error', (err) => log.error({ err }, 'idle database client error'));
  return new Db(pool, log);
}
