# Changelog

## 2.0.0

Rebuild of the whole app.

- New backend on PostgreSQL (replaces MongoDB and Redis) with Supabase email-code sign-in (replaces passwords and cookies)
- Friend requests, blocking, user search, connect code with QR
- Photos, videos and files in S3-compatible object storage
- Reply, edit, delete, reactions, search, read receipts, pin/mute/archive
- New design (Vintage Charm palette), light and dark themes, animations, new logo and fonts
- Settings, privacy controls, keyboard shortcuts
- 67 backend and 35 frontend tests, CI workflow
- Everything in `ISSUES.md` addressed, see `ISSUES_STATUS.md`
