# chatZ — New Features To Add

These are things the project **does not have yet**. Bugs in existing code are in `ISSUES.md`.

**What chatZ already has (so we don't repeat it):** register/login (JWT cookie), connect-code friends, 1-to-1 chat, live messages, unread counts, typing indicator, online/offline via Redis, paginated history, conversation search.

**Priority:** P0 = do first · P1 = next · P2 = nice to have · P3 = stretch
**IDs** (N-01 ...) so you can say "add N-03, N-05".

---

## 0. Frontend Redesign (waiting for your colours)

You said you will share the colours. Until then nothing in the UI is changed.

What the redesign will cover:
- Theme tokens in `index.css` (`@theme`) so every colour comes from one place (this also fixes the missing `primary` / `dark` classes from ISSUES E-01)
- Mobile-first layout: list screen ↔ chat screen with back button (fixes D-01)
- Fixed-height app shell (`h-dvh`), proper scroll areas, pinned input bar
- New login / register page, sidebar, chat header, message bubbles, input bar, modal
- Empty states, loading skeletons, error states
- Light + dark mode (see N-12)

**Colours I need from you (fill in or just send hex codes):**

| Token | Used for | Your colour |
|---|---|---|
| Primary | buttons, my message bubble, links | |
| Primary hover | button hover | |
| Background | app background | |
| Surface | sidebar, cards, modal | |
| Friend's bubble | received messages | |
| Text main / muted | headings / secondary text | |
| Online dot / Error | presence / error toasts | |
| Dark mode (optional) | same tokens for dark | |

Also useful: any app you like the look of (WhatsApp, Telegram, Discord ...) and rounded vs sharp corners.

---

## 1. Chat experience

| ID | Priority | Feature | Notes |
|---|---|---|---|
| N-01 | P0 | **Optimistic sending + message status** (sending → sent → failed with retry) | Show the message instantly with a temp id; replace when server confirms. Use socket acknowledgement callbacks instead of separate `*:error` events. |
| N-02 | P0 | **Read receipts** (✓ sent, ✓✓ read) | `Message.read` already exists but is never updated; add `readAt` and a `message:read` event. |
| N-03 | P0 | **Enter to send, Shift+Enter for new line, auto-growing textarea** | Currently Enter does nothing. |
| N-04 | P1 | Date separators ("Today", "Yesterday") and "scroll to bottom" button with new-message counter | |
| N-05 | P1 | **Edit and delete message** (delete for me / for everyone, "message deleted" placeholder) | Soft delete: `deletedAt`, `editedAt` on Message. |
| N-06 | P1 | Reply to a message (quote) | `replyTo` reference on Message. |
| N-07 | P1 | Emoji picker + emoji reactions on messages | `reactions: [{user, emoji}]` on Message. |
| N-08 | P1 | **Last seen** ("last seen today 5:40 PM") | `lastSeenAt` on User, update on last socket disconnect. |
| N-09 | P1 | Search inside a conversation, and global message search | Mongo text index on `Message.content`. |
| N-10 | P2 | Image / file / voice-note sharing | Upload to Cloudinary or S3 (signed upload), size + type limits, image preview/lightbox. |
| N-11 | P2 | Link previews and basic formatting (bold, code, links clickable) | Sanitize on render; never use `dangerouslySetInnerHTML` on raw content. |
| N-12 | P1 | **Dark mode** + theme toggle (remember choice) | Uses the tokens from the redesign. |
| N-13 | P2 | Pin / mute / archive conversations, "unread only" filter | Per-user settings on Conversation. |
| N-14 | P3 | Group chats (name, avatar, admins, add/remove members) | Biggest model change: `Conversation.type`, `name`, `admins`; today the code assumes exactly 2 participants (`$size: 2`, `getChatRoom`). |
| N-15 | P3 | Voice / video calls (WebRTC) | Signalling through existing socket. |

## 2. Friends and privacy

| ID | Priority | Feature | Notes |
|---|---|---|---|
| N-16 | P0 | **Friend request flow** (send → pending → accept / reject) | Replaces auto-friend. Friendship needs `status`. Also fixes ISSUES S-02. |
| N-17 | P0 | **Copy / share connect code** button, QR code to share it, "regenerate my code" | The code is the core feature but only shows as plain text. |
| N-18 | P1 | Block / unblock and unfriend (remove conversation for both or hide it) | |
| N-19 | P1 | Privacy settings: hide online status, hide last seen, turn off read receipts | |
| N-20 | P2 | Report user / basic moderation tools | |

## 3. Account and profile

| ID | Priority | Feature | Notes |
|---|---|---|---|
| N-21 | P0 | **Settings page** (the Settings icon in the sidebar currently does nothing) | Sections: Profile, Appearance, Notifications, Privacy, Account. |
| N-22 | P1 | Profile: avatar upload, display name edit, bio, replace the hot-linked placeholder avatar with initials fallback | |
| N-23 | P1 | Change password, delete account (with confirmation) | Delete should also clean messages/friendships. |
| N-24 | P1 | **Forgot password / reset by email**, email verification | Nodemailer or a provider (Resend, SendGrid); signed one-time token with expiry. |
| N-25 | P2 | Google login (OAuth) | |
| N-26 | P2 | Active sessions list + "log out from all devices" | Needs refresh tokens / token versioning (ISSUES S-06). |

## 4. Notifications

| ID | Priority | Feature | Notes |
|---|---|---|---|
| N-27 | P1 | Unread total in the browser tab title and favicon badge, message sound (toggle) | Cheap and very noticeable. |
| N-28 | P1 | Browser desktop notifications when tab is not focused | `Notification` API with permission prompt. |
| N-29 | P2 | PWA (installable) + Web Push when the app is closed | Service worker, VAPID keys, store push subscriptions. |

## 5. Navigation and frontend structure

| ID | Priority | Feature | Notes |
|---|---|---|---|
| N-30 | P0 | **Route per conversation** `/chat/:conversationId` | Refresh keeps the open chat, back button works, links shareable, mobile navigation gets simple. |
| N-31 | P1 | Virtualized message list (e.g. react-virtuoso) | Smooth with thousands of messages. |
| N-32 | P1 | Skeleton loaders, empty states, offline / "reconnecting…" banner | |
| N-33 | P2 | Hindi / English language switch (i18n) | |
| N-34 | P2 | Accessibility pass: labels, focus order, keyboard shortcuts, aria-live for new messages | |
| N-35 | P2 | Error boundary + 404 page | |

## 6. Backend and infrastructure

| ID | Priority | Feature | Notes |
|---|---|---|---|
| N-36 | P0 | **Rate limiting, `helmet`, request validation with zod** (HTTP and socket payloads) | |
| N-37 | P0 | Central error handler, structured logging (pino), `/health` endpoint, graceful shutdown | |
| N-38 | P1 | **Socket.IO Redis adapter** | Redis is already in the stack; needed to run more than one server instance. |
| N-39 | P1 | **Tests**: backend (Vitest/Jest + Supertest + socket.io-client), frontend (Vitest + React Testing Library) | Start with auth + send-message + unread count. |
| N-40 | P1 | **GitHub Actions CI** (lint + type-check + tests + build) | |
| N-41 | P1 | Dockerfiles for backend and frontend + one compose file for the full stack | Mongo/Redis with passwords, bound to localhost. |
| N-42 | P2 | API docs (OpenAPI / Swagger) and a proper `README` section for socket events | Root README is good already; frontend README is still the Vite default. |
| N-43 | P2 | Prettier + ESLint for backend, Husky pre-commit | |
| N-44 | P2 | Data retention: paginate conversation list, archive old messages, scheduled cleanup job | |
| N-45 | P3 | End-to-end encryption for messages | Large design change; only if really needed. |

---

## Suggested build order

1. **Foundation (with Phase 1-2 of ISSUES):** N-36, N-37, N-30, N-16, N-17
2. **Core chat feel:** N-03, N-01, N-02, N-04, N-08
3. **Redesign + settings:** Section 0, N-21, N-12, N-22, N-32
4. **Engagement:** N-27, N-28, N-05, N-06, N-07, N-09
5. **Account safety:** N-23, N-24, N-18, N-19
6. **Scale and quality:** N-38, N-39, N-40, N-41
7. **Later:** N-10, N-13, N-14, N-25, N-26, N-29 and the rest

Tell me which IDs you want and in what order.
