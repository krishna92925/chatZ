import crypto from 'node:crypto';
import type { Queryable } from '../db/pool.js';
import type { Db } from '../db/pool.js';
import { conflict, notFound, HttpError } from '../lib/errors.js';
import { CONNECT_CODE_LENGTH, RESERVED_USERNAMES, USERNAME_RE } from '../../../shared/constants.js';
import type { ProfileRow } from './mappers.js';
import { DEFAULT_SETTINGS } from './presence.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateConnectCode(): string {
  let out = '';
  for (let i = 0; i < CONNECT_CODE_LENGTH; i++) out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return out;
}

export function checkUsername(raw: string): string {
  const u = raw.trim().toLowerCase();
  if (!USERNAME_RE.test(u)) throw new HttpError(400, 'invalid_username', 'Use 3 to 20 letters, numbers or underscores.');
  if (RESERVED_USERNAMES.includes(u)) throw new HttpError(400, 'reserved_username', 'That username is reserved.');
  return u;
}

export async function usernameTaken(q: Queryable, username: string): Promise<boolean> {
  const r = await q.query('select 1 from profiles where lower(username) = $1', [username.toLowerCase()]);
  return r.rowCount! > 0;
}

export async function getProfile(q: Queryable, id: string): Promise<(ProfileRow & { connect_code: string; email: string }) | null> {
  const r = await q.query('select * from profiles where id = $1', [id]);
  return r.rows[0] ?? null;
}

export async function createProfile(db: Db, input: { id: string; email: string; username: string; fullName: string; bio: string }) {
  const username = checkUsername(input.username);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const r = await db.query(
        `insert into profiles (id, email, username, full_name, bio, connect_code, settings)
         values ($1, $2, $3, $4, $5, $6, $7) returning *`,
        [input.id, input.email, username, input.fullName, input.bio, generateConnectCode(), JSON.stringify(DEFAULT_SETTINGS)],
      );
      return r.rows[0];
    } catch (err: any) {
      if (err?.code !== '23505') throw err;
      const c = String(err.constraint ?? '');
      if (c === 'profiles_username_key') throw conflict('username_taken', 'That username is already taken.');
      if (c === 'profiles_pkey') throw conflict('already_onboarded', 'Your profile already exists.');
      if (c === 'profiles_email_key') throw conflict('email_in_use', 'This email already belongs to another profile.');
      // connect code collision: loop and draw another one
    }
  }
  throw new HttpError(500, 'code_generation_failed', 'Could not create your profile. Try again.');
}

export async function requireProfile(q: Queryable, id: string) {
  const p = await getProfile(q, id);
  if (!p) throw notFound('profile_not_found', 'Profile not found.');
  return p;
}
