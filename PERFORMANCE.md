# Performance

Measured in the build environment: Node 22, PostgreSQL 16 on the same machine. A real network (Neon, Supabase) adds latency to every call; these numbers show the code's own cost.

## API (local database)

| Operation | p50 | p95 |
|---|---|---|
| Send a message (acknowledged, sequential, n=300) | 2.0 ms | 5.4 ms |
| 100 sends at the same time | all done in 205 ms | 201 ms |
| Load the latest 40 messages (400 stored, n=100) | 3.2 ms | 7.5 ms |
| Conversation list (n=100) | 2.3 ms | 6.4 ms |

Why: one transaction per send, indexed keyset paging, token verification with cached public keys (no network call per request), presence kept in memory, unread counters updated in the same statement.

## Web bundle (production build, gzip)

| Chunk | Size | Loaded |
|---|---|---|
| React + router | 96 KB | always |
| App entry | 43 KB | always |
| Motion (animations) | 36 KB | always |
| Supabase auth client | 23 KB | always |
| Sign-in page | 5 KB | sign-in only |
| Socket.IO client | 13 KB | after sign-in |
| App shell + chat list | 11 KB | after sign-in |
| Chat screen | 19 KB | when a chat opens |
| Settings, Friends, Onboarding | 10 KB, 4 KB, 3 KB | on demand |
| QR code generator | 9 KB | when the connect code card opens |
| CSS | 9 KB | always |
| Fonts (self-hosted, 3 variable families, Latin) | about 90 KB | cached; extra Latin ranges only when a character needs them |

The sign-in screen loads about 205 KB of JavaScript (gzip). The plan's target was 120 KB; the gap is React Router and the animation library. Replacing the full Supabase SDK with its small auth client already saved 33 KB.

Other speed choices: lazy routes, `LazyMotion` (only the animation features used), images re-encoded to WebP at 1920 px max and avatars at 384 px, long browser caching for avatars, signed file URLs that stay stable for hours so files cache, video range requests, optimistic sending, socket events that patch the cache instead of refetching.

Not measured: real-device Lighthouse scores, mobile network behaviour, Neon cold starts.
