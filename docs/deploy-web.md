# Deploying the Chatrix web app

The web app is a Next.js 14 (App Router) application. **Vercel is the
recommended host** — same company as Next.js, zero-config monorepo support,
edge runtime, and free for hobby usage.

A self-host Dockerfile is provided as the fallback path.

---

## Option A — Vercel *(recommended)*

### 1. Connect the repo

1. [vercel.com/new](https://vercel.com/new) → import the repo.
2. **Framework preset** auto-detects Next.js.
3. **Root Directory** → `apps/web`.
4. **Install command** override:
   ```
   pnpm install --frozen-lockfile
   ```
5. **Build command** (default, no override needed):
   ```
   next build
   ```
6. **Output directory**: leave default.

Vercel auto-detects pnpm from `packageManager` in [package.json](../package.json:6).
Workspace deps (`@chatrix/shared`, `@chatrix/ui`) resolve from the monorepo
root automatically.

### 2. Environment variables

Set in the project's *Settings → Environment Variables*:

```
NEXT_PUBLIC_API_URL=https://api.chatrix.app
NEXT_PUBLIC_WS_URL=wss://api.chatrix.app
NEXT_PUBLIC_APP_URL=https://chatrix.app
```

⚠️ All three are **inlined at build time** (Next's `NEXT_PUBLIC_*` rule).
Changing them requires a redeploy.

### 3. Custom domains

- `chatrix.app` → primary
- `www.chatrix.app` → 308 redirect to apex
- The brand share-link (`chatrix.app/@username`) is a Next redirect rule
  defined in [next.config.mjs](../apps/web/next.config.mjs:18) — it works
  automatically once the domain is attached.

### 4. Add the backend's CORS origin

In the backend's environment (Railway / Fly / Render):
```
CORS_ORIGINS=https://chatrix.app,https://www.chatrix.app
```

Otherwise the browser blocks the API calls — easy to miss.

### 5. Preview deploys

Every PR gets a preview URL. The default preview env points at production
API; override per-environment if you maintain a staging backend:

| Environment | NEXT_PUBLIC_API_URL                |
| ----------- | ---------------------------------- |
| Production  | `https://api.chatrix.app`          |
| Preview     | `https://staging-api.chatrix.app`  |
| Development | `http://localhost:4000`            |

---

## Option B — Self-host with Docker

Use [`apps/web/Dockerfile`](../apps/web/Dockerfile) — it builds on top of
Next.js's `output: "standalone"` (already enabled in `next.config.mjs`) so
the runtime image is ~120 MB.

Build:
```bash
docker build \
  -f apps/web/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=https://api.chatrix.app \
  --build-arg NEXT_PUBLIC_WS_URL=wss://api.chatrix.app \
  --build-arg NEXT_PUBLIC_APP_URL=https://chatrix.app \
  -t chatrix-web:latest \
  .
```

Run behind a TLS-terminating proxy (Caddy / Nginx / Cloudflare):
```bash
docker run -d --name chatrix-web -p 3000:3000 --restart unless-stopped chatrix-web:latest
```

Point your reverse proxy at port 3000.

### Caddy config (one-liner per domain)
```
chatrix.app {
  reverse_proxy localhost:3000
  encode gzip
}
www.chatrix.app {
  redir https://chatrix.app{uri} permanent
}
```

---

## Option C — Cloudflare Pages

Pages supports Next.js via [`@cloudflare/next-on-pages`](https://github.com/cloudflare/next-on-pages).

Trade-offs vs Vercel:
- **Pro**: free egress, edge-everywhere, generous build minutes
- **Con**: requires `next-on-pages` adapter; some Next features (server-component
  streaming, the App Router edge runtime) need extra config; the public-profile
  page (`/u/[username]`) uses `dynamic = "force-dynamic"` which works on Pages
  but cold-starts slower than Vercel.

Use Vercel until the Vercel free-tier limits become a problem; Cloudflare is
the obvious next step.

---

## Build-time vs runtime env: a gotcha

Next inlines `NEXT_PUBLIC_*` at **build time**. That means:

- Vercel: redeploy after changing them (Vercel does this automatically when
  you save a var).
- Self-host: pass `--build-arg` at `docker build` time. Re-running the same
  image with new env vars *won't* pick them up.

If you need runtime override, fall back to fetching them via a `/config.json`
served by the backend. We don't do this currently — keeping the static
inline approach is simpler and faster.

---

## Health, logging, monitoring

- Vercel ships with built-in Web Vitals + Edge logs in the dashboard.
- For Sentry / Datadog / Honeybadger, use the Next.js plugin and set
  `NEXT_PUBLIC_SENTRY_DSN`. We haven't included this — add when you have
  real users.

---

## Domain notes for the brand share-link

`chatrix.app/@kamsy` should land on the public profile page. The Next
config redirects `/@username` → `/u/username` (see
[next.config.mjs:19](../apps/web/next.config.mjs:19)) — Vercel honours this
at the edge, no extra config.

If you serve through Cloudflare in front of Vercel, double-check that
Cloudflare doesn't strip the `@` from the path (it shouldn't — but the
URL-encoded `%40` form is sometimes safer to share in marketing copy).
