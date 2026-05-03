# Chatrix — Architecture

This document is the map. It explains where every byte of state lives, how
requests and messages flow, and which assumptions the system rests on.

---

## 1. System diagram

```
                    ┌────────────────────────────────────────────────────┐
                    │                       Clients                       │
                    │   Web (Next.js)   iOS / Android (Expo)              │
                    └───────────┬───────────────────────────┬─────────────┘
                                │ HTTPS REST                │ WSS Socket.IO
                                ▼                           ▼
                    ┌────────────────────────────────────────────────────┐
                    │            Backend  —  NestJS / Fastify             │
                    │ ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
                    │ │  HTTP API    │  │  WS Gateway  │  │ Workers    │ │
                    │ │  (controllers│  │  (Socket.IO) │  │ (push,     │ │
                    │ │   + services)│  │              │  │  media)    │ │
                    │ └──────┬───────┘  └──────┬───────┘  └────┬───────┘ │
                    └────────┼─────────────────┼───────────────┼─────────┘
                             │                 │               │
                ┌────────────┼─────────────────┼───────────────┘
                ▼            ▼                 ▼
        ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐
        │ PostgreSQL   │ │ Redis        │ │ Object Storage        │
        │  · users     │ │  · presence  │ │  · Supabase / S3      │
        │  · chats     │ │  · sock-io   │ │  · images / video /   │
        │  · messages  │ │    adapter   │ │    audio / files      │
        │  · media     │ │  · ratelim   │ │                       │
        │  · reports   │ │  · pubsub    │ │                       │
        └──────────────┘ └──────────────┘ └──────────────────────┘
```

The backend scales **horizontally**:
- Stateless HTTP — any instance can serve any request.
- Sockets are sticky to an instance per connection, but the **Redis adapter**
  fans events across instances, so an event from one socket reaches a client
  connected to a different pod.

---

## 2. Identity model

- Every account has a globally unique **`@username`** (case-insensitive, regex-validated).
- `users.email` is required only for verification + password reset; never exposed publicly.
- **No phone numbers**, ever.
- `chatrix.app/@username` is the canonical share link; QR codes encode the same.

`users` (auth identity) and `profiles` (presentation) are split so we can scale
read-heavy profile fetches independently from auth writes, and so admin actions
on the user record don't churn the profile cache.

---

## 3. Auth flow

```
  Client                  Backend                     DB
    │  POST /v1/auth/signup  │                         │
    │ ─────────────────────▶│  argon2 hash            │
    │                       │  INSERT users + profile │
    │                       │ ──────────────────────▶ │
    │                       │  issue access JWT       │
    │                       │  issue refresh (opaque) │
    │                       │  store refresh hash     │
    │                       │ ──────────────────────▶ │
    │   { access, refresh } │                         │
    │ ◀─────────────────────│                         │
```

**Tokens.**
- Access JWT: 15 m, signed `{ sub, role, type:"access" }`.
- Refresh: 64-byte random string, **opaque** to the client.
  Server stores `sha256(token)` in `sessions.refresh_token_hash`.
- Every refresh **rotates** the token — old hash is revoked.
- Presenting a revoked token detects token theft and revokes **all** of that user's
  sessions immediately.

**Verification.** A 24 h email verification token + a 1 h password reset token use
the same shape: random 32-byte string, expiration, `consumed_at` to prevent reuse.

---

## 4. Realtime architecture

Socket.IO + Redis adapter. Three room conventions:

| Room              | Members                         | Used for                             |
| ----------------- | ------------------------------- | ------------------------------------ |
| `user:<userId>`   | Every device of one user        | Direct push (friend req, system)     |
| `chat:<chatId>`   | Members joined to a chat        | Messages, typing, reactions, reads   |
| (broadcast)       | Everyone (filtered by privacy)  | Presence changes                     |

On connect, the gateway:
1. Validates the access token from the handshake.
2. Joins `user:<id>`.
3. Marks the user online in Redis (`presence:user:<id>`, TTL 90 s).
4. Heartbeats refresh the TTL — no polling, no DB chatter on the hot path.

On disconnect, if no other socket of the same user remains, presence flips to
`offline` and gets snapshotted to Postgres so cold loads see an accurate `last_seen`.

---

## 5. Message hot path

The single most-called query in the system is *"give me the last N messages in
chat X"*. It's served by the index `messages_chat_created_idx
(chat_id, created_at DESC)`.

**Send pipeline:**
1. Client emits `message:send` over WS or POSTs to `/v1/messages`.
2. Service verifies membership in `chat_members`.
3. INSERT with `(chat_id, sender_id, client_id)` UNIQUE — built-in idempotency
   for retries.
4. Trigger `messages_bump_chat` updates `chats.last_message_*` so the chat list
   sorts correctly without a subquery.
5. Gateway emits `message:created` on `chat:<id>` — every connected member
   receives it.
6. Recipients online → `message:delivered` is recorded into `message_reads`.
7. Recipients viewing the chat → `read:mark` updates
   `chat_members.last_read_message_id` + emits `message:read`.

**Edit window.** `MESSAGE_EDIT_WINDOW_MS = 48 h`; enforced server-side and surfaced
as `MESSAGE_EDIT_WINDOW_CLOSED` to the client. `messages.edit_history` keeps each
prior body for transparency.

**Delete.** "For me" never touches the DB row — clients filter via local state.
"For everyone" sets `deleted_at` and `deleted_by`; the row stays as a tombstone
so receipts and reply-chains keep working.

---

## 6. Media pipeline

Two-phase upload protects the API from streaming bytes:

```
  POST /v1/media/init    →  { mediaId, uploadUrl, storageDriver }
                            (server validates kind + mime + size)
  PUT   <uploadUrl>      →  client uploads directly to Supabase / S3
  POST /v1/media/:id/finalize
                          →  server marks 'ready', kicks transcode/thumbnail
```

Every media row is **owned by a user** but **referenced by N messages** through
`message_attachments`. Soft delete (`media_files.deleted_at`) keeps already-sent
messages intact.

---

## 7. Privacy + safety

- `profiles.privacy.searchable=false` removes the user from search results
  (server enforces, not client).
- Block is bidirectional and absolute: blocks short-circuit friend requests,
  message visibility, and presence.
- Every admin action writes to `admin_audit_log`.
- Reports are typed (`user`/`message`/`chat`) and tracked through a state
  machine (`open` → `reviewing` → `actioned` / `dismissed`).

---

## 8. E2E-ready architecture (not on by default)

The schema is designed so we can switch on E2E without a migration:
- `messages.body` is `TEXT` — happy to carry base64 ciphertext.
- `chats.encryption_metadata JSONB` carries per-chat key-agreement state
  (e.g. MLS group state, Olm session IDs).
- Read receipts are stored per-recipient and are not body-dependent.

Phase 8+ work: implement MLS (or Signal-style double-ratchet for DMs) on the
client, store key bundles, swap the wire payload.

---

## 9. Scaling notes

| Bottleneck            | First mitigation            | Next step                            |
| --------------------- | --------------------------- | ------------------------------------ |
| Read traffic on chat list | Add Redis cache keyed by `chat_id` invalidated by `last_message_at` trigger | Read replicas |
| WS connection count   | Multiple backend pods + Redis adapter (already wired) | Dedicated WS-only pods, Anycast LB |
| Postgres write QPS    | Tune `messages` autovacuum, partition by `created_at` month | CDC to read store (BigQuery) for analytics |
| Media bandwidth       | CDN in front of Storage     | Edge thumbnails (Lambda/Vercel Edge) |

---

## 10. Open questions (tracked, not decided)

- Group key agreement: MLS vs Signal sender-keys? (Phase 8)
- Search: Postgres trigram is fine to ~1 M users; Meilisearch above that.
- Push: Expo for Phase 1; consider FCM/APNS direct once we exceed Expo's quota.
