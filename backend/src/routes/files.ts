import { Router, type Response } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream';
import type { Deps } from '../deps.js';
import { HttpError, notFound } from '../lib/errors.js';
import { KeyedLimiter } from '../lib/limiter.js';
import { processUpload } from '../lib/media.js';
import { verifyFileSignature } from '../lib/signing.js';
import { uuid } from '../lib/validate.js';
import { requireAuth, requireProfile } from '../middleware.js';
import { MAX_VIDEO_BYTES } from '../../../shared/constants.js';
import type { UploadResult } from '../../../shared/types.js';

const avatarCache = new Map<string, { key: string | null; at: number }>();
export const invalidateAvatarCache = (userId: string) => avatarCache.delete(userId);

function stream(res: Response, obj: Awaited<ReturnType<Deps['storage']['get']>>, headers: Record<string, string>) {
  res.status(obj.status);
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  if (obj.contentLength !== undefined) res.setHeader('Content-Length', String(obj.contentLength));
  if (obj.contentRange) res.setHeader('Content-Range', obj.contentRange);
  res.setHeader('Accept-Ranges', 'bytes');
  pipeline(obj.body, res, () => undefined);
}

export function fileRoutes(deps: Deps): Router {
  const r = Router();
  const auth = requireAuth(deps);
  const profileRequired = requireProfile(deps);
  const uploadLimiter = new KeyedLimiter(10 * 60_000, deps.config.NODE_ENV === 'test' ? 10_000 : 40);
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_VIDEO_BYTES, files: 1 } });
  let busy = 0;

  r.post('/uploads', auth, profileRequired, upload.single('file'), async (req, res) => {
    if (!deps.storage.enabled) throw new HttpError(503, 'storage_disabled', 'File uploads are not set up on this server yet.');
    if (!uploadLimiter.take(req.auth.id)) throw new HttpError(429, 'rate_limited', 'You are uploading too fast. Wait a moment.');
    if (!req.file) throw new HttpError(400, 'no_file', 'Choose a file first.');
    if (busy >= 4) throw new HttpError(503, 'busy', 'The server is busy processing uploads. Try again in a few seconds.');
    busy++;
    try {
      const p = await processUpload(req.file.buffer, req.file.originalname);
      const key = `u/${req.auth.id}/${randomUUID()}.${p.ext}`;
      await deps.storage.put(key, p.buffer, p.mime);
      const ins = await deps.db.query(
        'insert into uploads (owner_id, key, kind, mime, size, name, width, height) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id',
        [req.auth.id, key, p.kind, p.mime, p.buffer.length, p.name, p.width, p.height],
      );
      const out: UploadResult = { id: ins.rows[0].id, kind: p.kind, mime: p.mime, size: p.buffer.length, name: p.name, width: p.width, height: p.height };
      res.status(201).json(out);
    } finally {
      busy--;
    }
  });

  r.get('/files/:id', async (req, res) => {
    const id = uuid.safeParse(req.params.id);
    const exp = Number(req.query.e);
    if (!id.success || !verifyFileSignature(deps.config.FILE_URL_SECRET, id.data, exp, String(req.query.s ?? ''))) throw notFound('file_not_found', 'This file link has expired.');
    const row = (await deps.db.query('select key, kind, mime, name from uploads where id = $1', [id.data])).rows[0];
    if (!row) throw notFound('file_not_found', 'This file is no longer available.');
    if (deps.config.STORAGE_DELIVERY === 'presign') {
      return void res.redirect(302, await deps.storage.presignGet(row.key, 3600, row.name, row.kind === 'file' ? 'application/octet-stream' : row.mime));
    }
    try {
      const obj = await deps.storage.get(row.key, req.headers.range);
      const inline = row.kind !== 'file';
      stream(res, obj, {
        'Content-Type': inline ? row.mime : 'application/octet-stream',
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(row.name)}`,
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      });
    } catch (err: any) {
      if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) throw notFound('file_not_found', 'This file is no longer available.');
      if (err?.$metadata?.httpStatusCode === 416) return void res.status(416).end();
      throw err;
    }
  });

  r.get('/avatars/:userId', async (req, res) => {
    const id = uuid.safeParse(req.params.userId);
    if (!id.success) throw notFound('avatar_not_found');
    let hit = avatarCache.get(id.data);
    if (!hit || Date.now() - hit.at > 60_000) {
      const row = (await deps.db.query('select avatar_key from profiles where id = $1', [id.data])).rows[0];
      hit = { key: row?.avatar_key ?? null, at: Date.now() };
      avatarCache.set(id.data, hit);
    }
    if (!hit.key || !deps.storage.enabled) throw notFound('avatar_not_found');
    try {
      const obj = await deps.storage.get(hit.key);
      stream(res, obj, {
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      });
    } catch (err: any) {
      if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) throw notFound('avatar_not_found');
      throw err;
    }
  });

  return r;
}
