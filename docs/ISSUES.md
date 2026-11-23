# chatZ — Issues Found During Code Review

Reviewed: full `backend/` and `frontend/src/` (about 2,700 lines, every file read).

**Quick health check**
- `tsc -b` (frontend): clean, no type errors
- `eslint .` (frontend): clean
- `node --check` (all backend files): clean

So nothing is "broken at compile time". The problems below are **security, logic, real-time bugs, UX and styling**.

**Severity:** 🔴 High (fix first) · 🟠 Medium · 🟡 Low
**IDs** (S-01, B-02 ...) are there so you can say "fix S-01, B-03" later.

---

## A. Security

**S-01 🔴 NoSQL injection through socket events**
`backend/socket/socketConversation.js:48-49` (also lines 121, 162, 233)
`connectCode`, `friendId`, `conversationId` come straight from the client and go into Mongo queries with no type check. A client can emit `{ connectCode: { "$ne": null } }` instead of a string, which makes the query match other users. In `conversation:request` this lets someone force friendships with arbitrary users and receive their `username`, `fullName`, `connectCode`.
Fix: check `typeof === "string"`, validate connect code with `/^\d{6}$/`, ids with `mongoose.isValidObjectId`. Better: validate every socket payload with zod. Optionally enable Mongoose `sanitizeFilter`.

**S-02 🔴 No consent for adding friends + easy-to-guess connect codes**
`socketConversation.js:44-117`, `utils/generateUniqueConnectCode.js:4`, `conversationController.js:8-38`
Connect code is only 6 digits (1,000,000 combos). `check-connect-code` tells anyone whether a code is valid, and `conversation:request` instantly creates the friendship and conversation on **both** sides. Anyone can enumerate codes and push themselves into other people's chat list.
Fix: friend-request flow (pending → accept/reject), longer random code (e.g. 10 chars alphanumeric), rate limit on code checks.

**S-03 🔴 Cross-site WebSocket hijacking (production)**
`backend/socket/socketAuthMiddleware.js:5-18`, `authController.js:80` (`sameSite: 'none'` in production)
Socket auth reads only the cookie. WebSocket handshakes are not blocked by CORS, so another website could open a socket as the logged-in user and send messages.
Fix: in the socket auth middleware, reject if `socket.handshake.headers.origin` is not in `allowedOrigins`.

**S-04 🟠 No rate limiting anywhere**
`server.js`, socket handlers
Login/register can be brute-forced; socket events (`send-message`, `typing`, `request`) can be spammed.
Fix: `express-rate-limit` on `/api/auth/*` and `/check-connect-code`; per-socket throttle for events.

**S-05 🟠 Weak startup checks for secrets and CORS**
`server.js:4-6, 29-38`, `.env.example`
`JWT_SECRET` only checked for "exists", so the placeholder `replace-with-a-long-random-secret` is accepted. If `CLIENT_ORIGIN` is empty, CORS silently blocks everything with no warning.
Fix: require min length (32+) and reject the placeholder; fail fast if `CLIENT_ORIGIN` is empty.

**S-06 🟠 Logout does not invalidate the token**
`authController.js:118-125`
Logout only clears the cookie. The JWT stays valid for 7 days if copied. A connected socket also stays authenticated after the token expires.
Fix: short-lived access token + refresh token (or a token version field on User) so logout / password change can revoke.

**S-07 🟡 Smaller auth issues**
- No max password length (`authController.js:19`); bcrypt only uses 72 bytes and very long inputs waste CPU. Add max 72.
- Login returns immediately for unknown email (`authController.js:69-71`), so response time reveals which emails exist. Compare against a dummy hash.
- `jwt.verify` does not pin the algorithm (`authMiddleware.js:12`, `socketAuthMiddleware.js:13`). Pass `{ algorithms: ['HS256'] }`.
- No `helmet` security headers.
- `socket.user` holds the password hash in memory (`socketAuthMiddleware.js:14`). Use `.select('-password')`.

---

## B. Real-time / Socket / Redis bugs

**B-01 🔴 Messages for other chats are lost from cache**
`frontend/src/hooks/useMessages.tsx:19-20`, `useMessageListen.tsx:21`
`staleTime: Infinity` means cached messages never refetch. The new-message listener only updates the **currently open** conversation. Steps: open chat B → switch to chat C → B sends messages → switch back to B → new messages are missing until page reload.
Fix: listen globally (in `ConversationsProvider`) and update every conversation's cache, or use `refetchOnMount: 'always'`.

**B-02 🔴 Socket gives up after one failed reconnect, no resync**
`frontend/src/contexts/SocketProvider.tsx:18-21`
`reconnectionAttempts: 1` → on a weak network the socket dies permanently until reload. Also, after a reconnect nothing refetches conversations/messages, so anything missed while offline stays missing.
Fix: remove the limit (or set a high one), and on `connect` after a reconnect invalidate `["conversations"]` and `["messages"]`.

**B-03 🟠 Typing indicator shows for the wrong person / gets stuck**
`frontend/src/hooks/useTypingListen.tsx:18-20`, `components/ChatWindow/MessageInput.tsx`
- Handler never checks `payload.userId === friendId`, so if friend C types while you have chat B open, B's window shows "typing".
- State is never reset when you switch conversation, and there is no timeout, so if the friend disconnects mid-typing it stays forever.
- Switching chat while typing never sends `isTyping: false` to the old friend.

**B-04 🟠 Chat header shows stale Online/Offline**
`store/conversatonStore.tsx`, `Sidebar/ConversationItem.tsx:33`, `ChatWindow/ChatHeader.tsx:12`
The selected conversation is stored as a **copy** (snapshot) at click time. Online-status updates only change the react-query list, so the header never updates while the chat is open. Root cause: `ConversationsProvider` lives inside `Sidebar`, so `ChatWindow` can't see the live list.
Fix: store only `selectedConversationId` and derive the conversation from the live list; move `ConversationsProvider` up to `Chat.tsx`.

**B-05 🟠 Unread counter can lose counts (race condition)**
`socketConversation.js:194-196`
Read-modify-write (`get` then `set +1` then `save`). Two quick messages can overwrite each other.
Fix: single atomic `findByIdAndUpdate` with `$inc: { "unreadCount.<friendId>": 1 }` and set `lastMessage` in the same update.

**B-06 🟠 Mark-as-read is too noisy and `Message.read` is never set**
`ChatWindow/MessageList.tsx:19-34`, `socketConversation.js:119-159`
The effect re-emits `mark-as-read` on every `data` change, including when **you** send a message and when the tab is hidden. Each call costs about 3 DB queries. Also `Message.read` is never updated, so there are no read receipts even though the field exists.
Fix: emit only when the tab is visible and the last message is from the friend; update `Message.read/readAt`.

**B-07 🟠 Redis down = everyone shows offline, and requests hang**
`services/redisService.js:18-24, 52-56`
When Redis is unavailable `isUserOnline` returns `false` (fallback 0). Also each `_safe` call re-tries `initialize()` with a 5 s connect timeout, so `GET /api/conversations` and socket connect can block about 5 s each.
Fix: short circuit-breaker (skip retries for ~30 s after failure), log once, and treat "Redis unknown" differently from "offline".

**B-08 🟠 Socket handlers are registered after `await`s**
`backend/socket.js:14-22`
`socket.on(...)` is attached after `await addUserSession` and `await notifyConversationOnlineStatus`. If the client emits right after connecting, those events can be dropped.
Fix: register all handlers first (synchronously), then do the async presence work.

**B-09 🟡 Forced scroll while reading old messages**
`hooks/useMessageListen.tsx:38-44`, `MessageList.tsx:22-28`
Every incoming message scrolls to the bottom even if the user scrolled up to read history. Only `useTypingListen` checks "near bottom".
Fix: scroll only if near bottom; otherwise show a "new messages ↓" button.

**B-10 🟡 Presence / scaling notes**
- Stale sessions can show a user online for up to 10 min after a server crash (key TTL 600 s).
- Redis is only used for presence. `io` has no Redis adapter, so running 2+ server instances will break rooms/emits (`server.js:52-63`).
- `refreshUserSession` does `sAdd` then `sIsMember` (always true), pointless (`redisService.js:73-81`).
- Online/offline `toast.info` for every friend gets noisy (`ConversationsProvider.tsx:37-39`).

---

## C. Backend logic / data

**C-01 🟠 Conversation list is never sorted**
`conversationController.js:42-98`, `ConversationsProvider.tsx:49-57`
Order is whatever Mongo returns; a new message does not move the chat to the top; new conversations are appended at the end.
Fix: sort by `lastMessagePreview.timestamp` desc on the server and re-sort on update on the client.

**C-02 🟠 Pagination cursor can skip messages**
`messageController.js:21-28`
Cursor is `createdAt < cursor`. Two messages with the same millisecond timestamp can be skipped at a page boundary. Also server returns `nextCursor: null` but the TS type says `string | undefined`.
Fix: cursor on `_id` (or `createdAt + _id`).

**C-03 🟠 No validation in socket handlers**
`socketConversation.js:162-` (send-message), `121-` (mark-as-read)
`conversationId` / `friendId` are not checked for type or ObjectId validity; bad input ends up as generic "Error: conversation:send-message:error". Also `friendId` is trusted from the client although the server can derive it from the conversation's participants.
Fix: validate with zod; derive the other participant from `conversation.participants`.

**C-04 🟠 Seed script is dangerous and sloppy**
`utils/seedData.js:13-27, 29-97`
`deleteMany({})` on every collection with no `NODE_ENV` guard (running it against a real DB wipes everything). `mongoose.disconnect()` not awaited (line 20), `connectDB()` called twice, no `npm run seed` script, and README does not explain it. Seed password is `"password"`.
Fix: refuse to run in production, add `"seed"` script, await disconnects.

**C-05 🟡 User model gaps**
`models/User.js`
`username` is not `lowercase: true` at schema level (only the controller lowercases), no email format check, `minLength: 6` on the **hashed** password is meaningless, no `timestamps`, no `lastSeenAt`.

**C-06 🟡 Connect-code generator**
`utils/generateUniqueConnectCode.js`
Check-then-insert has a tiny race (rely on the unique index and retry on duplicate error). Loop has no max attempts.

**C-07 🟡 Friendship + Conversation are separate, no transaction, no unfriend**
`socketConversation.js:68-80`
Two collections for one relationship; a simultaneous A→B and B→A request can both pass the "exists" check (the code does clean up on conversation failure, so it's handled, but only by luck of the unique index). There is no way to remove/block a friend.

**C-08 🟡 Mongo indexes are redundant**
`models/Message.js`
`index: true` on `conversation`, `sender`, `read` **plus** compound indexes. `read` as a boolean index is almost useless, and `conversation:1` is covered by `{conversation:1, createdAt:-1}`. Extra write cost for nothing.

**C-09 🟡 Server hygiene**
`server.js`
No global error handler / 404 handler, no `/health` route, no graceful shutdown (close HTTP, mongoose, redis on SIGTERM), `try/catch` around `listen` catches nothing useful (errors come from the `error` event) (lines 66-75), no `unhandledRejection` handler. Debug `console.log`s in production code (`socketAuthMiddleware.js:9`, `socketConversation.js:30`, `socket.js:11`). Use a logger (pino).

**C-10 🟡 Sending a message costs too many DB calls**
`socketConversation.js:123-208`
Friendship lookup + conversation lookup + message save + post-save hook update + conversation save + re-read conversation. Could be 2 queries (validate once, then one atomic update).

---

## D. Frontend bugs

**D-01 🔴 Chat cannot be opened on mobile**
`pages/Chat/Chat.tsx:14-19`
Sidebar is `w-full` on small screens and `ChatWindow` is `hidden sm:flex`, so on a phone, tapping a conversation shows nothing. There is no back button and no route per chat.
Fix: route like `/chat/:conversationId`; on mobile show either list or chat; add back button. (Do this together with the redesign.)

**D-02 🟠 Previous user's chat leaks after logout/login (without page reload)**
`Sidebar/UserProfile.tsx:7-26` (the `conversationStore` lines are commented out), `store/conversatonStore.tsx`
`selectedConversation` is never cleared on logout, so the next account that logs in sees the previous user's friend in the header.
Fix: clear the store on logout (and reset socket).

**D-03 🟠 Draft text carries over between chats**
`ChatWindow/MessageInput.tsx:11`
`message` state lives in a component that stays mounted when you switch conversations, so text typed for friend A can be sent to friend B.
Fix: `key={conversationId}` on `MessageInput` or reset on change; also send `isTyping:false` on switch.

**D-04 🟠 No Enter-to-send, newlines collapse**
`MessageInput.tsx:58-64`, `MessageItem.tsx:28,40`
No `onKeyDown` (Enter sends, Shift+Enter newline). Textarea is single row `rounded-full`. If someone does insert a newline it is not shown because `<p>` has no `whitespace-pre-wrap`; long words/URLs have no `break-words` and overflow the bubble.

**D-05 🟠 Add-friend errors are unhelpful**
`Sidebar/AddConversationModal.tsx:50`, `ConversationsProvider.tsx:88`
- On failure it shows `result.error.message`, which for axios is "Request failed with status code 400", not the server message ("Invalid connect code", "Friendship already exists").
- Socket error `conversation:request:error` carries a specific message, but the client always shows "Unable to add conversation".
- Zod rule is only `min(6)`, so letters and 7+ characters pass.

**D-06 🟠 No handling for expired login (401)**
`utils/apiClient.tsx`
No response interceptor. When the JWT expires mid-session, API calls fail with generic errors and the socket shows "Socket connection error"; user is not redirected to `/auth`.

**D-07 🟡 Auth page details**
- Default view is **Register** (`pages/Auth/Auth.tsx:6`, `useState(false)` → `isLogin=false`). Most returning users expect Login first.
- Username max is 12 on the frontend (`registerForm.tsx:19`) but 30 on the backend.
- `.transform(toLocaleLowerCase)` is useless because the regex rejects uppercase first; either allow uppercase and lowercase it, or drop the transform.

**D-08 🟡 Accessibility**
`<label htmlFor="...">` has no matching `id` on inputs (login, register, add-friend) → labels are not linked. `Modal` has no Esc-to-close, no click-outside, no focus trap, no `role="dialog"`/`aria-modal`. Icon-only buttons have no `aria-label`.

**D-09 🟡 Two sources of truth for auth**
`store/authStore.tsx` (persisted in localStorage, including email) and react-query `['auth']` both hold the user; `useAuth` writes to the store inside `queryFn`. Not a bug today, but easy to get out of sync, and it stores the email in localStorage unnecessarily.

**D-10 🟡 Small logic / data issues**
- Search filters only by `username`; `fullName` is collected at signup but never shown anywhere.
- `ConversationItem.tsx:10` highlights the preview in blue when the **friend** has unread messages (i.e. your own unread-by-them), which is confusing.
- Time display rule differs: `>= 1` day in `ConversationItem.tsx:22` vs `> 1` in `MessageItem.tsx:23`, and both use a rolling 24 h, not "today / yesterday".
- Avatar is a hot-linked Bing image URL (`ConversationItem.tsx:40`); same picture for everyone and it can break/track. Use initials avatar.
- Socket message payload has no `conversation` field but the `Message` type requires it.

---

## E. UI / Styling bugs

**E-01 🟠 Tailwind classes that don't exist**
`loginForm.tsx:54,65,79,97`, `registerForm.tsx` (same pattern)
`text-dark`, `text-primary`, `focus:ring-primary` are not defined (no theme config; `index.css` only has `@import 'tailwindcss'`). So the "Sign Up / Sign In" links have no colour and input focus rings don't show.
Fix: define a theme (`@theme { --color-primary: ... }`). This is where your colours will go.

**E-02 🟠 Class typos**
- `components/ui/Modal.tsx:19` `max-wd-lg` → `max-w-lg` (size "lg" does nothing)
- `Modal.tsx:27` `hover:text=gray-700` → `hover:text-gray-700`
- `ChatWindow/ChatHeader.tsx:22` `flexspace-x-4` → `flex space-x-4`

**E-03 🟠 Layout doesn't use fixed height**
`Chat.tsx:13`, `Sidebar.tsx:9`, `ChatWindow.tsx:10`
Everything uses `min-h-screen`, so with many conversations the **whole page** scrolls instead of the list; chat input is not pinned reliably. Use `h-dvh` + `overflow-hidden` on the root and `overflow-y-auto` only on list/messages.

**E-04 🟡 Received message timestamp may be invisible**
`ChatWindow/MessageItem.tsx:41`
Has both `text-gray-500` and `text-blue-100` on a white bubble; the light-blue one can win and be unreadable.

**E-05 🟡 Placeholders and dead UI**
- `Conversations.tsx:10` loading box is missing `flex` so it isn't centred; error state is bare text; no empty state ("Add a friend with their connect code").
- Settings button (`Header.tsx:15`) and three-dots button (`ChatHeader.tsx:23`) do nothing.
- `UserProfile.tsx:31` always says "Online".
- Connect code is shown as plain text with no copy button, even though it is the main way to add friends.
- Message input has no padding/border/background separation from the message list.

---

## F. Repo / DevOps hygiene

**F-01 🔴 `backend/node_modules` and `frontend/.env` are committed**
`git ls-files` shows 4,689 tracked files under `backend/node_modules`, and `frontend/.env`. `.gitignore` lists both now, but it was added after they were committed, so git still tracks them. The `.env` only has `VITE_API_URL=http://localhost:4000/api` (no secret leaked), but any future secret placed there would be leaked.
Fix: `git rm -r --cached backend/node_modules frontend/.env`, commit, and add `frontend/.env.example`.

**F-02 🟠 Production cookie plan will break on Safari/iOS and newer Chrome**
`authController.js:80`, `netlify.toml`
Frontend on Netlify + API on another domain means the cookie is **third-party** (`sameSite:'none'`). Safari blocks it; Chrome is restricting it. Login will silently fail for many users. Netlify cannot proxy WebSockets either.
Fix: serve API from a subdomain of the same site (e.g. `app.example.com` + `api.example.com`) and set cookie `domain=.example.com` with `sameSite: 'lax'`. Remember to set `VITE_API_URL` in the Netlify dashboard (the committed `.env` points to localhost).

**F-03 🟡 Leftover names and template files**
- Backend `package.json`: name `chatty-backend`, `"main": "index.js"` (real entry is `server.js`); DB name `chatty` hardcoded in `utils/db.js:9`.
- `frontend/README.md` is the default Vite template.
- Unused template files: `src/App.css` (empty), `src/assets/react.svg`, `vite.svg`, `hero.png`, `public/icons.svg`, and `src/contexts/explaination.txt`.
- File naming: `conversatonStore.tsx` (typo), mixed `.tsx` for files with no JSX (services, hooks, stores), `registerForm.tsx` vs `Auth.tsx` casing.

**F-04 🟡 Docker compose is dev-only and open**
`backend/docker-compose.yaml`
Mongo and Redis have no password and are published on all interfaces (`27017:27017`, `6379:6379`). Bind to `127.0.0.1:` at least. No app services/Dockerfile.

**F-05 🟡 No tests, CI, formatter or env docs for frontend**
No unit/integration tests, no GitHub Actions, no Prettier, no backend ESLint, no `engines` field, no `frontend/.env.example`.

---

## Suggested fix order

1. **Phase 1 — Security + repo safety:** F-01, S-01, S-03, S-05, S-04, S-02
2. **Phase 2 — Real-time correctness:** B-01, B-02, B-08, B-04, B-03, B-05, B-06, D-02, D-03
3. **Phase 3 — Chat quality of life:** C-01, C-02, C-03, D-04, D-05, D-06, B-09, B-07
4. **Phase 4 — Layout, mobile and styling (together with the redesign):** D-01, E-01 to E-05, D-08
5. **Phase 5 — Cleanup and deployment:** F-02, F-03, F-04, C-04 to C-10, S-06, S-07, B-10, F-05
