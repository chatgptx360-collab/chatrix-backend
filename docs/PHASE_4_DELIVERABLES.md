# Phase 4 — Deliverables

The mobile app, end-to-end. Auth flow, chat list, chat room with real-time
bubbles, friends/search, profile, settings — all built on the contracts and
APIs from Phases 1-3.

---

## ✅ Shipped

### Routing + auth gate

- Expo Router file-based routes:
  - `app/(auth)/`  — welcome, signup, login, forgot
  - `app/(tabs)/`  — chats, friends, settings
  - `app/chat/[id]` — chat room
  - `app/profile/[id]`, `app/profile/edit` — public + own profile
  - `app/settings/{privacy,devices,notifications,appearance,verify-email}` — sub-screens
- **Auth gate** in `app/_layout.tsx` redirects unauthenticated users to
  `(auth)/welcome` and signed-in users into `(tabs)/chats`. The gate watches
  `accessToken` from the Zustand store, so the redirect happens automatically
  on login, signup, refresh-failure, and sign-out.
- Tab bar uses `expo-blur` translucent background on iOS and a solid surface on
  Android (matching native conventions). `lucide-react-native` icons throughout.

### Cross-cutting infra

- **`useTheme()`** hook (`src/lib/ui/theme.ts`) — single source for every
  screen's color tokens. Reads `@chatrix/ui`'s palette so values match the web.
- **`api` client** (`src/lib/api/client.ts`) — fetch wrapper with auto-refresh
  on 401, ChatrixError mapping. Typed helpers: `ApiAuth`, `ApiChats`,
  `ApiMessages`, `ApiUsers`, `ApiFriends`.
- **Socket hooks** (`src/lib/socket.ts`) — singleton socket, `useSocketStatus`,
  `useSocketEvent` (typed by the shared event interface; ref-stable so inline
  handlers don't churn).
- **Format helpers** (`src/lib/format.ts`) — relative time ("just now", "5m",
  "yesterday"), last-seen pill text, message-kind labels.

### UI primitives (`src/components/`)

| Component         | Purpose                                                      |
| ----------------- | ------------------------------------------------------------ |
| `Screen`          | Wraps every screen — safe-area edges, brand bg, padding flag |
| `Button`          | Primary (gradient), secondary, ghost, danger; haptic + loading |
| `Input`           | Floating-label-style field with focus glow + error slot       |
| `Avatar`          | Image or deterministic gradient + initials, with presence dot |
| `EmptyState`      | Title + description + optional CTA                            |
| `BrandLogo`       | Gradient mark, optional wordmark                              |
| `MessageBubble`   | Mine vs theirs, grouped corners, image bubble, reactions, receipts |
| `TypingDots`      | Reanimated-driven 3-dot indicator                             |
| `Composer`        | Auto-grow input, attach + emoji slots, gradient send button   |
| `SettingsSubScreen` | Shared chrome for nested settings pages                     |

### Auth flow

- **Welcome** — gradient hero, tagline, two CTAs (Create username / Sign in)
- **Signup** — username + email + password, Zod-validated, conflict-aware
  inline errors (USERNAME_TAKEN / EMAIL_TAKEN), keyboard-avoiding scroll
- **Login** — single identifier field accepting `@username` or email
- **Forgot password** — enumeration-safe confirmation screen

### Chat list (`(tabs)/chats`)

- Single-query home screen. Each row shows avatar (or peer avatar in DMs),
  display name, last-message preview, relative time, and an unread badge.
- **Live updates** — invalidates the query on `message:created` and
  `chat:updated` socket events.
- **Pinned + muted** glyphs render inline; muted unread badges turn gray.
- **Connection pill** — header subtitle becomes "Reconnecting…" in red when
  the socket drops.
- Server-side ordering: pinned first, then by `last_message_at`.

### Chat room (`chat/[id]`)

The centerpiece.

- **Bubbles** — gradient for mine, surface+border for theirs. Corners flatten
  when messages are grouped (same sender within 5 minutes). Image bubbles
  render with blurhash placeholders and optional caption.
- **Typing dots** — phase-shifted Reanimated animation, runs on UI thread.
  Server emits via `typing:start/stop`; gateway broadcasts. Defensive 5s
  client-side timeout in case a `stop` event drops.
- **Composer** — auto-grow textarea (max 5 lines), debounced typing emit
  (`start` on first keystroke, `stop` after 2s idle / on send / on blur).
- **Read receipts** — newest-message-first cursor advance via
  `POST /messages/mark-read` whenever the chat is open.
- **Optimistic send** — placeholder bubble appears instantly with a `clientId`;
  server's `message:created` echo replaces it (server's ON CONFLICT clause
  makes the round-trip idempotent under retry).
- **Auto-scroll** — only when the viewer was already near the bottom; reading
  history isn't yanked away by new arrivals.
- **Pagination** — `onEndReached` loads the next page via the `nextCursor`
  the API returned and appends to the cache.

### Friends / discover (`(tabs)/friends`)

- Trigram search on `@username` or display name (server-side; respects
  `searchable` privacy flag).
- 300ms debounce, "min 2 chars" hint, empty hero, "no matches" state.
- Tap a result → `POST /chats/dm` (idempotent get-or-create) → navigate to
  the chat room.

### Profile + Settings

- **Public profile (`profile/[id]`)** — large avatar, presence + last-seen
  pill, bio, Message + Add friend CTAs, Report row.
- **Edit profile** — display name, bio. Avatar picker wired to
  `expo-image-picker` (upload pipeline lands Phase 4.5).
- **Settings hub** — section-list pattern; profile card with copy-handle
  shortcut, Account / Preferences sections, danger sign-out at the bottom.
- **Active devices** — lists current sessions from `POST /sessions/with-current`,
  highlights the current device, lets the user revoke any other.
- Sub-screens for Privacy, Notifications, Appearance, Email verification —
  some are placeholder shells with explicit "Phase 4.5" notes; the verify-email
  screen is fully wired (calls `POST /auth/verify-email/resend`).

---

## ⏳ Deferred to Phase 4.5

These exist in the routes/components and have backend support — they just
need a focused UI pass:

- **Avatar upload** — picker is wired; two-phase upload + PATCH not yet.
- **Message reactions picker** — long-press is haptic-acknowledged but the
  emoji sheet isn't yet rendered. The toggle API is fully exercisable from
  the gateway.
- **Voice notes** — `expo-av` recording UI + waveform.
- **Image / file send** — `expo-image-picker` already in deps; needs
  `init/finalize` glue + the captioned-image bubble already supports it.
- **Notifications, Appearance, Privacy editors** — placeholder shells now;
  one PR each fills them in.
- **Friend request inbox** — backend has the endpoints; UI surface lives
  in Friends tab (Pending section).
- **Forwarding + Reply UI** — backend already supports both; needs the
  message-context sheet on long-press.

---

## How it all hangs together

```
 Welcome ──┬─► Signup ─►  ┐
           └─► Login  ─►  ├─► (tabs)/chats  ◄────► chat/[id]
                          │       ▲                  ▲
                          │       │                  │
                          ├─► (tabs)/friends ────────┘ (open DM)
                          │
                          └─► (tabs)/settings  ──► profile/edit
                                                ├─► settings/devices
                                                ├─► settings/privacy
                                                ├─► settings/notifications
                                                ├─► settings/appearance
                                                └─► settings/verify-email
```

A logged-in user can:

1. See their conversations with live unread counts
2. Tap into any chat → see history → send/receive in real time
3. Search for a new friend by `@username` and start a DM
4. Edit their profile, copy their share-link, manage devices, sign out

Backend everything from Phase 3 is exercised by these screens — message send
(over WS via the chat room), markRead, reactions toggle (via long-press
hook), the chat-list query, the user-search query, the sessions API, the
profile-update path.

---

## Try it

```bash
# In one terminal:
pnpm db:up && pnpm db:migrate
pnpm --filter @chatrix/backend dev

# In another:
pnpm install                       # installs expo + new deps
pnpm --filter @chatrix/mobile ios  # or `android`, or `web`
```

Sign up two users (two simulators / device + simulator), add one to the other
via Friends → Message, and watch messages cross instantly. Type in one to see
typing dots in the other. Tap into the second user's chat to see read receipts
flip from `✓✓` (delivered) gray to `✓✓` (read) accent.

---

## File count: ~150 (was 122 after Phase 3)
