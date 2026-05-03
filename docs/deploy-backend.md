# Deploying the Chatrix backend

The backend is a stateless NestJS service. It needs:

- **Postgres** (managed — Supabase / Neon / RDS)
- **Redis** (managed — Upstash / Redis Cloud / ElastiCache)
- **Object storage** (Supabase Storage or S3, configured per env)
- A persistent **public URL** with **WebSocket support** (Socket.IO upgrades the HTTP connection)

The service builds to a single Docker image (`apps/backend/Dockerfile`). Pick
a host below — they're ordered by friction (lowest first).

---

## Option A — Railway *(recommended for the MVP)*

Lowest setup. Postgres + Redis can run side-by-side in the same project.

1. **Create a project** at [railway.app](https://railway.app), connect it to
   this repo.
2. Add three services to the project:
   - **Postgres** plugin (Railway provisions it; copy `DATABASE_URL`)
   - **Redis** plugin (copy `REDIS_URL`)
   - **API** — "Deploy from GitHub repo" → set Root Directory `/`, Dockerfile
     path `apps/backend/Dockerfile`
3. **Environment variables** on the API service:
   ```
   NODE_ENV=production
   PORT=4000
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   REDIS_URL=${{Redis.REDIS_URL}}
   JWT_ACCESS_SECRET=<openssl rand -base64 64>
   JWT_REFRESH_SECRET=<openssl rand -base64 64>
   CORS_ORIGINS=https://chatrix.app,https://www.chatrix.app
   WEB_APP_URL=https://chatrix.app
   STORAGE_DRIVER=supabase   # or s3 — see deploy-database.md
   SUPABASE_URL=...
   SUPABASE_SERVICE_ROLE_KEY=...
   SUPABASE_BUCKET=chatrix-media
   SMTP_HOST=...
   SMTP_PORT=587
   SMTP_USER=...
   SMTP_PASSWORD=...
   SMTP_FROM=Chatrix <noreply@chatrix.app>
   ```
4. **Migrations** — first deploy:
   ```
   railway run pnpm --filter @chatrix/backend db:migrate
   railway run pnpm --filter @chatrix/backend db:seed
   ```
5. **Promote your admin** after signing up via the web app:
   ```
   railway run env ADMIN_BOOTSTRAP_EMAIL=you@example.com \
     pnpm --filter @chatrix/backend db:bootstrap-admin
   ```
6. Add a **custom domain** (`api.chatrix.app`) in the Railway service
   settings — TLS is automatic. Confirm WebSockets work:
   ```
   wscat -c wss://api.chatrix.app/socket.io/?EIO=4&transport=websocket
   ```

**Cost note.** Railway's hobby tier auto-sleeps after inactivity, which kills
WebSocket sessions. For real users, upgrade to the Pro plan or use Fly.io
(below) which doesn't sleep.

---

## Option B — Fly.io *(recommended once you have real users)*

Always-on, multi-region, fast cold starts. Costs ~$2/mo for the smallest
machine.

1. Install: `curl -L https://fly.io/install.sh | sh && fly auth signup`
2. From the repo root, **create the app**:
   ```
   fly launch --no-deploy --copy-config --dockerfile apps/backend/Dockerfile
   ```
   Edit the generated `fly.toml`:
   ```toml
   app = "chatrix-api"
   primary_region = "iad"

   [build]
     dockerfile = "apps/backend/Dockerfile"

   [http_service]
     internal_port = 4000
     force_https = true
     auto_stop_machines = false       # keep WS connections alive
     auto_start_machines = true
     min_machines_running = 1

   [[services.ports]]
     port = 443
     handlers = ["tls", "http"]

   [[vm]]
     size = "shared-cpu-1x"
     memory = "512mb"

   [checks.health]
     port = 4000
     type = "http"
     interval = "30s"
     timeout = "5s"
     grace_period = "15s"
     method = "GET"
     path = "/v1/health"
   ```
3. **Provision Postgres + Redis** elsewhere (Supabase + Upstash recommended —
   see `deploy-database.md`). Fly *does* offer Postgres but managed providers
   have cleaner backups and connection pooling.
4. **Set secrets**:
   ```
   fly secrets set \
     DATABASE_URL=postgres://... \
     REDIS_URL=rediss://... \
     JWT_ACCESS_SECRET="$(openssl rand -base64 64)" \
     JWT_REFRESH_SECRET="$(openssl rand -base64 64)" \
     CORS_ORIGINS=https://chatrix.app \
     WEB_APP_URL=https://chatrix.app \
     STORAGE_DRIVER=supabase \
     SUPABASE_URL=... \
     SUPABASE_SERVICE_ROLE_KEY=...
   ```
5. **Deploy + migrate**:
   ```
   fly deploy
   fly ssh console -C "node dist/db/migrate.js"   # or run via release_command
   ```
6. **Custom domain**:
   ```
   fly certs create api.chatrix.app
   ```
   Add the CNAME from the dashboard to your DNS.

### Sticky sessions

Socket.IO **requires sticky sessions** when running multiple machines. Two
options:

- **One machine** — simplest; the Redis adapter we already have makes scaling
  to N machines trivial *if* the LB does sticky.
- **Sticky sessions** — Fly's `[http_service.concurrency]` + the Socket.IO
  Redis adapter (already wired in the backend, see [socket-io.adapter.ts](../apps/backend/src/realtime/socket-io.adapter.ts:1))
  let you fan out across machines. Set:
  ```toml
  [[http_service.concurrency]]
    type = "requests"
    soft_limit = 200
    hard_limit = 250
  ```
  and turn on Fly's "Sticky Cookie" routing in the dashboard.

---

## Option C — Render

Mid-friction, very stable. Render's web services support WebSockets out of
the box and its free tier doesn't sleep on background workers (only HTTP).

1. **New → Web Service** → connect repo. Pick the `apps/backend/Dockerfile`
   build path.
2. **Health check path**: `/v1/health`
3. **Environment** (paste the same vars as Railway above)
4. **Add a Postgres + Redis** via Render's add-ons OR use Supabase/Upstash —
   recommended.
5. **Custom domain** under service settings.

Render auto-redeploys on push to main when you connect the repo.

---

## Option D — VPS (DigitalOcean, Hetzner, Linode, your-own-box)

For full control / lowest cost at scale.

```bash
# On the server
docker network create chatrix
docker run -d --name redis --network chatrix --restart unless-stopped redis:7-alpine

# Backend (point DATABASE_URL at managed Postgres)
docker run -d --name chatrix-api \
  --network chatrix \
  --restart unless-stopped \
  -p 4000:4000 \
  --env-file .env.production \
  ghcr.io/<owner>/chatrix-backend:latest
```

Front it with Caddy or Nginx for TLS:

```
# Caddyfile
api.chatrix.app {
  reverse_proxy localhost:4000
  encode gzip
  # WebSocket upgrade is automatic in Caddy.
}
```

Restart Caddy, point DNS, done.

---

## Health + observability

- **`GET /v1/health`** returns `{status: "ok|degraded", pg, redis, time}`.
  Any host's health check should hit this.
- **Logs** — Pino is wired via Nest's logger. Set `LOG_LEVEL=info` in
  production. Pipe to stdout (every host above captures stdout to its log
  stream).
- **Metrics** — out of scope for Phase 7. The hooks are clean; bolt on
  OpenTelemetry or `pino-elasticsearch` later.

---

## Database migrations on deploy

The image bundles `db/migrations/` and the migration runner. Run before the
new image starts serving traffic:

- **Railway**:  add `"start": "node dist/db/migrate.js && node dist/main.js"`
  to the API service start command (or use Railway's "deploy hook").
- **Fly**:    add `release_command = "node dist/db/migrate.js"` to `fly.toml`.
- **Render**: "Pre-Deploy Command" field.
- **VPS**:    `docker exec chatrix-api node dist/db/migrate.js` after each pull.

The runner is idempotent — re-running is a no-op. Versions are tracked in
`_migrations`.

---

## Rollback

The image is immutable per commit SHA (CI tags it that way). To roll back:

- **Railway / Render** — redeploy the previous commit from the dashboard.
- **Fly** — `fly releases list && fly releases rollback <version>`.
- **VPS** — `docker pull ghcr.io/<owner>/chatrix-backend:<old-sha> && docker restart chatrix-api`.

DB migrations are *not* automatically reversed. Schema rollback is manual —
in practice, every migration file should be backwards-compatible with the
prior code (we hold this discipline by always doing the additive change in
one release and the cleanup in the next).
