# Phase 3 — Deliverables

Realtime chat engine. Messages now flow end-to-end: send → DB → fan out via
Socket.IO to online recipients, push to offline ones; read receipts and
reactions are persisted and broadcast.

---

## ✅ Shipped

### Storage drivers (`apps/backend/src/modules/media/storage/`)

Pluggable interface, three concrete drivers:

| Driver     | Use case                          | Notes                                            |
| ---------- | --------------------------------- | ------------------------------------------------ |
| `supabase` | Default for hosted MVP            | REST API; signed-upload tokens (2h TTL)          |
| `s3`       | AWS S3, Cloudflare R2, MinIO      | Hand-rolled SigV4 PUT presigning (no SDK)        |
| `local`    | Offline dev / CI                  | HMAC-signed URLs into `.storage/`; gated by env  |

Driver is selected by `STORAGE_DRIVER` and instantiated by the module factory.
Switching providers is a one-line env change.

### Media pipeline

- **`POST /v1/media/init`** — validates kind/mime/size against caps, allocates
  a row in `pending` status, returns presigned PUT URL + headers + expiry.
- **`POST /v1/media/:id/finalize`** — verifies object exists at the storage
  key, fills `public_url`, transitions row → `ready`. Accepts optional
  `blurhash` and `waveform` (voice notes).
- **`MediaService.attachToMessage`** — atomic join-row insert with ownership
  + readiness checks. Used by `MessagesService.send`.
- **`MediaService.hydrateForMessages`** — single round-trip batch loader for
  message-list rendering.

### MessagesService — full implementation

| Method                | Behavior                                                                         |
| --------------------- | -------------------------------------------------------------------------------- |
| `send`                | Membership check, idempotent insert (clientId UNIQUE), attachments, delivered-stamp for online recipients, emit `message:created`, push fanout |
| `edit`                | Owner-only, enforces `MESSAGE_EDIT_WINDOW_MS` (48h), appends to `edit_history`, emit `message:updated` |
| `deleteForEveryone`   | Owner-only, sets `deleted_at`/`deleted_by`, blanks body, emit `message:deleted` (the row stays as a tombstone for receipts and reply chains) |
| `toggleReaction`      | Atomic upsert/delete on `(messageId, userId, emoji)`, emit aggregated `reaction:updated` |
| `markRead`            | Forward-only `chat_members.last_read_message_id` cursor, batch insert to `message_reads` for everything ≤ that cursor, emit `message:read` |
| `listForChat`         | Reverse-chrono pagination, hydrated attachments + reactions + reply preview in 3 round-trips total (not N+1) |

### Realtime gateway — full handlers

```
chat:join          → membership-checked room join
chat:leave         → leave room
message:send       → service.send() with ack { ok, message } | { ok:false, code }
message:edit       → service.edit() (errors → "error" event)
message:delete     → service.deleteForEveryone() (scope=me is local-only)
read:mark          → service.markRead()
reaction:add       → service.toggleReaction("add")
reaction:remove    → service.toggleReaction("remove")
typing:start/stop  → broadcast on chat:<id>
presence:update    → flips Redis state + broadcasts presence:changed
```

Service-emitted server events (`message:created`, `message:updated`,
`message:deleted`, `reaction:updated`, `message:read`) reach **every member of
the chat**, even those connected to a different backend instance — fanout goes
through the Redis adapter.

### Chat list endpoint

`GET /v1/chats?archived=true|false` — single round-trip query returning, per
chat:

- chat metadata + per-viewer state (pinned, archived, muted, nickname)
- last message (from the trigger-maintained `chats.last_message_id` cache)
- **unread count** — messages newer than the viewer's read cursor, excluding
  self-sent and deleted messages
- pinned chats float to top, then by last activity

This is the home-screen query. Indexed by
`messages_chat_created_idx (chat_id, created_at DESC)` and the per-viewer
indexes on `chat_members`.

### Push fanout (`PushService`)

- **Expo** — sends batched native push to iOS + Android registered tokens via
  the Expo push service. No SDK dep — direct REST. Sets `collapseId=chatId`
  so multiple messages from the same chat collapse on Android.
- **Web Push** — VAPID hook is wired but the `web-push` npm dep isn't
  installed by default (it's a native binding). The integration point is one
  uncomment + one `pnpm add` away; subscriptions are already persisted in
  `devices.push_subscription`.

Fanout strategy: only push to recipients whose **presence is offline**, so an
online client never gets a banner for a message it already received via WS.
Muted chats are skipped.

DM pushes show `<sender>: <preview>`; group pushes show
`<chat title>` with `<sender>: <preview>` body. Non-text messages render with
emoji labels (📷 Photo, 🎤 Voice note, 🎞 GIF, …).

---

## API surface added in Phase 3

```
POST   /v1/media/init                # presigned upload
POST   /v1/media/:id/finalize        # mark ready

GET    /v1/chats?archived=true       # chat list with unread + last message

POST   /v1/messages                  # send (also available over WS)
GET    /v1/messages/chat/:chatId     # paginated history with attachments + reactions
PATCH  /v1/messages/:id              # edit (within 48h window)
DELETE /v1/messages/:id              # delete (scope=me|everyone)
POST   /v1/messages/:id/reactions    # add reaction { emoji }
DELETE /v1/messages/:id/reactions    # remove reaction { emoji }
POST   /v1/messages/mark-read        # advance read cursor
```

WebSocket (`@chatrix/shared/events`):

```
client → server : chat:join, chat:leave, message:send, message:edit, message:delete,
                  typing:start, typing:stop, read:mark, reaction:add, reaction:remove,
                  presence:update
server → client : connection:ready, message:created, message:updated, message:deleted,
                  message:delivered, message:read, reaction:updated, typing:started,
                  typing:stopped, presence:changed, friend:request, friend:accepted, error
```

---

## ⏳ Deferred to later phases

- **Group chats / channels creation flow** — schema supports them; controller
  for `POST /chats/group` not yet wired (Phase 4 alongside the UI that needs it).
- **Forwarding** — `messages.forwarded_from` JSONB column ready, send accepts
  `forwardOf` in the schema; helper not yet implemented.
- **Image thumbnail / video transcode** — `media_files.thumbnail_key` slot
  ready; the post-finalize worker is a Phase 4 add-on.
- **Web push driver** — uncomment + install (see `push.service.ts`).
- **Per-message delivery receipts emit** — currently written to DB at send
  time, but not yet emitted as `message:delivered`. Cheap to add when the
  mobile UI needs the `✓✓` signal.

---

## Verifying Phase 3 locally

```bash
# Run infra
pnpm db:up && pnpm db:migrate && pnpm db:seed

# Run the API
pnpm --filter @chatrix/backend dev

# Sign up two users (curl/POSTman):
#   POST /v1/auth/signup { username, email, password }
# Save both access tokens.

# As user A:
#   POST /v1/chats/dm { peerId: <user-b-id> } → returns chatId
#   POST /v1/messages { chatId, body: "hi" }   → fan out

# In a second client/tab as user B, connect Socket.IO with the access token
# in `auth.token` and subscribe — you should receive `message:created`.

# Mark read:
#   POST /v1/messages/mark-read { chatId, lastReadMessageId }

# Now /v1/chats returns unreadCount: 0 for that chat.
```

If `STORAGE_DRIVER` is unset it defaults to `local` — uploaded files land in
`./.storage/` and are served from `/v1/media/_local-public/...`.
