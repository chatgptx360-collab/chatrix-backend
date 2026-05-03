# Phase 5 — Deliverables

The web app, end-to-end. Same product as mobile in a desktop layout
(persistent sidebar + main pane). Built on the same `@chatrix/shared`
contracts and `@chatrix/ui` tokens, so brand and behavior stay coherent
across platforms.

---

## ✅ Shipped

### Routing — App Router groups + brand share link

- `app/(auth)/`     — public, unauthenticated routes
  - `welcome` (the existing landing on `/`),
  - `login`, `signup`, `forgot`, `reset-password`, `verify-email`
- `app/(app)/`      — auth-gated app shell with persistent sidebar
  - `chats` (empty pane), `chats/[id]` (chat room),
  - `friends`, `settings/*` (hub + 6 sub-pages)
- `app/u/[username]` — **public profile**, reachable signed-out (powers the
  brand share link `chatrix.app/@kamsy` via a Next redirect from `/@:username`).
- **Auth gate** in `(app)/layout.tsx` — bounces unauthed visitors to
  `/login?next=<intended>` and renders nothing while the redirect is in
  flight (no flash of the protected UI).

### Foundations

- `lib/cn.ts`       — `clsx + tailwind-merge`, the standard shadcn/ui pattern
- `lib/format.ts`   — relative time, last-seen pill, message-kind labels,
  initials + deterministic gradient (mirrors the mobile helper exactly so
  identity colors line up across platforms)
- `lib/api/endpoints.ts` — typed wrappers (`ApiAuth`, `ApiChats`, `ApiMessages`,
  `ApiUsers`, `ApiFriends`, `ApiSessions`)
- `lib/socket.ts`   — singleton socket, `useSocketStatus`, `useSocketEvent`
  (typed by the shared event interface; ref-stable so inline handlers don't
  re-subscribe on every render)

### UI primitives (`components/ui/`)

| Component   | Notes                                                              |
| ----------- | ------------------------------------------------------------------ |
| `Button`    | 4 variants (primary gradient / secondary / ghost / danger), 3 sizes, `loading` spinner, `icon` slot |
| `Input`     | Floating uppercase label, focus glow ring (subtle brand shadow), error slot, leading + trailing adornments |
| `Avatar`    | Image or deterministic-gradient initials fallback; presence dot (green/amber); same algorithm as mobile |
| `EmptyState`| Icon + title + description + optional CTA                          |
| `BrandLogo` | Gradient mark + optional wordmark                                  |

### Auth surface

| Route                | What it does                                                    |
| -------------------- | --------------------------------------------------------------- |
| `/login`             | Identifier (username OR email) + password; supports `?next=`     |
| `/signup`            | Username/email/password with conflict-aware inline errors        |
| `/forgot`            | Enumeration-safe confirmation screen                             |
| `/reset-password`    | Consumes `?token=`, resets, signs out everywhere, bounces to login |
| `/verify-email`      | Auto-consumes `?token=` on mount, three states (pending/ok/error) |

The auth shell is a split layout — gradient brand panel left, form pane right
(collapses to single-column below `lg`).

### App shell

- **Sidebar** (340 px) — three regions:
  - 64 px **nav rail** with brand mark, Chats / Friends / Settings tabs, and
    a tap-to-edit avatar at the bottom
  - **Chat list pane** with header + search input + scrollable list
  - Live updates: `message:created` / `chat:updated` socket events invalidate
    the list cache so unread counts and last-message previews stay current
- "Reconnecting…" pill appears in red when the socket drops

### Chat list rows

- Avatar (peer's in DMs), display name, muted/pinned glyphs
- Last-message preview prefixed with "You: " when self-sent
- Relative timestamp colored brand-purple when there's unread
- Unread bubble (gradient when active, gray when chat is muted)
- Active row highlighted via the URL match (`/chats/:id`)

### Chat components (`components/chat/`)

| Component       | What it does                                                      |
| --------------- | ----------------------------------------------------------------- |
| `MessageBubble` | Mine = brand gradient; theirs = surface + border. Corner radii flatten when grouped (5-min window) — the iMessage trick. Image bubbles render with optional caption strip below. Read receipts (`✓` / `✓✓`, accent when read). Reactions row with emoji chips. |
| `TypingDots`    | Pure CSS — three dots with phase-shifted `animation-delay`         |
| `Composer`      | Auto-grow textarea (max 6 lines), gradient send button, Enter sends / Shift+Enter newline (the Slack/Discord convention). Typing emit coalesces — `start` on first keystroke, `stop` after 2 s idle / on send / on blur. |

### Chat room page (`/chats/[id]`)

The centerpiece. Mirrors the mobile chat room:

- Joins the `chat:<id>` socket room on mount, leaves on unmount
- Subscribes to `message:created/updated/deleted`, `reaction:updated`,
  `typing:started/stopped`
- **Optimistic send** — placeholder message inserted immediately with a
  `clientId`; server echo replaces it (the backend's
  `ON CONFLICT (chat_id, sender_id, client_id)` clause makes the round-trip
  idempotent under retry)
- **Auto-scroll guard** — only follows new messages when the viewer was
  already near the bottom; reading history isn't yanked away
- **Infinite history** — scroll near the top loads the next page via
  `nextCursor`; scroll position is preserved relative to new content height
  so prepending older messages doesn't rubber-band the view
- **Read cursor** — `mark-read` fires whenever the chat is open and the
  newest message changes
- Header doubles as a Link to the public profile (`/u/<username>`)

### Friends / search

- Trigram search via `/v1/users/search`, 300 ms debounce, "min 2 chars" hint,
  empty hero, "no matches" state
- Tap **Message** → idempotent `POST /chats/dm` → router.push to the chat
- Names link to the public profile

### Settings

- **Hub** — large profile card with copy-handle button, account & preferences
  sections, danger sign-out. Inline "Verify your email" banner when
  `emailVerifiedAt` is null.
- **Edit profile** — display name + bio, character counter, link preview
  showing the canonical share URL
- **Active devices** — lists every active session with platform icon, last
  used, "This device" pill, and one-click revoke. Powered by
  `POST /v1/sessions/with-current` so the current row is correctly tagged.
- **Verify email** — resend-link form; turns into a "verified" success card
  once `emailVerifiedAt` is set
- **Privacy / Notifications / Appearance** — placeholder shells with explicit
  Phase 5.5 / Phase 6 notes (matches the mobile honesty about deferred work)

### Public profile (`/u/[username]`)

- **Server component** — fetches the profile from the public endpoint at
  request time, no auth needed, generates rich `<meta>` + Open Graph tags
  for link unfurls
- **Brand share-link redirect** — `next.config.mjs` rewrites
  `chatrix.app/@kamsy` → `chatrix.app/u/kamsy`
- 404 when the profile doesn't exist or is `searchable=false` (server-side
  privacy enforcement; we don't even leak existence)
- Two CTAs: **Message** and **Add friend**, both deep-link through
  `/login?next=...` so unauthenticated visitors land in the right place after sign-in

### Globals

- Typing-dots `@keyframes` + custom scrollbar styling for chat panes
- Brand tokens already live in CSS variables — every screen reads them via
  Tailwind's `bg-bg / text-fg / border-border / bg-brand-gradient` etc.

---

## API surface used (from Phases 2-3)

```
POST   /v1/auth/signup,login,refresh,logout
POST   /v1/auth/password/forgot
POST   /v1/auth/password/reset
POST   /v1/auth/verify-email,verify-email/resend
GET    /v1/chats?archived=
GET    /v1/chats/:id
POST   /v1/chats/dm
GET    /v1/messages/chat/:chatId?cursor=
POST   /v1/messages
PATCH  /v1/messages/:id
DELETE /v1/messages/:id
POST   /v1/messages/mark-read
POST   /v1/messages/:id/reactions
DELETE /v1/messages/:id/reactions
GET    /v1/users/search?q=
GET    /v1/users/@:username                   (public, no auth)
PATCH  /v1/users/me
POST   /v1/sessions/with-current
DELETE /v1/sessions/:id
```

WS: same shared event interface as mobile.

---

## ⏳ Deferred to Phase 5.5

Same parity gap as mobile — UI surfaces only, no backend work needed:

- **Avatar upload glue** — file input + `init/finalize` pipeline call
- **Reaction emoji picker** — long-press / right-click sheet
- **Voice notes** — record + waveform UI
- **Image / file send** — drag-drop + paste-to-upload composer
- **Friend request inbox** — list of pending in/outbound requests in Friends
- **Forwarding + Reply UI** — context menu on a message row
- **Privacy / Notifications / Appearance editors** — placeholder shells now
- **Web push permission** — VAPID + service worker (backend hook is wired)

---

## How it all hangs together

```
 Public:
   /                    landing hero
   /u/:username         public profile (server-rendered, OG tags)
   /@username      ──►  redirect → /u/:username  (brand share link)
   /login, /signup, /forgot, /reset-password, /verify-email

 Authenticated (gate at app/(app)/layout.tsx):
   /chats               empty pane
   /chats/:id           chat room (sidebar persistent)
   /friends             search + DM creation
   /settings            hub
   /settings/profile    edit name + bio
   /settings/devices    active session management
   /settings/verify-email   resend the verification link
   /settings/{privacy,notifications,appearance}   placeholders
```

A logged-in user can:

1. See live chat list with unread counts in the sidebar
2. Click any chat → instant history load, scroll for more, type-and-send
3. Receive messages from the mobile companion app in real time, see typing
   dots, see read-receipt color flips
4. Search for someone's `@username`, click Message → enter a brand-new DM
5. Click their own avatar in the rail → settings → copy their share link
6. Share `chatrix.app/@kamsy` to anyone — that link works without an account
7. Sign out cleanly (revokes the refresh token, clears local state, bounces
   to /login)

---

## Running locally

```bash
# Backend + DB
pnpm db:up && pnpm db:migrate
pnpm --filter @chatrix/backend dev          # http://localhost:4000

# Web
pnpm install
pnpm --filter @chatrix/web dev              # http://localhost:3000
```

Sign up two users in two browser windows (one regular, one private/incognito),
add one to the other from `/friends`, message — watch real-time delivery,
typing dots, and read-receipt color flip across both windows.

If you're running the mobile app at the same time:
```bash
pnpm --filter @chatrix/mobile ios
```
…then sign in with the same credentials as window 1. Web ↔ mobile sync
happens through the Redis Socket.IO adapter on the backend — no extra work.
