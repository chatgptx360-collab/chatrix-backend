# Phase 7 — Deliverables

Deployment. Real configs (Dockerfiles, EAS profiles, CI workflow) plus
deep-dive guides for every host. The goal: anyone with the repo can ship
Chatrix to production without re-deriving how it fits together.

---

## ✅ Shipped

### Real config files

| File                                | Purpose                                                  |
| ----------------------------------- | -------------------------------------------------------- |
| `apps/backend/Dockerfile`           | 4-stage prod image (~180 MB), `dumb-init` PID 1, healthcheck on `/v1/health`, non-root user |
| `apps/backend/.dockerignore`        | Strip dev cruft from the build context                   |
| `apps/web/Dockerfile`               | Self-host fallback (Vercel is recommended) — Next standalone output, ~120 MB |
| `apps/web/.dockerignore`            | Same                                                     |
| `apps/mobile/eas.json`              | 3 build profiles (development/preview/production), submit profile for App Store + Play |
| `.github/workflows/ci.yml`          | CI on every PR + main: lint, typecheck, tests with PG+Redis services, Docker image build (push on main) |
| `infra/scripts/generate-secrets.sh` | Generates fresh `JWT_ACCESS_SECRET` + `JWT_REFRESH_SECRET` |

Plus one config tweak: `apps/web/next.config.mjs` now sets
`output: "standalone"` so the self-host Dockerfile produces a tiny runtime
tree.

### Deployment guides (`docs/`)

| Guide                       | What it covers                                                          |
| --------------------------- | ----------------------------------------------------------------------- |
| `deploy-backend.md`         | Railway, Fly.io, Render, VPS+Caddy. WS sticky-session notes. Migration & rollback strategy. |
| `deploy-web.md`             | Vercel (recommended), self-host Docker, Cloudflare Pages. NEXT_PUBLIC build-time gotcha. |
| `deploy-mobile.md`          | EAS init, build profiles, App Store + Play metadata, OTA updates, push token registration. |
| `deploy-database.md`        | Supabase / Neon / RDS for Postgres; Upstash / Redis Cloud / ElastiCache for Redis; Supabase Storage / S3 / R2 for media. Cost overview at the bottom. |
| `production-checklist.md`   | Ordered runbook from secrets through day-of-launch and post-launch monitoring. |

---

## CI/CD shape

The GitHub Actions workflow has three jobs:

```
on push/PR
   │
   ├─ check (lint + typecheck) ──────┐
   ├─ test  (vitest with PG+Redis) ──┤
   │                                 ▼
   └────────────────►  docker-backend (build; push to GHCR on main)
```

- Lint + typecheck run on every PR (≤2 min).
- Tests spin up Postgres + Redis as services, run migrations, then the
  vitest suite (≤4 min). Hits the security tests we wrote in Phase 2.
- Backend image builds on every PR; **only pushes to GHCR on main** so PRs
  validate the Dockerfile without bloating the registry.
- Layer caching via GitHub Actions cache — incremental builds are ~30s.

---

## Hosting recommendations (concise)

| Component   | MVP-friendly          | Scale-friendly        |
| ----------- | --------------------- | --------------------- |
| Backend     | Railway               | Fly.io (multi-region) |
| Web         | Vercel                | Vercel (still good)   |
| Postgres    | Supabase Pro          | Supabase Pro + replica or AWS RDS |
| Redis       | Upstash               | Upstash               |
| Storage+CDN | Supabase Storage      | Cloudflare R2 + Cloudflare CDN |
| Mobile      | EAS Hobby             | EAS Production        |

A working production stack with this setup runs around **$45/mo at 10k DAU**;
see the cost table in `deploy-database.md`.

---

## Brand share-link infrastructure

The `chatrix.app/@kamsy` pattern works in two places:

1. **Web** — `next.config.mjs` redirects `/@:username` → `/u/:username`.
   Vercel honours this at the edge with no extra config.
2. **Mobile (Universal Links / App Links)** — when the OS recognizes
   `chatrix.app/@kamsy`, it opens the app instead of the browser. This
   needs an `apple-app-site-association` file at
   `https://chatrix.app/.well-known/apple-app-site-association` and an
   Android `assetlinks.json` at the same well-known path. **TODO Phase 7.5**
   — those two files are mechanical to write but specific to your team's
   bundle IDs; documented in `deploy-mobile.md`.

---

## What's intentionally not here

- **Terraform / Pulumi** — most teams never get to "infrastructure as code"
  for this stack; the providers have good dashboards. If you grow into it,
  start with [Pulumi's Vercel + Fly providers](https://www.pulumi.com/registry/).
- **Kubernetes manifests** — over-engineered for a single-service backend.
  Fly + Railway already give you orchestration. Move to k8s only if you
  start adding many backend services.
- **Datadog / Honeycomb / Sentry config** — listed in the production
  checklist but not pre-wired. Pick whichever your team uses; the Nest
  exception filter is the integration point.
- **WAF / DDoS** — Cloudflare in front of the API gets you 90% of this for
  free. Consider it the moment you have a competitor or a controversial
  user-base.

---

## What you can do now (with the install path unblocked)

```bash
# 1. CI runs locally
docker build -f apps/backend/Dockerfile -t chatrix-backend .

# 2. Spin up production infra (your favorite host, see deploy-backend.md)

# 3. Ship the web app
cd apps/web && vercel --prod

# 4. Ship the mobile app
cd apps/mobile && eas build --profile production --platform all

# 5. Walk the production-checklist.md before the first user signs up
```

---

## Final repo state

```
chatrix/
├─ .github/workflows/ci.yml          # CI: lint, typecheck, tests, Docker
├─ apps/
│  ├─ backend/
│  │  ├─ Dockerfile                  # production image
│  │  ├─ .dockerignore
│  │  └─ src/...                     # NestJS API + Socket.IO + admin
│  ├─ web/
│  │  ├─ Dockerfile                  # self-host fallback
│  │  ├─ next.config.mjs             # output: 'standalone'
│  │  └─ src/...                     # Next.js app + admin
│  └─ mobile/
│     ├─ eas.json                    # build + submit profiles
│     ├─ app.json
│     └─ app/...                     # Expo Router screens
├─ packages/
│  ├─ shared/                        # types, schemas, errors, events
│  └─ ui/                            # cross-platform tokens
├─ db/migrations/                    # 8 ordered SQL files
├─ docs/
│  ├─ architecture.md
│  ├─ deploy-backend.md              # ★
│  ├─ deploy-web.md                  # ★
│  ├─ deploy-mobile.md               # ★
│  ├─ deploy-database.md             # ★
│  ├─ production-checklist.md        # ★
│  └─ PHASE_{1..7}_DELIVERABLES.md
├─ infra/
│  ├─ docker/docker-compose.yml      # local dev (Postgres + Redis)
│  └─ scripts/generate-secrets.sh    # ★
└─ README.md
```

(★ = added in this phase)

---

## All seven phases — done

| Phase | Scope                                                                | Status |
| ----- | -------------------------------------------------------------------- | ------ |
| 1     | Architecture, monorepo, DB schema, shared contract, app skeletons    | ✅     |
| 2     | Auth: signup/login/refresh/logout, email verify, password reset, sessions API, email service, admin bootstrap, tests | ✅ |
| 3     | Realtime chat: send/receive, attachments, edit/delete, reactions, read receipts, presence, push fanout | ✅ |
| 4     | Mobile app UI: auth flow, chat list, chat room, friends/search, profile, settings | ✅ |
| 5     | Web app UI: auth, sidebar shell, chat room, friends/search, settings, public profile share-link | ✅ |
| 6     | Admin dashboard: stats, user search + ban/role, reports queue, audit log | ✅ |
| 7     | Deployment: Vercel · Railway/Fly · Supabase · EAS                    | ✅     |

The MVP is shippable as-is. Phase 4.5 / 5.5 / 7.5 cover the small UX gaps
flagged honestly in each phase's deliverables doc — none are gating.
