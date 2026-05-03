# Chatrix

> **Messaging without the phone number.** A modern, fast, private cross-platform chat app.
> Connect with `@username`, not phone numbers. Web · iOS · Android, one codebase.

---

## Stack

| Layer       | Tech                                                 |
| ----------- | ---------------------------------------------------- |
| Web         | Next.js 14 (App Router) · Tailwind · React Query · Zustand |
| Mobile      | Expo 51 (Router v3) · React Native 0.74 · Reanimated · SecureStore |
| Backend     | NestJS 10 + Fastify · Socket.IO · pg · ioredis · Argon2 · JWT |
| Realtime    | Socket.IO + Redis adapter (cross-instance fanout)    |
| Database    | PostgreSQL 16 (pgcrypto, citext, pg_trgm, btree_gin) |
| Cache       | Redis 7 (presence, rate limits, pub/sub)             |
| Storage     | Supabase Storage / S3 (pluggable)                    |
| Monorepo    | pnpm workspaces + Turborepo                          |

---

## Repo layout

```
chatrix/
├─ apps/
│  ├─ backend/     # NestJS API + Socket.IO gateway
│  ├─ web/         # Next.js client
│  └─ mobile/      # Expo (iOS + Android)
├─ packages/
│  ├─ shared/      # Types, Zod schemas, constants, error codes, socket events
│  └─ ui/          # Cross-platform design tokens
├─ db/
│  └─ migrations/  # Versioned SQL (8 files; 12 tables)
├─ infra/
│  └─ docker/      # docker-compose for local Postgres + Redis
└─ docs/           # Architecture + deployment guides
```

The `@chatrix/shared` package is the **contract**. Types, Zod schemas, error codes,
and the Socket.IO event interface live there and are imported by all three apps and
the backend — there is no other source of truth.

---

## Quick start

```bash
# 1. Install deps (root)
pnpm install

# 2. Start Postgres + Redis locally
cp .env.example .env
pnpm db:up

# 3. Run migrations + seed
pnpm db:migrate
pnpm db:seed

# 4. Run everything
pnpm dev          # turbo runs backend, web, and mobile in parallel
```

Per-app:

```bash
pnpm --filter @chatrix/backend dev
pnpm --filter @chatrix/web     dev
pnpm --filter @chatrix/mobile  dev
```

---

## Phase plan

This repo is built phase-by-phase. Each phase is shippable on its own.

| Phase | Scope                                                              | Status      |
| ----- | ------------------------------------------------------------------ | ----------- |
| **1** | Architecture, monorepo, DB schema, shared contract, app skeletons  | ✅ done     |
| **2** | Auth: signup/login/refresh/logout, email verify, password reset, sessions API, email service, admin bootstrap, tests | ✅ done     |
| **3** | Realtime chat: send/receive, attachments, edit/delete, reactions, read receipts, presence, push fanout | ✅ done     |
| **4** | Mobile app UI: auth flow, chat list, chat room, friends/search, profile, settings | ✅ done     |
| **5** | Web app UI: auth, sidebar shell, chat room, friends/search, settings, public profile share-link | ✅ done     |
| **6** | Admin dashboard: stats, user search + ban/role, reports queue, audit log | ✅ done     |
| **7** | Deployment: Dockerfiles · CI · Vercel · Railway/Fly · Supabase · Upstash · EAS | ✅ done     |

Future-ready architecture (no rework needed):
- Group chats and channels (`chats.type`, `chat_members.role`)
- E2E encryption (`messages.body` accepts ciphertext, `chats.encryption_metadata`)
- Stories/status, themes marketplace, verified badges, scheduled messages

---

## Docs

- [`docs/architecture.md`](docs/architecture.md) — system diagram, data flows, scaling notes
- [`docs/deploy-backend.md`](docs/deploy-backend.md) — Railway / Fly / Render / VPS
- [`docs/deploy-web.md`](docs/deploy-web.md) — Vercel + self-host Docker
- [`docs/deploy-mobile.md`](docs/deploy-mobile.md) — EAS Build + Submit
- [`docs/deploy-database.md`](docs/deploy-database.md) — Supabase / Neon / Upstash / R2
- [`docs/production-checklist.md`](docs/production-checklist.md) — end-to-end pre-flight runbook
- Phase deliverables: [`PHASE_1`](docs/PHASE_1_DELIVERABLES.md) · [`2`](docs/PHASE_2_DELIVERABLES.md) · [`3`](docs/PHASE_3_DELIVERABLES.md) · [`4`](docs/PHASE_4_DELIVERABLES.md) · [`5`](docs/PHASE_5_DELIVERABLES.md) · [`6`](docs/PHASE_6_DELIVERABLES.md) · [`7`](docs/PHASE_7_DELIVERABLES.md) · [`Polish 4.5/5.5/7.5`](docs/PHASE_4-5-7_POLISH.md)

---

## Security posture (already wired in Phase 1)

- **Argon2id** password hashing with env-tunable cost
- **JWT access + opaque refresh tokens**, hashed in DB, rotated on every use
- **Reuse detection** — presenting a revoked refresh token signs every session out
- **Rate limiting** via `@nestjs/throttler` (global + auth-specific buckets)
- **Helmet** security headers
- **CORS** restricted to `CORS_ORIGINS`
- **Zod** validation on every body
- **Block-aware** social graph (no bypass via fresh request)
- **Stable error codes** (`@chatrix/shared/errors`) for safe client UX
- **E2E-ready schema** — `messages.body` and `chats.encryption_metadata` already in place

---

## License

UNLICENSED — proprietary. Do not redistribute.
