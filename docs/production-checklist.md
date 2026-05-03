# Production checklist

A pre-flight runbook for shipping Chatrix to real users. Work top-down — each
section assumes the previous one is done.

---

## 1. Secrets

- [ ] Generate fresh JWT secrets — never reuse dev values:
  ```bash
  ./infra/scripts/generate-secrets.sh > .env.production
  ```
- [ ] Store secrets in your platform's secret manager — Railway/Fly/Vercel
  variables, **not** in `.env` files committed to git.
- [ ] **Rotate** if any of these touch a public surface (a leaked log, an
  open issue, anything):
  - `JWT_ACCESS_SECRET`
  - `JWT_REFRESH_SECRET`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `S3_SECRET_ACCESS_KEY`
  - `SMTP_PASSWORD`
- [ ] Confirm `.env*` (except `.env.example`) is in [`.gitignore`](../.gitignore:18).

## 2. Domains + DNS

- [ ] Buy `chatrix.app`. Set DNS:
  - `chatrix.app`        → Vercel (web app)
  - `www.chatrix.app`    → 308 redirect to apex (set in Vercel)
  - `api.chatrix.app`    → backend host (Railway / Fly / Render)
  - `cdn.chatrix.app`    → Cloudflare CDN in front of R2/S3 (optional)
- [ ] Add the apex to **Vercel** + the API host to your backend platform —
  TLS is automatic on all four.
- [ ] Verify the `@username` redirect works: `curl -I https://chatrix.app/@kamsy`
  should 307/308 to `/u/kamsy`.
- [ ] Confirm WebSockets reach the API:
  ```bash
  npm -g i wscat
  wscat -c "wss://api.chatrix.app/socket.io/?EIO=4&transport=websocket"
  # expect: 0{"sid":"...","upgrades":[],"pingInterval":25000,"pingTimeout":30000}
  ```

## 3. Backend env

Set on Railway / Fly / Render:

```
NODE_ENV=production
PORT=4000

DATABASE_URL=postgres://...
REDIS_URL=rediss://...

JWT_ACCESS_SECRET=<from generate-secrets.sh>
JWT_REFRESH_SECRET=<from generate-secrets.sh>
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d

CORS_ORIGINS=https://chatrix.app,https://www.chatrix.app
WEB_APP_URL=https://chatrix.app

STORAGE_DRIVER=supabase           # or s3
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_BUCKET=chatrix-media

SMTP_HOST=smtp.postmarkapp.com    # or sendgrid / ses / mailgun
SMTP_PORT=587
SMTP_USER=...
SMTP_PASSWORD=...
SMTP_FROM=Chatrix <noreply@chatrix.app>

EXPO_ACCESS_TOKEN=expo_xxx        # for authenticated mobile push fanout
WEB_PUSH_VAPID_PUBLIC=...         # only if web-push driver is enabled
WEB_PUSH_VAPID_PRIVATE=...
WEB_PUSH_CONTACT=mailto:admin@chatrix.app

RATE_LIMIT_GLOBAL_RPM=600
RATE_LIMIT_AUTH_RPM=20

ADMIN_BOOTSTRAP_EMAIL=you@example.com
```

## 4. Database setup

- [ ] Provision Postgres (see `deploy-database.md`)
- [ ] Run migrations:
  ```bash
  DATABASE_URL=... pnpm --filter @chatrix/backend db:migrate
  ```
- [ ] Run seed (reserved usernames):
  ```bash
  DATABASE_URL=... pnpm --filter @chatrix/backend db:seed
  ```
- [ ] **Bootstrap your admin** — sign up via the web app first, then:
  ```bash
  DATABASE_URL=... ADMIN_BOOTSTRAP_EMAIL=you@example.com \
    pnpm --filter @chatrix/backend db:bootstrap-admin
  ```
- [ ] Schedule daily backups (most managed providers do this automatically;
  verify in the dashboard).

## 5. Storage bucket

- [ ] Create the bucket (`chatrix-media` by default).
- [ ] Set public-read on objects (**not** the bucket itself for S3 — use a
  bucket policy that allows `s3:GetObject` on `chatrix-media/*`).
- [ ] CORS: allow `PUT` from your web origin (config in `deploy-database.md`).
- [ ] Optional: put a CDN in front (Cloudflare for R2/S3, automatic for
  Supabase).

## 6. Email deliverability

- [ ] Pick a transactional provider — Postmark, SendGrid, AWS SES, Mailgun.
  Postmark has the highest reputation out of the box.
- [ ] Verify the sending domain — set DKIM + SPF + DMARC records (the
  provider's onboarding walks you through it).
- [ ] Test verification + reset emails actually arrive:
  ```bash
  curl -X POST https://api.chatrix.app/v1/auth/password/forgot \
    -H 'content-type: application/json' \
    -d '{"email":"you@example.com"}'
  ```
  Check inbox + spam.

## 7. Web app

- [ ] Set Vercel env vars (per `deploy-web.md`).
- [ ] Add the production domain.
- [ ] Confirm the build succeeds — first deploy can take 4-5 min.
- [ ] Test the brand share-link: open `https://chatrix.app/@kamsy` in a
  fresh browser → should render the public profile.
- [ ] Check Open Graph: paste `https://chatrix.app/@kamsy` into a Slack
  message → should preview with name + avatar.

## 8. Mobile app

- [ ] Run `eas init` from `apps/mobile` to provision the project.
- [ ] Add the EAS project ID to `app.json`.
- [ ] Run a `preview` profile build first; install via TestFlight + Play
  Internal — verify chat works end-to-end against production API.
- [ ] Submit to App Store + Play Store via `eas submit` (see
  `deploy-mobile.md`).

## 9. Observability

- [ ] Health endpoint reachable: `curl https://api.chatrix.app/v1/health`
- [ ] Backend logs are streaming to your platform's log viewer.
- [ ] Set up uptime alerts on the health endpoint — Better Stack, Uptime
  Robot, or Pingdom (all have free tiers).
- [ ] Add an error tracker — Sentry is standard. The Nest filter (see
  [exception.filter.ts](../apps/backend/src/common/filters/exception.filter.ts:1))
  is the natural integration point.

## 10. Security smoke tests

Run these the day before launch:

- [ ] **Auth boundary** — `curl https://api.chatrix.app/v1/users/me` (no
  token) → 401.
- [ ] **Rate limit** — fire 25 logins in a minute; the 21st should 429.
- [ ] **CORS** — `curl -H 'origin: https://attacker.example' https://api.chatrix.app/v1/health`
  → no `access-control-allow-origin: *` in the response.
- [ ] **Helmet headers** — `curl -I https://api.chatrix.app/v1/health` should
  include `x-frame-options: DENY`, `x-content-type-options: nosniff`, etc.
- [ ] **Sessions revoke** — sign in on two devices → revoke device A from
  device B's settings → confirm A is logged out within ~15 minutes (next
  access-token expiry).
- [ ] **Admin gate** — non-admin → `/admin` should render the "Admin only"
  card, not the dashboard.

## 11. Day-of-launch

- [ ] Bump rate limits to be more permissive while you watch the metrics
  (Phase 7+: dynamic per-user limits).
- [ ] Have a rollback plan — know which commit SHA is the previous
  good build (`fly releases` / Railway dashboard / Vercel).
- [ ] Pre-write the support reply for the most likely first issue: "Email
  didn't arrive" — usually fixed by checking spam + verifying DNS DKIM.
- [ ] Sleep before the launch. Don't deploy at 2 AM.

---

## 12. After launch

- [ ] Watch the **admin overview** dashboard — it polls every 15s.
- [ ] Watch backend logs for unhandled errors (the exception filter keeps
  them well-formatted).
- [ ] Watch Postgres slow-query log — if any query exceeds 200 ms, file an
  issue with `EXPLAIN ANALYZE` output.
- [ ] Run a backup-restore drill within the first week — make sure DR works
  before you need it.
