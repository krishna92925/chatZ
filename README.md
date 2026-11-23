# chatZ

Private, real-time chat for friends. Sign in with a code sent to your email, find people by username or connect code, and talk with text, photos, videos and files.

**Stack:** React 19 + Vite + Tailwind 4 (web) · Express 5 + Socket.IO (API) · PostgreSQL (Neon) · Supabase Auth (email OTP) · S3-compatible object storage (Neon) for photos, videos and files.

```text
Browser ── email OTP ──▶ Supabase Auth ──▶ access token (JWT, auto-refreshed)
   │
   ├── REST   Authorization: Bearer <token> ─┐
   └── Socket.IO  auth: { token } ───────────┴──▶ chatZ API ──▶ PostgreSQL (Neon)
                                                        └─────▶ Object storage (S3 API)
```

No cookies are used anywhere. The API verifies the Supabase token itself (JWKS, cached), so it works on Safari/iOS and across domains.

## What it does

- **Sign in:** email or username + 6-digit code. Sign up needs email + username. Onboarding creates your profile (name, bio, photo).
- **Friends:** search by name/username, add by connect code, QR code or link, accept/decline requests, block/unblock. You can allow "everyone" to message you in Settings.
- **Chat:** live messages, optimistic sending with retry, read receipts, typing indicator, online/last seen, reply, edit, delete (for me / everyone), reactions, emoji, search in chat and across chats, date separators, jump-to-message.
- **Media:** photos (re-encoded to WebP, metadata removed), videos (range requests so seeking works), any file up to 25 MB. Limits: image 15 MB, video 50 MB, file 25 MB, up to 6 per message.
- **Organise:** pin, mute, archive, unread filter.
- **Settings:** profile, light/dark/system theme, sound and desktop notifications, privacy (online, last seen, read receipts, who can message you), blocked list, sign out everywhere, delete account.
- **Keyboard:** `Ctrl/⌘ K` search, `Alt ↑/↓` switch chat, `Ctrl/⌘ Shift F` search in chat, `?` for the full list.

## Run it locally

```bash
docker compose up -d                 # PostgreSQL on 127.0.0.1:5432 (or use any Postgres / Neon)

cd backend
cp .env.example .env                 # fill in the values, see SETUP.md
npm ci
npm run dev                          # http://localhost:4000, applies migrations on start

cd ../frontend
cp .env.example .env
npm ci
npm run dev                          # http://localhost:5173
```

First time? Follow **SETUP.md** (Supabase email template, SMTP, Neon, bucket).

## Scripts

| | backend | frontend |
|---|---|---|
| dev server | `npm run dev` | `npm run dev` |
| type-check | `npm run typecheck` | `npm run typecheck` |
| lint | `npm run lint` | `npm run lint` |
| tests | `npm test` (needs Postgres, see below) | `npm test` |
| build | `npm run build` then `npm start` | `npm run build` |
| migrations | `npm run migrate` | |

Backend tests create their own schema in `TEST_DATABASE_URL` (default `postgres://chatz:chatz@127.0.0.1:5432/chatz_test`) and **drop everything in it** each run, so never point it at a real database. Supabase is replaced by a fake that signs tokens with a throwaway key, and storage by an in-memory fake.

## Project layout

```text
shared/      types and constants used by both sides (no runtime code)
backend/
  migrations/  plain SQL, applied in order, tracked in schema_migrations
  src/         config, db, auth (token check, OTP proxy), routes, services, socket
  tests/       integration tests (67)
frontend/src/
  components/  Logo, Avatar, Modal, Menu, OtpInput, ui kit
  features/    auth, onboarding, chat, friends, settings, shell
  lib/ stores/
```

## Security notes

- Every REST route and the socket require a valid Supabase token (issuer, audience, expiry, algorithm checked). Sockets also check the browser `Origin`.
- All input is validated with zod; all SQL is parameterised; message text is stored as plain text and rendered as text (never as HTML).
- Rate limits: per IP on sign-in routes, per email/username for codes, per user for search, requests, uploads, and per socket for events.
- Login answers the same whether or not an account exists. Usernames can be searched; emails are never shown to other users.
- Uploads are identified by content (not the file name or type the browser claims), images are re-encoded, executables are refused, files are served with `nosniff` and a sandboxing CSP, and non-media files always download.
- Chat file links are signed and expire (6 to 12 hours); avatars are public by design.
- `helmet`, strict CORS list, JSON body limit, request logging with secrets redacted.

## Known limits

See `FEATURES_STATUS.md` for what is not built (group chats, voice/video calls, push notifications, Hindi UI, link previews). The API keeps presence in memory, so run a **single instance** until a Redis adapter is added.
