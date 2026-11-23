# Status of every item in NEW_FEATURES.md

✅ built · ◐ partly · ✗ not built · ➖ not needed

| ID | Status | Note |
|---|---|---|
| N-01 optimistic send, status, retry | ✅ | sending → sent → read, failed with Retry/Discard, safe retry (idempotent) |
| N-02 read receipts | ✅ | pointer-based, reciprocal privacy |
| N-03 Enter to send, auto-grow | ✅ | |
| N-04 date separators, scroll-to-bottom | ◐ | no new-message counter on the button |
| N-05 edit, delete | ✅ | delete for me / for everyone (files removed from storage) |
| N-06 reply | ✅ | quote preview, tap to jump |
| N-07 emoji picker, reactions | ✅ | built-in picker, no extra library |
| N-08 last seen | ✅ | respects privacy settings |
| N-09 search | ✅ | in chat and across chats (Ctrl/⌘ K), substring match |
| N-10 images, files, voice | ◐ | photos, videos, files done; **voice notes not built**; images are compressed on the server, not before upload |
| N-11 link previews, formatting | ◐ | links are clickable and safe; no previews, no bold/italic |
| N-12 dark / light | ✅ | plus "match device" |
| N-13 pin, mute, archive, unread filter | ✅ | |
| N-14 group chats | ✗ | database is ready for it; no UI or group logic yet |
| N-15 voice/video calls | ✗ | |
| N-16 friend requests | ✅ | |
| N-17 copy/share code, QR, regenerate | ✅ | |
| N-18 block, unfriend | ✅ | |
| N-19 privacy settings | ✅ | online, last seen, read receipts, who can message |
| N-20 report user | ✗ | |
| N-21 settings page | ✅ | profile, appearance, notifications, privacy, shortcuts, account |
| N-22 avatar, name, bio | ✅ | |
| N-23 delete account | ✅ | the Supabase sign-in record stays (see SETUP.md) |
| N-24 forgot password / verification | ➖ | no passwords; the code verifies the email |
| N-25 Google login | ✗ | needs your Google credentials |
| N-26 sessions | ◐ | "Sign out everywhere"; no list of devices |
| N-27 tab title, sound | ◐ | unread count in the title and a ping; no favicon badge |
| N-28 desktop notifications | ✅ | only while the tab is in the background |
| N-29 PWA, push | ✗ | |
| N-30 route per conversation | ✅ | `/chats/:id`, deep links, back button |
| N-31 virtualized list | ✗ | pages of 40 load as you scroll up; fine for long chats, not virtualized |
| N-32 skeletons, empty states, offline banner | ✅ | |
| N-33 Hindi / English | ✗ | UI is English only |
| N-34 accessibility, shortcuts | ◐ | shortcuts done; accessibility not audited |
| N-35 error boundary, 404 | ✅ | |
| N-36 rate limits, helmet, zod | ✅ | |
| N-37 error handler, logging, health, shutdown | ✅ | |
| N-38 Socket.IO Redis adapter | ✗ | single API instance for now |
| N-39 tests | ✅ | 67 backend, 35 frontend |
| N-40 CI | ✅ | GitHub Actions workflow (not run here) |
| N-41 Docker | ◐ | `docker-compose.yml` for Postgres; backend Dockerfile untested |
| N-42 API docs | ◐ | endpoints and events listed in the plan and README; no OpenAPI file |
| N-43 Prettier, ESLint, Husky | ◐ | ESLint both apps; no Prettier/Husky |
| N-44 data retention | ◐ | unused uploads removed after 6 h; conversation list is not paginated |
| N-45 end-to-end encryption | ✗ | not planned |
