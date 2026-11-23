import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Deps } from '../deps.js';
import { HttpError } from '../lib/errors.js';
import { processAvatar } from '../lib/media.js';
import { parse } from '../lib/validate.js';
import { forgetOnboarded, requireAuth, requireProfile } from '../middleware.js';
import { toProfile } from '../services/mappers.js';
import { createProfile, generateConnectCode, getProfile, requireProfile as loadProfile } from '../services/profiles.js';
import { normalizeSettings } from '../services/presence.js';
import { broadcastPresence } from '../services/broadcast.js';
import { presenceAudience } from '../services/friends.js';
import { realtime } from '../realtime.js';
import { MAX_AVATAR_BYTES, MAX_BIO_LENGTH, MAX_NAME_LENGTH } from '../../../shared/constants.js';
import type { MeResponse } from '../../../shared/types.js';
import { invalidateAvatarCache } from './files.js';

const nameSchema = z.string().trim().min(1, 'Enter your name').max(MAX_NAME_LENGTH);
const bioSchema = z.string().trim().max(MAX_BIO_LENGTH);

export function meRoutes(deps: Deps): Router {
  const r = Router();
  const auth = requireAuth(deps);
  const profileRequired = requireProfile(deps);
  const avatarUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_AVATAR_BYTES, files: 1 } });

  r.get('/', auth, async (req, res) => {
    const row = await getProfile(deps.db, req.auth.id);
    const out: MeResponse = { email: req.auth.email, profile: row ? toProfile(row) : null };
    res.json(out);
  });

  r.post('/onboarding', auth, async (req, res) => {
    const body = parse(z.object({ username: z.string().trim().min(1), fullName: nameSchema, bio: bioSchema.default('') }), req.body);
    if (!req.auth.email) throw new HttpError(400, 'email_missing', 'Your account has no email address.');
    const row = await createProfile(deps.db, { id: req.auth.id, email: req.auth.email, username: body.username, fullName: body.fullName, bio: body.bio });
    res.status(201).json(toProfile(row));
  });

  r.patch('/', auth, profileRequired, async (req, res) => {
    const body = parse(z.object({ fullName: nameSchema.optional(), bio: bioSchema.optional() }), req.body);
    await deps.db.query('update profiles set full_name = coalesce($2, full_name), bio = coalesce($3, bio), updated_at = now() where id = $1', [req.auth.id, body.fullName ?? null, body.bio ?? null]);
    res.json(toProfile(await loadProfile(deps.db, req.auth.id)));
  });

  r.patch('/settings', auth, profileRequired, async (req, res) => {
    const body = parse(
      z.object({ showOnline: z.boolean().optional(), showLastSeen: z.boolean().optional(), readReceipts: z.boolean().optional(), whoCanMessage: z.enum(['friends', 'everyone']).optional() }),
      req.body,
    );
    const cur = await loadProfile(deps.db, req.auth.id);
    const next = { ...normalizeSettings(cur.settings), ...body };
    await deps.db.query('update profiles set settings = $2::jsonb, updated_at = now() where id = $1', [req.auth.id, JSON.stringify(next)]);
    void broadcastPresence(deps, req.auth.id).catch((err) => deps.log.warn({ err }, 'presence broadcast failed'));
    res.json(toProfile(await loadProfile(deps.db, req.auth.id)));
  });

  r.post('/avatar', auth, profileRequired, avatarUpload.single('file'), async (req, res) => {
    if (!deps.storage.enabled) throw new HttpError(503, 'storage_disabled', 'Photo uploads are not set up on this server yet.');
    if (!req.file) throw new HttpError(400, 'no_file', 'Choose an image first.');
    const img = await processAvatar(req.file.buffer);
    const key = `avatars/${req.auth.id}/${randomUUID()}.webp`;
    await deps.storage.put(key, img.buffer, img.mime);
    const old = await deps.db.query('select avatar_key from profiles where id = $1', [req.auth.id]);
    await deps.db.query('update profiles set avatar_key = $2, avatar_version = avatar_version + 1, updated_at = now() where id = $1', [req.auth.id, key]);
    invalidateAvatarCache(req.auth.id);
    if (old.rows[0]?.avatar_key) void deps.storage.delete([old.rows[0].avatar_key]).catch(() => undefined);
    res.json(toProfile(await loadProfile(deps.db, req.auth.id)));
  });

  r.delete('/avatar', auth, profileRequired, async (req, res) => {
    const old = await deps.db.query('select avatar_key from profiles where id = $1', [req.auth.id]);
    await deps.db.query('update profiles set avatar_key = null, avatar_version = avatar_version + 1, updated_at = now() where id = $1', [req.auth.id]);
    invalidateAvatarCache(req.auth.id);
    if (old.rows[0]?.avatar_key) void deps.storage.delete([old.rows[0].avatar_key]).catch(() => undefined);
    res.json(toProfile(await loadProfile(deps.db, req.auth.id)));
  });

  r.post('/connect-code/regenerate', auth, profileRequired, async (req, res) => {
    for (let i = 0; i < 5; i++) {
      try {
        await deps.db.query('update profiles set connect_code = $2, updated_at = now() where id = $1', [req.auth.id, generateConnectCode()]);
        return void res.json(toProfile(await loadProfile(deps.db, req.auth.id)));
      } catch (err: any) {
        if (err?.code !== '23505') throw err;
      }
    }
    throw new HttpError(500, 'code_generation_failed', 'Could not make a new code. Try again.');
  });

  r.delete('/', auth, profileRequired, async (req, res) => {
    const body = parse(z.object({ confirm: z.string() }), req.body);
    const me = await loadProfile(deps.db, req.auth.id);
    if (body.confirm.trim().toLowerCase() !== me.username.toLowerCase()) throw new HttpError(400, 'confirmation_mismatch', 'Type your username exactly to confirm.');
    const audience = await presenceAudience(deps.db, req.auth.id);
    const files = await deps.db.query('select key from uploads where owner_id = $1', [req.auth.id]);
    const keys = files.rows.map((x) => x.key as string);
    if (me.avatar_key) keys.push(me.avatar_key);
    await deps.db.query('delete from profiles where id = $1', [req.auth.id]);
    forgetOnboarded(req.auth.id);
    invalidateAvatarCache(req.auth.id);
    realtime.toUsers(audience, 'friend:removed', { userId: req.auth.id });
    void deps.storage.delete(keys).catch((err) => deps.log.warn({ err }, 'could not delete files of removed account'));
    res.status(204).end();
  });

  return r;
}
