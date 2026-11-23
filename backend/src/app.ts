import compression from 'compression';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Deps } from './deps.js';
import { errorHandler, notFoundHandler } from './middleware.js';
import { authRoutes } from './routes/auth.js';
import { chatRoutes } from './routes/chats.js';
import { fileRoutes } from './routes/files.js';
import { meRoutes } from './routes/me.js';
import { socialRoutes } from './routes/social.js';

export function createApp(deps: Deps) {
  const { config } = deps;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY);

  app.use(pinoHttp({ logger: deps.log, autoLogging: { ignore: (req) => req.url === '/health' } }));
  // images, avatars and video are loaded by the web app from another origin
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || config.origins.includes(origin)),
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type'],
      maxAge: 600,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '100kb' }));
  app.use(rateLimit({ windowMs: 60_000, limit: config.NODE_ENV === 'test' ? 100_000 : 600, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'rate_limited', message: 'Too many requests. Slow down a little.' } } }));

  app.get('/health', async (_req, res) => {
    try {
      await deps.db.query('select 1');
      res.json({ ok: true, db: true, storage: deps.storage.enabled, online: deps.presence.size });
    } catch {
      res.status(503).json({ ok: false, db: false });
    }
  });

  app.use('/api/auth', authRoutes(deps));
  app.use('/api/me', meRoutes(deps));
  app.use('/api', socialRoutes(deps));
  app.use('/api', chatRoutes(deps));
  app.use('/api', fileRoutes(deps));

  app.use(notFoundHandler);
  app.use(errorHandler(deps));
  return app;
}
