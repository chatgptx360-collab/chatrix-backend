# Phase 1 — Deliverables

What is on disk after Phase 1, and what is *not* (so the boundary is clear).

---

## ✅ Shipped

### Architecture & tooling
- pnpm + Turbo monorepo (`apps/*`, `packages/*`)
- Strict shared `tsconfig.base.json`
- `.env.example` covering every required variable for all apps
- Local dev infra: `docker compose` for Postgres 16 + Redis 7
- `.gitignore`, Prettier, package scripts

### Database (production-grade SQL)
- `db/migrations/0001_extensions.sql` — pgcrypto, citext, pg_trgm, btree_gin
- `db/migrations/0002_users_and_profiles.sql` — users + profiles + verification/reset tokens
- `db/migrations/0003_sessions_and_devices.sql` — refresh sessions + push devices
- `db/migrations/0004_social_graph.sql` — friendships + blocked_users
- `db/migrations/0005_chats_and_messages.sql` — chats, members, messages, reads, reactions
- `db/migrations/0006_media_files.sql` — media + message_attachments
- `db/migrations/0007_notifications_and_reports.sql` — notifications, reports, admin audit log
- `db/migrations/0008_triggers.sql` — `updated_at` triggers + chat last-message bump
- Idempotent migration runner in `apps/backend/src/db/migrate.ts`

### Shared contract — `@chatrix/shared`
- All wire types (`PublicUser`, `SelfUser`, `Chat`, `Message`, `Friendship`, …)
- All Zod request schemas (`signupSchema`, `sendMessageSchema`, …)
- Constants (username regex, size caps, page sizes, profile-link helper)
- Stable `ErrorCode` enum + `ChatrixError` class
- Socket.IO `ClientToServerEvents` + `ServerToClientEvents` interfaces

### Backend — `@chatrix/backend`
- NestJS on Fastify, with helmet + CORS + multipart wired at boot
- `AppModule` composing 12 sub-modules in dependency order
- `DatabaseService` with `query`, `one`, `oneOrNull`, `many`, `tx` helpers
- `RedisModule` exposing three connections (cache, pub, sub)
- `ChatrixExceptionFilter` mapping every error to the shared `ApiError` shape
- `ZodValidationPipe` for body validation
- **Auth (Phase 2 partially shipped)** — signup, login, refresh, logout, /me
  - Argon2id password hashing
  - JWT access + opaque rotating refresh tokens
  - Reuse-detection (revoke-all on revoked-token replay)
  - JWT guard hydrating `SelfUser` onto the request
  - Rate-limited (`@nestjs/throttler` global + auth bucket)
- **Realtime gateway** — Socket.IO + Redis adapter, JWT handshake auth,
  presence service backed by Redis with DB snapshot
- **Module shells with real schema-bound services** for users, friends, chats,
  messages, media, notifications, reports, admin, health
- Health endpoint pinging Postgres + Redis

### Web — `@chatrix/web`
- Next.js 14 App Router + Tailwind 3 + React Query 5 + Zustand
- Brand tokens as CSS variables → Tailwind theme (light + dark)
- Premium landing hero (`/`)
- `Providers` (QueryClient + system theme detection)
- `lib/api/client.ts` — single fetch wrapper, auto-refresh on 401
- `lib/auth/store.ts` — persisted Zustand store (localStorage)
- `lib/socket.ts` — Socket.IO client with auth handshake

### Mobile — `@chatrix/mobile`
- Expo 51 + Expo Router v3 + Reanimated 3 + SafeArea + GestureHandler
- Metro config wired for the monorepo
- Babel config with Reanimated plugin
- Welcome screen + root layout + QueryClient provider
- `lib/auth/store.ts` — Zustand persisted to **SecureStore** (Keychain/Keystore)
- `app.json` configured for iOS + Android, push, deep-links

### Cross-platform UI tokens — `@chatrix/ui`
- `tokens.ts` — palette (light/dark), radii, spacing, motion curves, brand gradient
- Single source of truth consumed by Tailwind theme on web and StyleSheet on mobile

### Documentation
- `README.md` — quick start, stack table, phase plan, security posture
- `docs/architecture.md` — system diagram, auth flow, realtime, hot path,
  media pipeline, privacy, E2E readiness, scaling

---

## ⏳ Intentionally deferred

- Concrete UI screens for the chat list / chat room (Phase 4–5)
- Actual presigned URL signing for Supabase / S3 (Phase 3)
- Email send via SMTP (Phase 2.5)
- Push fanout worker (Phase 3)
- Web push VAPID setup + service worker (Phase 5)
- Admin dashboard pages (Phase 6)
- `pnpm install` lockfile + native iOS/Android folders (run-time, not source)
- Real logo/favicon/splash assets (designer pass; placeholders referenced)
