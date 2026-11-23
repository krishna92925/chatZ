# chatZ v2 — Plan and Task List

Everything you asked for in one plan: redesign with the Vintage Charm palette, fixes from `ISSUES.md`, features from `NEW_FEATURES.md`, Supabase email-OTP login with username, onboarding and profile, Neon database, logo, animations, fonts, icons, speed, git commits and a final zip.

**Nothing is built yet.** When you send the Neon key and say **start**, I begin at Phase 0 and go phase by phase, one git commit group per phase.

---

## 1. Your requests → where they are handled

| You asked | Handled in |
|---|---|
| Use the colours from the palette (bcabae, 0f0f0f, 2d2e2e, 716969, fbfbfb) | §5 Design system, Phase 4 |
| Frontend redesign + login redesign | §5, Phase 2 (login), Phase 4 (app) |
| Fix all issues from ISSUES.md | §9 mapping, every phase |
| Commit the work | §12 Git workflow |
| Final zip | Phase 12 |
| Animations, new fonts, new icons | §5.3, §5.4, §5.6 |
| Logo as SVG code | §5.5, Phase 4 |
| Make it faster | §10 Performance, Phase 12 |
| Add the new features, all working, no fake data | §9b mapping, Phases 5 to 10 |
| Supabase in login | §6, Phase 2 |
| Real user name + OTP by email | §6, Phase 2 |
| Onboarding and user profile creation | Phase 3 |
| Neon database (key coming later) | §4, Phase 1 |
| This plan with every detail | this file |

---

## 2. Decisions and assumptions (tell me if any is wrong)

| # | Decision | Why |
|---|---|---|
| D-1 | **Neon Postgres replaces MongoDB completely.** You said the Neon database is for the project, so I assume it is the main database. | One database, relational data fits chat well (friendships, members, receipts, reactions, search). |
| D-2 | **Supabase is used only for Auth** (email OTP) and **file storage** (avatars, images, voice notes). Supabase's own Postgres is not used for app data. | Matches what you gave me (URL + publishable key) and keeps data in Neon. |
| D-3 | Backend and socket authenticate with the **Supabase access token** (sent as `Authorization: Bearer` and in the socket handshake `auth.token`), **not the old cookie**. | Removes the cookie problems (ISSUES F-02, S-03), works on Safari/iOS, simple deployment. |
| D-4 | Login is **email OTP only**. No passwords anywhere. You can type **email or username** on the login screen. | You asked for username + OTP. Passwords are removed, so "forgot password" is not needed. |
| D-5 | New code goes on a git branch `v2` (not straight on `main`). | Safe; you merge when happy. |
| D-6 | No dev seed data. The old `seedData.js` is deleted. Every list in the UI comes from the API; empty screens show real empty states. | "No fake data". |
| D-7 | Env names change for Vite: your `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` become `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` (the `NEXT_PUBLIC_` prefix only works in Next.js). | The frontend is Vite. |
| D-8 | The publishable key is safe in the browser by design. Still, it goes in `.env` / Netlify settings, never hard-coded and never committed. | Hygiene (ISSUES F-01). |
| D-9 | Not planned unless you insist: **end-to-end encryption** (N-45; breaks search and multi-device), **Google login** (N-25; needs your Google Cloud keys). Voice/video calls (N-15) are an optional last phase. | See §9b. |

---

## 3. Things only you can do (I cannot do these from here)

### 3.1 Supabase dashboard (needed for OTP to work for real users)
1. **Authentication → Providers → Email:** enabled. Keep email confirmation on.
2. **Authentication → Email Templates:** edit **both** "Confirm signup" and "Magic Link" so the mail shows the code `{{ .Token }}` (6 digits) instead of only a link. New users get the first template, returning users the second.
3. **Authentication → SMTP Settings: set a custom SMTP** (Resend, Brevo, Gmail app password, etc.). Supabase's built-in mail is for testing only: very low hourly limit and on new projects it may deliver only to your own team's addresses. **Without custom SMTP real users will not receive OTPs.**
4. **Authentication → Rate limits / settings:** OTP length 6, expiry 10 min (600 s), resend cooldown 60 s.
5. **Authentication → URL Configuration:** Site URL = your Netlify URL; add `http://localhost:5173` as an extra redirect URL.
6. **Authentication → JWT Keys:** tell me whether the project uses the new asymmetric signing keys or the legacy JWT secret. I verify tokens both ways (JWKS preferred); for legacy I will ask you for the secret and keep it only in the backend `.env`.
7. **Storage:** I will give you a ready SQL snippet that creates the `avatars` and `attachments` buckets and their policies (Phase 3).

### 3.2 Neon
- Create the project and send me the **pooled** connection string (and the direct one if you have it). I put it in `backend/.env` only.
- Neon free databases go to sleep after idle time; the first query after sleep can take a second or two. I add retry logic so this does not show up as an error.

### 3.3 Hosting (later, for going live)
- Frontend: Netlify (already configured). Backend: any host with WebSocket support (Render, Railway, Fly.io). Redis is optional (see §4); Upstash has a free tier.
- You must set the env vars from §11 on both hosts.

> Security note: you pasted keys in chat. The Supabase publishable key is public by design. The Neon URL contains a password, so after the project is deployed it is a good idea to rotate that password in the Neon dashboard.

---

## 4. Target architecture

```text
Browser (React + Vite, Netlify)
  |  1. Supabase JS: email OTP login  ---------->  Supabase Auth (+ Storage for files)
  |  2. access token (JWT, refreshed automatically)
  |
  |-- REST   Authorization: Bearer <token>  --+
  |-- Socket.IO   auth: { token }  -----------+--> Express + Socket.IO (Node)
                                                    |  verify token (JWKS, cached)
                                                    |  zod validation, rate limits, logger
                                                    +--> Neon Postgres (Drizzle ORM)   <- all app data
                                                    +--> Redis (optional): presence + socket adapter
                                                         fallback: in-memory presence for single instance
```

Key points
- **ORM:** Drizzle + `pg` pool (`max` about 10), SQL migrations committed in `backend/drizzle/`.
- **Redis is optional:** if `REDIS_URL` is set, presence and the Socket.IO adapter use it; if not, in-memory presence is used so the app runs with zero extra services.
- **Files:** uploaded straight from the browser to Supabase Storage using the user's session; the message stores only the URL and metadata.
- **Attachment privacy trade-off:** without the Supabase service key, the `attachments` bucket is public with unguessable UUID paths. If you later give me the service key (server only) I can switch to a private bucket with signed URLs. Avatars are public by nature.
- **Account deletion:** I can delete all the user's data in Neon. Deleting the Supabase auth user itself also needs the service key; until then deletion signs the user out and anonymizes the profile. I will tell you exactly what remains.

---

## 5. Design system — "Vintage Charm"

### 5.1 Palette (from your Coolors link)

| Name | Hex | Role |
|---|---|---|
| Ink | `#0F0F0F` | dark background, text on light surfaces |
| Graphite | `#2D2E2E` | dark surfaces: sidebar, panels, received bubbles, inputs |
| Taupe | `#716969` | borders, icons, disabled, muted text on light mode |
| Mauve | `#BCABAE` | the one accent: primary buttons, my bubbles, active states, links |
| Paper | `#FBFBFB` | main text on dark, background in light mode |

Contrast measured (WCAG, need 4.5 for body text, 3 for large text/icons):

| Pair | Ratio | Use |
|---|---|---|
| Paper on Ink | 18.5 | body text dark mode ✅ |
| Paper on Graphite | 13.2 | text on panels ✅ |
| Mauve on Ink | 8.7 | accent text/icons on dark ✅ |
| Mauve on Graphite | 6.2 | accent on panels ✅ |
| Ink on Mauve | 8.7 | text on primary buttons and my bubbles ✅ |
| Taupe on Paper | 5.2 | muted text in light mode ✅ |
| Taupe on Ink | 3.6 | borders, icons, large text only ⚠️ not small text |
| Taupe on Graphite | 2.5 | borders only ❌ not text |
| Mauve on Paper | 2.1 | decoration only ❌ (never text on light mode) |

Rules that follow from this
- Dark mode muted text = Paper at about 60% opacity (about 7 to 8:1), not Taupe.
- Light mode: Paper background, Ink text, Taupe muted text, Mauve only as fill (buttons, my bubbles) with Ink text on top.
- Extra tints (hover, pressed, selected, subtle fills) are **derived from the five colours with `color-mix()`**, no new hues.
- Only exception: tiny **status colours** that the palette has no answer for: online dot (soft sage), error/destructive (muted rose), both desaturated so they sit inside the mood.

### 5.2 Direction (design plan, reviewed against the brief)
- **Subject:** a private 1-to-1 and group messenger for friends. Primary job: write and read fast, feel calm and personal.
- **Mood:** dim lounge, old photo prints, dusty rose paper. Quiet, soft, a little nostalgic. Not neon, not corporate.
- **The one memorable thing:** the **bubble shape and the logo**. Message bubbles have an asymmetric corner (large radius with one tight corner on the sender's side) that echoes the logo's speech-bubble tail. Everything else stays disciplined.
- **Review against defaults** (checked on purpose): near-black plus one accent is a common look, but the palette is fixed by your brief, so the accent is the muted Mauve (not acid green/orange) and the surfaces are graphite, not pure black. Avoided: all-caps eyebrow labels, one highlighted word in a headline, numbered markers, "→" on buttons, identical rounded-card grids, gradient washes, fade-up on every section.

### 5.3 Typography
- **Display / wordmark / headings:** **Fraunces** (variable serif with soft, slightly quirky curves; carries the vintage mood).
- **Interface and messages:** **Instrument Sans** (clean, slightly condensed, very readable at small sizes).
- **Codes only (OTP boxes, connect code):** **Geist Mono**. Used only where the content really is a code.
- Self-hosted through `@fontsource-variable/*` (no Google request, faster, works offline), `font-display: swap`, only Latin + Devanagari subset if Hindi UI is on (Phase 9).
- Scale (1.2 ratio): 12 / 14 / 16 / 19 / 23 / 28 / 34 / 48. Body 15 to 16 px, sans line-height 1.45, serif headings 1.15. Message line length capped at about 65 characters.
- Sentence case everywhere. Buttons say what happens: "Send code", "Verify and continue", "Save profile".

### 5.4 Icons
- Replace `lucide-react` with **Phosphor Icons** (`@phosphor-icons/react`): regular weight for navigation, bold for active state, duotone for empty states. Consistent 20/24 px sizes, taupe default, mauve active.

### 5.5 Logo (made as SVG code)
- **Mark:** a rounded speech bubble in Mauve on Ink; the tail is cut so the empty space inside the bubble reads as a **Z**. Single path, works at 16 px.
- **Wordmark:** "chatZ" in Fraunces, the Z slightly larger and linked to the mark's shape.
- **Files I will create:** `logo-mark.svg`, `logo-wordmark.svg` (dark and light versions), `favicon.svg`, PWA icons 192/512 PNG (generated from the SVG with `sharp`), `og-image.png`.
- It is also a React component (`<Logo />`) so it can animate.

### 5.6 Motion (what, and what not)
Library: **`motion`** (framer-motion successor) with `LazyMotion` + `domAnimation` to keep the bundle small. `prefers-reduced-motion` turns all of it down to simple fades.
- **One orchestrated moment:** login screen intro. The bubble outline draws, the Z reveals, then the wordmark settles. About 1.2 s, once per visit.
- **Motion that answers an action:**
  - Message send: bubble springs in from the input; status tick animates sending → sent → read.
  - Incoming message: short slide + fade at the bottom (only when near bottom).
  - Conversation list: `layout` animation when a chat jumps to the top.
  - Typing indicator: three dots rising in sequence.
  - Modals/sheets: spring scale/slide; mobile bottom sheet drags to close.
  - Reactions: small pop; emoji picker opens with a quick scale.
  - OTP boxes: focus moves automatically, wrong code shakes once, success tick.
  - Route change between list and chat on mobile: horizontal slide like a native app.
  - Skeleton shimmer while loading (CSS only).
- **Not doing:** hover wobble on everything, parallax, scroll-triggered entrances.

### 5.6b Layout (ASCII wireframes)

Desktop (≥1024 px)
```text
+------+-----------------------+-----------------------------------+--------------+
| rail |  Chats        [+ add] |  <avatar> Name        online  ⌕ ⋮ |  Info panel  |
|      |  [ search          ]  |-----------------------------------|  (optional)  |
| chat |  ● Aarav   hey…  5:40 |        (date separator)           |  profile     |
| frnd |  ○ Mira   ok     Tue  |   them: message                   |  shared      |
| set  |  ...                  |                      me: message ✓✓|  media       |
|      |                       |  Aarav is typing…                 |  search      |
| me   |                       |  [ + ] [ message…        ] [send] |              |
+------+-----------------------+-----------------------------------+--------------+
```
Tablet (640–1023): rail + list + chat, info panel as overlay.
Mobile (<640): one screen at a time with route `/chats/:id`, bottom tab bar (Chats, Friends, Settings), chat has back arrow; input pinned above the keyboard (`dvh`, safe-area insets).

Login
```text
+--------------------------------------------------+
|  [animated logo]                                 |
|  Sign in to chatZ                                |
|  Email or username  [______________________]     |
|  [ Send code ]                                   |
|  New here? Create an account                     |
+--------------------------------------------------+
   next step: 6 mono boxes, "Resend in 0:42", "Use a different email"
```
Left-aligned content, single centered column (max 400 px) on a dark Ink page with a faint Graphite panel; no illustration stock images.

---

## 6. Auth design: username + email OTP with Supabase

### 6.1 Flows
**Sign up**
1. User enters **email + username** (live check "available / taken", rules: 3 to 20 chars, lowercase letters, numbers, underscore, not reserved like `admin`).
2. `Send code` → Supabase emails a 6-digit code (username is stored in the user's metadata).
3. User enters the code → session created.
4. App sees "profile not finished" → **Onboarding** (Phase 3).

**Log in**
1. User types **email or username**.
2. `Send code` → code emailed. For a username the **server** looks up the email and triggers the OTP, so the email is never shown to the client (the screen only shows a masked address like `k•••@g•••.com`). Same message whether or not the account exists (no account enumeration).
3. Code verified → session → straight to the app (or onboarding if unfinished).

**Session**
- Supabase JS keeps the session and refreshes the access token automatically. The app reads the token for REST and for the socket; when it refreshes, the socket reconnects with the new token.
- Sign out: Supabase `signOut()` plus clearing React Query cache, stores and the socket (fixes ISSUES D-02).
- 401 from the API → refresh once, then redirect to login (fixes ISSUES D-06).

### 6.2 Backend endpoints for auth
| Endpoint | Purpose |
|---|---|
| `GET /api/auth/username-available?u=` | live username check, rate-limited |
| `POST /api/auth/otp/start` | body `{ identifier, mode: "login" or "signup", username? }`; resolves username → email, calls Supabase, returns masked email + cooldown |
| `POST /api/auth/otp/verify` | body `{ identifier, code }`; verifies with Supabase and returns the session, which the client sets with `supabase.auth.setSession` |
| `GET /api/me` | current profile (and `onboarded` flag) |

Why the server proxies OTP: it lets the login screen accept a username without exposing anyone's email. Standard email-only login would work straight from the browser; the proxy is only for username support. Both use the same Supabase OTP underneath.

### 6.3 Token verification on the server
- Use `jose` to verify the Supabase JWT with the project's **JWKS** (cached, no network call per request); pin algorithms; check `iss`, `aud`, `exp`.
- Legacy-secret projects: verify HS256 with `SUPABASE_JWT_SECRET`.
- The server trusts `sub` (user id) from the token, never an id sent by the client.

### 6.4 Things that cannot be tested from my sandbox
My sandbox can reach npm and GitHub but **not** `supabase.co` or `neon.tech`. So:
- I test everything else against a **local Postgres** and a **fake Supabase** (I generate a test key pair and sign test tokens, exactly like Supabase would).
- **The real OTP email and the real Neon connection must be tested by you** with a short checklist I will put in `SETUP.md`. I will say plainly which checks I could and could not run.

---

## 7. Database schema (Neon Postgres, Drizzle)

Built so groups work later without a rewrite: a conversation has **members**, not "two participants".

| Table | Main columns | Notes |
|---|---|---|
| `profiles` | `id uuid PK` (= Supabase user id), `username citext unique`, `full_name`, `bio`, `avatar_url`, `connect_code unique`, `onboarded bool`, `last_seen_at`, `settings jsonb` (theme, language, privacy, notifications, sounds), `created_at`, `updated_at` | one row per user, created at onboarding |
| `friendships` | `id`, `user_low`, `user_high` (sorted pair), `requested_by`, `status` (pending / accepted / declined), `created_at`, `responded_at` | unique `(user_low, user_high)`; fixes the A↔B race |
| `blocks` | `blocker_id`, `blocked_id`, `created_at` | PK `(blocker_id, blocked_id)` |
| `conversations` | `id uuid`, `type` (direct / group), `name`, `avatar_url`, `created_by`, `direct_key unique null` (sorted pair for direct chats), `last_message_id`, `last_message_at`, `created_at` | `direct_key` guarantees one direct chat per pair |
| `conversation_members` | `conversation_id`, `user_id`, `role` (member / admin), `last_read_message_id`, `unread_count int`, `muted`, `pinned`, `archived`, `joined_at` | PK `(conversation_id, user_id)`; index `(user_id, archived, pinned)` |
| `messages` | `id uuid v7` (time-ordered), `conversation_id`, `sender_id`, `type` (text / image / file / voice / system), `body`, `attachments jsonb`, `reply_to_id`, `client_id` (idempotency), `edited_at`, `deleted_at`, `deleted_for_everyone bool`, `search tsvector` (generated), `created_at` | indexes: `(conversation_id, id desc)` for keyset paging, GIN on `search`, unique `(sender_id, client_id)` |
| `message_deletions` | `message_id`, `user_id` | "delete for me" |
| `reactions` | `message_id`, `user_id`, `emoji`, `created_at` | PK `(message_id, user_id, emoji)` |
| `push_subscriptions` | `id`, `user_id`, `endpoint unique`, `p256dh`, `auth`, `user_agent`, `created_at` | web push |
| `reports` | `id`, `reporter_id`, `reported_id`, `message_id null`, `reason`, `created_at` | basic moderation |

Rules
- **Read receipts** come from `last_read_message_id` per member (no per-message boolean to update); a message is "read" when the other member's pointer is at or past it.
- **Unread** is updated **atomically** in the same transaction as the insert (`unread_count = unread_count + 1`), fixing the race in ISSUES B-05.
- **Pagination** is keyset on message id (fixes ISSUES C-02).
- **Send message = one transaction:** check membership + block → insert message (idempotent on `client_id`) → update `conversations.last_*` → bump other members' unread. Then emit.
- Retry wrapper for Neon wake-up errors; pool error handler so one bad connection cannot crash the server.
- All SQL through Drizzle (parameterized) so injection like ISSUES S-01 is not possible.

---

## 8. API and socket contract

### REST (all validated with zod, rate-limited, `Authorization: Bearer`)
| Area | Endpoints |
|---|---|
| Health | `GET /health` (checks DB, Redis if enabled) |
| Auth | see §6.2 |
| Me | `GET/PATCH /api/me`, `POST /api/me/onboarding`, `POST /api/me/connect-code/regenerate`, `PATCH /api/me/settings`, `DELETE /api/me` |
| Users | `GET /api/users/by-code/:code` (preview card), `GET /api/users/search?q=` |
| Friends | `GET /api/friends`, `GET /api/friends/requests`, `POST /api/friends/requests` (by code or username), `POST /api/friends/requests/:id/accept` / `decline`, `DELETE /api/friends/:id`, `POST/DELETE /api/blocks/:userId` |
| Conversations | `GET /api/conversations` (sorted by last activity), `PATCH /api/conversations/:id` (pin / mute / archive), groups: `POST`, members add/remove/role |
| Messages | `GET /api/conversations/:id/messages?before=<id>`, `GET /api/messages/search?q=&conversationId=` |
| Push | `POST/DELETE /api/push/subscription` |
| Reports | `POST /api/reports` |

### Socket events (every client event has an **ack** with `{ ok, data | error }`)
Client → server: `message:send`, `message:edit`, `message:delete`, `reaction:toggle`, `conversation:read`, `typing`.
Server → client: `message:new`, `message:updated`, `message:deleted`, `reaction:updated`, `receipt:updated`, `conversation:updated`, `typing`, `presence:update`, `friend:request`, `friend:accepted`, `friend:removed`.
Rules: handlers registered **synchronously** on connect (fixes ISSUES B-08); payloads zod-validated (S-01, C-03); per-socket rate limit; socket `Origin` check; token re-check on reconnect.

---

## 9. Issues → how each one is fixed

| Issue | Fix | Phase |
|---|---|---|
| S-01 NoSQL injection | Postgres + Drizzle parameterized queries + zod on every payload | 1, 5 |
| S-02 no consent / weak codes | friend requests with accept/decline, 10-char random connect code, rate limits | 6 |
| S-03 cross-site WebSocket hijack | token in handshake (not cookie) + Origin check | 2, 5 |
| S-04 no rate limiting | `express-rate-limit` + per-socket limiter | 1 |
| S-05 weak env checks | zod-validated config at boot, secret length check, CORS must be set | 1 |
| S-06 logout does not revoke | Supabase sessions (short access token, refresh revoked on sign-out) | 2 |
| S-07 small auth issues | no passwords left; `helmet`; algorithms pinned (`jose`) | 1, 2 |
| B-01 messages lost for other chats | one global socket listener updates every conversation cache | 5 |
| B-02 socket gives up / no resync | unlimited reconnect with backoff; on reconnect refetch lists and open chat | 5 |
| B-03 typing indicator bugs | per-conversation state keyed by user, 5 s timeout, clear on switch/disconnect | 5 |
| B-04 stale header status | selected chat = id in the URL; data always read from live cache | 4, 5 |
| B-05 unread race | atomic SQL increment inside the send transaction | 1, 5 |
| B-06 noisy mark-as-read | send only when tab visible and last message is from the other person; pointer-based receipts | 5 |
| B-07 Redis down = offline | optional Redis with in-memory fallback + circuit breaker | 1 |
| B-08 handlers after await | register first, async work after | 5 |
| B-09 forced scroll | scroll only when near bottom, else "new messages" pill | 5 |
| B-10 presence/scaling | Redis adapter when `REDIS_URL` set, no online toasts (presence shown in UI) | 5, 11 |
| C-01 list not sorted | `ORDER BY last_message_at desc`, animated reorder | 5 |
| C-02 cursor skips messages | keyset on message id | 5 |
| C-03 no validation | zod, server derives the other member from the conversation | 5 |
| C-04 dangerous seed | seed script deleted | 0 |
| C-05 user model gaps | new `profiles` table with constraints | 1 |
| C-06 connect-code generator | random 10 chars, unique index, retry on conflict | 3 |
| C-07 friendship/conversation consistency | one transaction creates both on accept; unfriend/block exist | 6 |
| C-08 redundant indexes | designed fresh | 1 |
| C-09 server hygiene | error/404 handlers, `/health`, graceful shutdown, pino logger | 1 |
| C-10 too many DB calls per send | single transaction | 5 |
| D-01 no chat on mobile | route-based mobile layout | 4 |
| D-02 previous user's chat leaks | full reset on sign-out | 2 |
| D-03 draft carries over | per-conversation drafts (even saved while you switch) | 5 |
| D-04 Enter / newline / overflow | Enter sends, Shift+Enter newline, `whitespace-pre-wrap`, `break-words` | 5 |
| D-05 bad add-friend errors | typed error codes → clear messages | 6 |
| D-06 no 401 handling | Supabase refresh + interceptor + redirect | 2 |
| D-07 auth page details | new auth screens, login first | 2 |
| D-08 accessibility | labels, focus trap, Esc, aria, keyboard shortcuts | 4, 11 |
| D-09 two sources of truth | session from Supabase, profile from React Query only | 2 |
| D-10 small logic issues | search by name + username, consistent times ("Today", "Yesterday"), initials avatars | 4, 5 |
| E-01 missing Tailwind classes | real `@theme` tokens | 4 |
| E-02 class typos | components rewritten | 4 |
| E-03 layout heights | `h-dvh` app shell | 4 |
| E-04 invisible timestamp | token-based colours with contrast tests | 4 |
| E-05 dead UI / placeholders | Settings page, working menus, copy code, real "Online" | 4, 9 |
| F-01 node_modules / .env tracked | `git rm --cached`, `.env.example` files | 0 |
| F-02 third-party cookie problem | token auth, no cookies | 2 |
| F-03 leftover names/files | rename, delete template assets, real READMEs | 0, 12 |
| F-04 open docker ports | compose binds to 127.0.0.1, passwords set | 11 |
| F-05 no tests/CI | Vitest, Supertest, socket tests, GitHub Actions, Prettier | 11 |

### 9b. New features → where each lands

| ID | Feature | Phase | Note |
|---|---|---|---|
| N-01 | Optimistic send + status + retry | 5 | `client_id` makes retry safe |
| N-02 | Read receipts | 5 | pointer-based |
| N-03 | Enter to send, auto-grow textarea | 5 | |
| N-04 | Date separators, scroll-to-bottom pill | 5 | |
| N-05 | Edit and delete (me / everyone) | 7 | |
| N-06 | Reply to message | 7 | |
| N-07 | Emoji picker + reactions | 7 | lightweight picker, lazy-loaded |
| N-08 | Last seen | 5 | respects privacy setting |
| N-09 | Search (in chat + global) | 7 | Postgres full-text |
| N-10 | Image / file / voice notes | 7 | Supabase Storage, size and type limits, client-side image compression |
| N-11 | Link previews, formatting | 7 | previews fetched by server with SSRF protection; formatting is escaped, never raw HTML |
| N-12 | Dark / light mode | 9 | both from the five colours |
| N-13 | Pin / mute / archive, unread filter | 8 | |
| N-14 | Group chats | 10 | schema already ready |
| N-15 | Voice / video calls | 12 (optional) | WebRTC with public STUN; reliable calls behind strict NATs need a TURN server (paid/own) |
| N-16 | Friend request flow | 6 | |
| N-17 | Copy / share / QR connect code, regenerate | 6 | |
| N-18 | Block, unblock, unfriend | 6 | |
| N-19 | Privacy settings | 9 | |
| N-20 | Report user | 8 | |
| N-21 | Settings page | 9 | |
| N-22 | Avatar upload, name, bio | 3 | |
| N-23 | Delete account | 9 | see §4 for the Supabase-user caveat |
| N-24 | Forgot password / email verification | not needed | OTP replaces passwords and verifies the email |
| N-25 | Google login | not planned | needs your Google keys |
| N-26 | Sessions list / sign out everywhere | 9 | Supabase `signOut({ scope: 'global' })` |
| N-27 | Tab title / favicon badge / sound | 8 | |
| N-28 | Desktop notifications | 8 | |
| N-29 | PWA + Web Push | 8 | VAPID keys generated by me (free); only works on the HTTPS deployed site |
| N-30 | Route per conversation | 4 | |
| N-31 | Virtualized message list | 5 | |
| N-32 | Skeletons, empty states, offline banner | 4 | |
| N-33 | Hindi / English | 9 | |
| N-34 | Accessibility pass + shortcuts | 11 | |
| N-35 | Error boundary + 404 | 4 | |
| N-36 | Rate limit, helmet, zod | 1 | |
| N-37 | Error handler, logging, health, shutdown | 1 | |
| N-38 | Socket.IO Redis adapter | 5 | only active with `REDIS_URL` |
| N-39 | Tests | 11 | |
| N-40 | GitHub Actions CI | 11 | |
| N-41 | Dockerfiles + compose | 11 | |
| N-42 | OpenAPI docs, socket docs | 11 | |
| N-43 | Prettier, ESLint, Husky | 11 | |
| N-44 | Data retention / list pagination | 11 | |
| N-45 | End-to-end encryption | not planned | tell me if you really want it |

---

## 10. Performance plan ("make it faster")

Frontend
- [ ] Route-level code splitting (auth, onboarding, chat, settings, emoji picker, QR, image viewer all lazy).
- [ ] Budgets: auth screen about 120 KB gzipped JS or less, chat route under about 250 KB gzipped; checked with a bundle visualizer after every phase.
- [ ] `LazyMotion`, icon imports by name (tree-shaken), fonts self-hosted + preloaded + subset.
- [ ] Zustand selectors and `React.memo` so a typing event re-renders only the typing indicator, not the whole list.
- [ ] Virtualized message list; images with width/height, lazy loading and client-side compression before upload (max about 1600 px, WebP/JPEG).
- [ ] React Query tuned: sensible `staleTime`, cache updated by sockets (no refetch storms), prefetch the chat on hover/tap.
- [ ] Optimistic UI so sending feels instant.

Backend
- [ ] One transaction per send; keyset pagination; the right indexes (see §7).
- [ ] `compression`, gzip JSON, small payloads (ids + minimal fields).
- [ ] Token verification with cached JWKS (no network call per request).
- [ ] Connection pool tuning for Neon pooled endpoint, retry on wake-up.
- [ ] Presence cache; typing events never touch the database.

Targets I will measure and report in `PERFORMANCE.md`: bundle sizes, send-message server time on local Postgres, and Lighthouse-style notes where I can (see §13 for what I cannot measure).

---

## 11. Environment variables

`frontend/.env.example`
```text
VITE_API_URL=http://localhost:4000
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_VAPID_PUBLIC_KEY=
```

`backend/.env.example`
```text
NODE_ENV=development
PORT=4000
CLIENT_ORIGIN=http://localhost:5173
DATABASE_URL=            # Neon pooled connection string
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_JWT_SECRET=     # only if the project uses the legacy HS256 secret
REDIS_URL=               # optional
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:you@example.com
LOG_LEVEL=info
```

---

## 12. Phases and tasks

Git: branch `v2`, Conventional Commit messages, **at least one commit per phase** (several for big ones). Each phase ends with: type-check, lint, tests that exist so far, and a build. Phase done only when its "Done when" is true.

### Phase 0 — Repo cleanup and baseline
- [ ] Create branch `v2`; record baseline (`tsc`, `eslint`, build sizes)
- [ ] `git rm -r --cached backend/node_modules frontend/.env` and fix `.gitignore`
- [ ] Add `frontend/.env.example`, update `backend/.env.example` (§11)
- [ ] Delete template leftovers (`App.css`, `react.svg`, `vite.svg`, `hero.png` if unused, `icons.svg`, `explaination.txt`), remove `seedData.js`
- [ ] Rename project (`chatz-backend`, `chatz-frontend`), fix `main`, rename `conversatonStore`
- [ ] Use `.ts` for files without JSX
- Done when: repo is clean and still builds. Commits: `chore: untrack node_modules and env`, `chore: remove template files and seed script`.

### Phase 1 — Backend foundation (Neon, Drizzle, hardening)
- [ ] Install `drizzle-orm`, `drizzle-kit`, `pg`, `zod`, `pino`, `helmet`, `express-rate-limit`, `compression`, `jose`; remove `mongoose`
- [ ] Config module: zod-validated env, fails fast with a readable message
- [ ] DB module: pg pool, Neon retry wrapper, pool error handler
- [ ] Schema from §7 + first migration + `npm run db:migrate`, `db:generate`
- [ ] Express app: helmet, CORS from config, compression, JSON limit, request-id + pino logging, rate-limit presets, central error handler, 404, `/health`
- [ ] Graceful shutdown (HTTP, socket, pg pool, redis)
- [ ] Presence service: Redis when `REDIS_URL`, in-memory otherwise, circuit breaker
- [ ] Convert backend to TypeScript (`tsx` for dev, `tsc` build) so types are shared and checked
- Done when: server boots on local Postgres, `/health` OK, migrations apply, lint + tests for config/db pass. Commits: `feat(api): config, db and migrations`, `feat(api): security middleware and logging`.

### Phase 2 — Auth with Supabase (login redesign included)
Backend
- [ ] JWKS/HS256 token verifier (`jose`), `requireAuth` middleware, socket auth middleware with Origin check
- [ ] `/api/auth/*` endpoints from §6.2, tight rate limits per IP + per identifier, same response for existing/unknown accounts
- [ ] `/api/me` (returns `onboarded`)
Frontend
- [ ] Supabase client (`@supabase/supabase-js`), `AuthProvider`, session hooks, token getter for axios and socket
- [ ] Axios interceptor: attach token, refresh on 401 once, then sign out
- [ ] New auth screens: login, sign up (username availability), OTP verify (6 mono boxes, paste support, auto-submit, resend timer, error shake), clear error messages
- [ ] Route guards: guest / needs-onboarding / app
- [ ] Sign-out resets everything (query cache, stores, socket)
- [ ] Animated logo intro (placeholder SVG until Phase 4 final logo, then swapped)
- Done when (my side): tests with the fake Supabase pass: valid token OK, expired/forged/wrong-issuer rejected, username → email resolution, no account enumeration. Done when (your side): you run the `SETUP.md` checklist with real Supabase. Commits: `feat(auth): supabase token verification`, `feat(auth): otp login and signup screens`.

### Phase 3 — Onboarding and profile creation
- [ ] Onboarding wizard (3 short steps): name + username confirm, photo + bio, connect code reveal with copy button; progress is saved, can resume
- [ ] `POST /api/me/onboarding`: creates the profile row in a transaction, unique-constraint handling for username races
- [ ] Connect-code generator: 10 random characters, unique index, retry
- [ ] Avatar upload: client-side crop + compress, upload to Supabase `avatars` bucket (policy SQL in `SETUP.md`), fallback initials avatar
- [ ] `GET/PATCH /api/me`, validation, "Edit profile" screen
- Done when: a new user goes sign up → OTP → onboarding → empty chat screen, and a returning user skips onboarding. Commits: `feat(profile): onboarding and profile api`, `feat(profile): avatar upload`.

### Phase 4 — Design system, logo, app shell
- [ ] Tailwind `@theme` tokens from §5.1 (dark default + light), `color-mix` tints, status colours
- [ ] Fonts (§5.3) and Phosphor icons (§5.4) set up
- [ ] Final logo SVGs, `<Logo />` component, favicon, PWA icons, social image
- [ ] UI kit: Button, IconButton, Input, OtpInput, Avatar (initials), Badge, Modal/Sheet (focus trap, Esc, overlay close), Tooltip, Toast style (Sonner themed), Skeleton, EmptyState, Dropdown/Menu
- [ ] App shell: nav rail (desktop), bottom tabs (mobile), `h-dvh`, safe-area insets
- [ ] Routes: `/chats`, `/chats/:id`, `/friends`, `/settings/*`, 404 + error boundary
- [ ] Conversation list UI (search by name or username, unread badge, last message, time, online dot)
- [ ] Empty states with real guidance ("No chats yet. Share your connect code or add a friend.")
- [ ] Reduced-motion and keyboard focus styles
- Done when: the whole app is usable on 360 px and 1440 px screens with the new look; contrast tests pass for all token pairs. Commits: `feat(ui): design tokens, fonts, icons`, `feat(ui): logo and brand assets`, `feat(ui): app shell and conversation list`.

### Phase 5 — Chat core rewrite
- [ ] Socket service: connect with token, unlimited reconnect + backoff, token refresh reconnect, status banner ("Reconnecting…")
- [ ] One global socket event hub updating React Query caches for **all** conversations
- [ ] Backend socket handlers per §8 (sync registration, zod, ack, rate limit, transaction)
- [ ] Message list: keyset infinite scroll up, virtualized, scroll anchoring, "new messages" pill, date separators
- [ ] Composer: auto-grow, Enter/Shift+Enter, per-conversation drafts, disabled while offline
- [ ] Optimistic send with `client_id`, status (sending / sent / read / failed + retry)
- [ ] Read receipts (pointer-based), unread badges
- [ ] Typing indicator (per conversation, timeout), presence + last seen (respecting privacy)
- [ ] Conversation sorting, reorder animation
- [ ] Redis adapter wiring when `REDIS_URL` exists
- Done when: two browser tabs with two test users chat live; offline → reconnect shows no lost messages; integration tests for send/idempotency/unread/receipts pass. Commits: `feat(chat): socket hub and reconnect`, `feat(chat): transactional send and receipts`, `feat(chat): message list and composer`.

### Phase 6 — Friends, requests, blocking, connect code
- [ ] Friends screen: list, requests (incoming/outgoing), search
- [ ] Add by connect code or username → preview card ("Send request")
- [ ] Accept / decline creates the direct conversation in one transaction
- [ ] Block / unblock / unfriend with confirmation; blocked users cannot message or see presence
- [ ] My code card: copy, share link, QR code, regenerate
- [ ] Real-time events for request / accept / removed
- [ ] Specific error messages (already friends, request pending, blocked, invalid code)
- Done when: full request cycle works live between two users; tests cover races (simultaneous requests). Commits: `feat(friends): requests and blocking`, `feat(friends): connect code sharing`.

### Phase 7 — Message features
- [ ] Edit (with "edited"), delete for me / for everyone
- [ ] Reply with quote preview and jump-to-original
- [ ] Reactions (quick set + picker) with live updates
- [ ] Emoji picker (lazy-loaded)
- [ ] Search in chat and global (full-text) with highlighted results and jump
- [ ] Image sharing (preview, lightbox, compression), file sharing (size/type limits), voice notes (MediaRecorder, waveform, duration)
- [ ] Link detection + previews (server-side fetch with SSRF protection, timeout, size cap), safe text formatting
- Done when: each feature works between two users, with validation tests (size/type limits, permission to edit/delete only own messages). Commits per feature group.

### Phase 8 — Notifications, organisation and moderation
- [ ] Unread total in tab title + favicon badge; optional sounds
- [ ] Desktop notifications when the tab is hidden (permission flow with explanation)
- [ ] PWA: manifest, service worker, install prompt; Web Push with VAPID, subscription management, push only when user is offline
- [ ] Pin / mute / archive and "Unread" filter
- [ ] Report user / message
- Done when: notifications fire only when appropriate (muted chats stay silent, active chat doesn't notify). Commits: `feat(notify): ...`, `feat(chat): pin mute archive`.

### Phase 9 — Settings, privacy, language, account
- [ ] Settings layout (Profile, Appearance, Notifications, Privacy, Account, About)
- [ ] Theme: dark / light / system; remembered; no flash on load
- [ ] Privacy: hide online status, hide last seen, turn off read receipts (applied server-side)
- [ ] Language: English / Hindi (i18n files, locale-aware dates)
- [ ] Sessions: sign out here / everywhere
- [ ] Delete account (typed confirmation); data removal in Neon; Supabase-user caveat explained in the UI copy and in `SETUP.md`
- Done when: every settings control changes real behaviour (no placeholder toggles). Commits per section.

### Phase 10 — Group chats
- [ ] Create group (name, avatar, pick friends), member list, add/remove, admin roles, leave group
- [ ] System messages ("Mira added Aarav"), per-member read pointers, "seen by" in groups
- [ ] Typing / presence summaries for groups
- [ ] Permissions tests (only admins manage members)
- Done when: 3 test users chat in a group with correct unread and receipts. Commits: `feat(groups): ...`.

### Phase 11 — Quality, docs, DevOps
- [ ] Backend tests (Vitest + Supertest + socket.io-client) on local Postgres: auth, friends, send/unread/receipts, edit/delete permissions, rate limits, validation
- [ ] Frontend tests (Vitest + React Testing Library): OTP input, composer, message list logic, route guards, contrast tokens
- [ ] GitHub Actions CI: lint, type-check, test, build for both apps
- [ ] Prettier, ESLint for backend, Husky + lint-staged
- [ ] Dockerfiles (backend, frontend), `docker-compose.yml` (Postgres + Redis, bound to 127.0.0.1) for local dev
- [ ] OpenAPI file + socket event docs; rewrite root README, frontend README, `SETUP.md`, `CHANGELOG.md`
- [ ] Accessibility pass (labels, focus order, aria-live for incoming messages, shortcuts such as Ctrl+K search, Esc to close)
- [ ] Data retention: paginated conversation list, cleanup job for orphaned uploads
- Done when: CI green locally (I run the same commands CI runs).

### Phase 12 — Final pass, release, zip
- [ ] Performance pass against §10; write `PERFORMANCE.md` with real numbers
- [ ] Final review of every ISSUES.md item (checklist in `ISSUES_STATUS.md`: fixed / n/a with reason)
- [ ] Final review of every feature in §9b (`FEATURES_STATUS.md`: done / not planned with reason)
- [ ] Optional: voice/video calls (N-15) only if you ask for it
- [ ] Clean install test: delete `node_modules`, `npm ci`, build, run tests
- [ ] **Final zip** `chatZ-v2.zip` (source + git history on branch `v2`, without `node_modules` and without any `.env`)
- [ ] Hand-over message: how to run locally, how to deploy, what you must still verify with real Supabase/Neon, exact `git push` commands (I cannot push to your GitHub from here)

---

## 13. How I will verify, and what I cannot

| Can verify here | Cannot verify here |
|---|---|
| Type-check, lint, build, bundle sizes | Real Supabase OTP email and real Neon connection (sandbox cannot reach those hosts) |
| Backend on local Postgres (+ optional local Redis): all API and socket flows, with two or three simulated users | How the UI **looks** and animates in a real browser (no screenshots available); you will review visuals and I will fix what you point out |
| Token verification with a fake Supabase key pair | Real-device notification and PWA install behaviour, push delivery |
| Unit/component tests, contrast calculations | Real-world Lighthouse scores, mobile keyboard behaviour |

For each phase my message will say: what I tested and passed, what I could not test, and what you should click through.

---

## 14. What I need from you before "start"

1. **Neon connection string** (pooled). Also say if Neon replaces MongoDB as in D-1.
2. Do the **Supabase dashboard steps** in §3.1 (at least templates and SMTP) when you can; I can start coding before that, but OTP mails will not arrive until it is done.
3. Tell me if the Supabase project uses **new signing keys or the legacy JWT secret**.
4. Optional: preferred display of the app name (chatZ vs ChatZ), and anything in §9b you want removed or added.

Then say **start**.
