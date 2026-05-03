# Phase 2 — Deliverables

Auth completion. What landed on top of Phase 1's signup/login/refresh.

---

## ✅ Shipped

### Email service (`apps/backend/src/modules/email/`)

- `EmailService` — nodemailer wrapper with three modes:
  - **SMTP** when `SMTP_HOST` + `SMTP_PORT` are set
  - **JSON** for local dev (no SMTP) — emails are logged to stdout with the link visible
  - **Disabled** in `NODE_ENV=test`
- `templates.ts` — three transactional emails:
  - **Verify email** — sent on signup
  - **Reset password** — sent on `/auth/password/forgot`
  - **Welcome** — available for future onboarding flows
- Templates are inline-styled (Gmail/Outlook compatible), brand-gradient CTA,
  full plain-text fallback, and HTML-escape every interpolated field.
- `EmailModule` is `@Global()` — every feature can inject `EmailService` directly.

### Auth flow completion

- **Signup** now triggers the verification email automatically (fire-and-forget;
  failure is logged but doesn't block signup — user can resend).
- **`POST /v1/auth/verify-email/resend`** — authenticated endpoint, throttled 3/min,
  short-circuits if already verified.
- **`POST /v1/auth/password/forgot`** — full implementation. Always returns `{ ok: true }`
  to prevent email enumeration. Generates 1h single-use token, sends email.
- **`POST /v1/auth/password/reset`** — consumes token, hashes new password,
  **revokes every active session** (the safe default if a phisher triggered the reset).
  Throttled 5/min.
- All token tables (`email_verification_tokens`, `password_reset_tokens`) use
  `consumed_at` to prevent replay.

### Sessions API (`apps/backend/src/modules/sessions/`)

Powers the "Logged-in devices" / security UX surface.

- **`GET /v1/sessions`** — list active sessions for the current user
- **`POST /v1/sessions/with-current`** — same list, but the row matching the caller's
  refresh token is flagged `isCurrent: true`
- **`DELETE /v1/sessions/:id`** — revoke one device
- **`POST /v1/sessions/revoke-others`** — revoke every session except the current one
  (the "sign out everywhere except this device" button)

Sessions join `devices` so the UI shows platform + device name + IP + last-used.

### Admin bootstrap

- **`pnpm --filter @chatrix/backend db:bootstrap-admin`** — promotes the user matching
  `ADMIN_BOOTSTRAP_EMAIL` to `role=admin`. Idempotent. Won't create the user — sign up
  through the normal flow first so the password hash uses live argon2 cost params.

### Dev seed

- **`pnpm db:seed`** — creates the `reserved_usernames` table and inserts ~10 reserved
  brand/system handles (chatrix, admin, support, …). Safe to re-run.

### Tests (`vitest`)

Three suites covering the security-critical surface:

- **`password.service.spec.ts`** — argon2id format, verify (right/wrong/malformed),
  salt randomness. Real argon2, no mocks; ~50 ms.
- **`token.service.spec.ts`** — refresh-token rotation:
  - unknown token → null
  - happy path → row marked revoked
  - expired token → null
  - **reuse detection** — replaying a revoked token revokes ALL the user's sessions
- **`templates.spec.ts`** — links + usernames render correctly,
  HTML injection in usernames is escaped.

Run: `pnpm --filter @chatrix/backend test`

---

## API surface added in Phase 2

```
POST   /v1/auth/verify-email          # consume verification token
POST   /v1/auth/verify-email/resend   # resend verification email (auth)
POST   /v1/auth/password/forgot       # request reset email
POST   /v1/auth/password/reset        # consume reset token + revoke all sessions

GET    /v1/sessions                   # list my active sessions
POST   /v1/sessions/with-current      # same list, with isCurrent marker
DELETE /v1/sessions/:id               # revoke one
POST   /v1/sessions/revoke-others     # revoke everywhere except current
```

---

## ⏳ Still deferred

- **Google / Apple Sign-In** — schema is ready (we'd add a `oauth_identities` table);
  not on the critical path for the messaging MVP.
- **2FA / TOTP** — schema slot reserved; planned for Phase 6 alongside admin tooling.
- **Email change flow** — the column allows it; no UI yet.
- **Push-notification fanout worker** — Phase 3 (realtime).

---

## Local dev workflow

```bash
# Start infra
pnpm db:up
pnpm db:migrate
pnpm db:seed

# Run the API
pnpm --filter @chatrix/backend dev

# Sign up via curl, then:
ADMIN_BOOTSTRAP_EMAIL=you@example.com pnpm --filter @chatrix/backend db:bootstrap-admin

# Run security tests
pnpm --filter @chatrix/backend test
```

When SMTP isn't configured, the verification + reset links appear in the backend
logs — copy them straight into the browser to test the flow end-to-end.
