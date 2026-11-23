import { loadConfig } from '../config.js';
import { createLogger } from '../logger.js';
import { createDb } from './pool.js';
import { migrate } from './migrate.js';

const config = loadConfig();
const log = createLogger(config.LOG_LEVEL, !config.isProd);
const db = createDb(config.DATABASE_URL, 2, log);
const applied = await migrate(db, log);
log.info({ applied }, 'migrations finished');
await db.close();
