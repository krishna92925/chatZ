# Status of every item in ISSUES.md

✅ fixed · ◐ partly fixed (reason given) · ➖ no longer applies

Code was verified with 67 backend integration tests (local Postgres) and 35 frontend tests, plus type-check, lint and production builds. **Nothing in this list was checked in a real browser or against the real Supabase/Neon services** (not reachable from the build environment), so items marked "UI" still deserve a click-through.

| ID | Status | How |
|---|---|---|
| S-01 NoSQL injection | ✅ | MongoDB removed. Parameterised SQL, zod on every payload (HTTP and socket). Tested. |
| S-02 no consent, weak codes | ✅ | Friend requests with accept/decline, 10-character random code, rate limits. "Everyone can message me" is an opt-in setting. |
| S-03 WebSocket hijack | ✅ | Token in the handshake (no cookies) plus Origin check. Tested. |
| S-04 no rate limiting | ✅ | IP + per-identifier limits on sign-in, per-user on search/requests/uploads, per-socket on events. |
| S-05 weak env checks | ✅ | zod-validated config, fails fast; `FILE_URL_SECRET` 32+ chars; `CLIENT_ORIGIN` required. |
| S-06 logout does not revoke | ✅ | Supabase sessions, "Sign out everywhere" (global sign-out). |
| S-07 small auth issues | ✅ | No passwords. `helmet`. Algorithms pinned in token check. Same answer for unknown accounts. |
| B-01 messages lost on switching chats | ✅ | One global socket hub updates every cached chat; refetch after reconnect. Unit tested. |
| B-02 socket gives up | ✅ | Unlimited reconnect with backoff, fresh token each attempt, resync on reconnect. UI |
| B-03 typing indicator | ✅ | Per conversation, 6 s expiry, cleared on send/blur/unmount. Server ignores non-members. Tested. |
| B-04 stale header status | ✅ | Open chat comes from the URL; header reads the live list. UI |
| B-05 unread race | ✅ | Increment inside the send transaction. 25 concurrent sends counted exactly. Tested. |
| B-06 noisy mark-read / no receipts | ✅ | Marked read only when the tab is visible and focused; pointer-based receipts; reciprocal privacy. Tested. |
| B-07 Redis down = offline | ➖ | Redis removed; presence is in memory. |
| B-08 handlers after await | ✅ | Handlers registered before any async work. |
| B-09 forced scroll | ✅ | Scrolls only when you are near the bottom; "jump to latest" button. UI |
| B-10 presence/scaling | ◐ | Online toasts removed. Redis adapter **not** built: run one API instance. |
| C-01 list not sorted | ✅ | Pinned first, then latest activity, on server and client. Tested. |
| C-02 cursor skips messages | ✅ | Keyset paging on a unique sequence number. Tested. |
| C-03 no validation | ✅ | zod everywhere; server derives the recipient. Tested. |
| C-04 dangerous seed | ✅ | Seed script deleted. No fake data anywhere. |
| C-05 user model gaps | ✅ | `profiles` table with constraints and unique indexes. |
| C-06 connect-code generator | ✅ | Random 10 characters, unique index, retry on clash. |
| C-07 friendship consistency | ✅ | Unique sorted pair, one transaction on accept, unfriend and block. Race tested. |
| C-08 redundant indexes | ✅ | New schema. |
| C-09 server hygiene | ✅ | Error and 404 handlers, `/health`, graceful shutdown, pino logs. |
| C-10 too many queries per send | ✅ | One transaction. Median 2 ms locally. |
| D-01 no chat on mobile | ✅ | Route-based list/chat screens, back button, bottom tabs. UI |
| D-02 previous user's chat leaks | ✅ | Sign-out clears caches, stores, drafts and the socket. UI |
| D-03 draft carries over | ✅ | Drafts per conversation; composer remounts per chat. |
| D-04 Enter / newlines / overflow | ✅ | Enter sends (Shift+Enter newline; touch devices use the button), text wraps. Tested. |
| D-05 poor add-friend errors | ✅ | Server messages shown. |
| D-06 no 401 handling | ✅ | Refresh once, else sign out. |
| D-07 auth page details | ✅ | New screens, login first, rules shared with the server. |
| D-08 accessibility | ◐ | Labels linked, dialogs trap focus and close with Esc, aria roles, reduced motion. Not tested with a screen reader. |
| D-09 two sources of truth | ✅ | Session from Supabase, profile from one query. Nothing user-related in localStorage. |
| D-10 small logic issues | ✅ | Search by name and username, one time format, initials avatars. |
| E-01 missing Tailwind classes | ✅ | Real theme tokens. |
| E-02 class typos | ✅ | Components rewritten. |
| E-03 layout heights | ✅ | `h-dvh` shell. UI |
| E-04 invisible timestamp | ✅ | Token colours; contrast tested. |
| E-05 dead UI | ✅ | Settings page, working menus, copy/share code, real presence. |
| F-01 node_modules / .env tracked | ✅ | Untracked, `.env.example` files added. |
| F-02 third-party cookies | ✅ | No cookies. |
| F-03 leftover names/files | ✅ | Renamed, template files removed, READMEs rewritten. |
| F-04 open docker ports | ◐ | Compose binds to 127.0.0.1 (dev password). A backend Dockerfile exists but was not built here (no Docker available). |
| F-05 no tests/CI/lint | ◐ | Tests, ESLint (both apps), GitHub Actions. Prettier and Husky not added. |
