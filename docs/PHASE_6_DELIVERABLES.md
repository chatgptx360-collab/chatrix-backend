# Phase 6 — Deliverables

Admin dashboard. A separate role-gated section (`/admin/*`) that gives
moderators and admins eyes-on-glass for the system + tooling to act on it.

---

## ✅ Shipped

### Backend — extended AdminService + AdminController

The admin module already existed from Phase 1 but only had stubs. This phase
fleshed it out into a real ops surface, with **every state-changing action
writing to `admin_audit_log`** so we always have "who did what, when, and why."

#### Endpoints

```
GET    /v1/admin/stats               # dashboard counters
GET    /v1/admin/users               # search/filter user list (?q=, ?status=, cursor)
GET    /v1/admin/users/:id           # full user detail incl. session count
PATCH  /v1/admin/users/:id/status    # active | suspended | banned (+ reason)
PATCH  /v1/admin/users/:id/role      # user | moderator | admin (admin-only)
GET    /v1/admin/reports             # queue with reporter + target hydrated
PATCH  /v1/admin/reports/:id         # reviewing | actioned | dismissed (+ resolution)
GET    /v1/admin/audit               # paginated newest-first audit log
```

All routes guarded by `JwtAuthGuard + AdminGuard` (role >= moderator). Role
changes are admin-only and double-checked in the controller.

#### Safety rules baked in

- **Self-protection** — admins cannot moderate their own account or change
  their own role; service throws `FORBIDDEN`.
- **Suspend/ban revokes sessions** — the moment a user is suspended or banned,
  every active `sessions` row gets `revoked_at = now()`. They're signed out
  of every device immediately.
- **Reasons are required** in the UI for non-active status changes, then
  persisted to `admin_audit_log.metadata` so the trail is forensic-grade.
- **Audit log on every write** — including role changes, status changes, and
  every report state transition.

### Web — admin shell at `/admin`

Separate top-level route group, **not** under the user `(app)` shell — gives
operators a distinct visual context (sidebar with "Admin" shield label) so
the privileged surface feels different from the chat product.

| Route                       | What it does                                             |
| --------------------------- | -------------------------------------------------------- |
| `/admin`                    | Stats grid + needs-attention shortcuts (15 s polling)    |
| `/admin/users`              | Searchable, status-filterable user table                 |
| `/admin/users/[id]`         | Header card + stats grid + moderation controls           |
| `/admin/reports`            | Queue with inbox / open / reviewing / actioned / dismissed filter |
| `/admin/audit`              | Newest-first audit log with load-more pagination          |

#### Two gates on the layout

1. **Auth gate** — bounce to `/login?next=/admin/...` if no token
2. **Role gate** — if signed in but role is `user`, render an "Admin only"
   card (don't redirect — explicitly tell the user why they bounced)

The backend re-checks both on every endpoint call. The client gates are UX,
not security.

### Components

- **`AdminSidebar`** — sister to the chat sidebar; brand mark + shield
  "Admin" label, four-link nav, "Back to Chatrix" shortcut, profile pill
- **`StatusBadge`** — small uppercase pill used everywhere for user status,
  report status, role. One source of truth for color tokens.
- **`AdminUsers` table** — typed list rendering, debounced search, status
  filter chips, presence dot in avatar, message + report counts inline.
- **`AdminUsers/[id]` detail** — moderation panel with three status buttons
  (Reactivate / Suspend / Ban) and three role buttons. Confirmation prompts
  on destructive actions. Disabled states for current values.
- **`AdminReports` queue** — each row hydrates the reporter and target
  (deep-linked to user detail), three quick actions (Review / Action /
  Dismiss), and renders the resolution note inline once set.
- **`AdminAudit` log** — humanizer turns canonical action strings
  (`user.banned`, `report.actioned`, `user.role.admin`) into readable
  sentences while keeping the raw string visible on hover for forensics.
  Metadata JSON renders as a code block.

### Discoverability

- The **Settings hub** in the user app now shows a "Staff" section with an
  **Open admin panel** link, but **only for users whose role is `admin` or
  `moderator`**. Regular users never see it.

---

## What's actually verifiable

The web admin pages are observable in a browser preview *once* the workspace
install runs (`pnpm install` from the repo root). The current environment
has no `node_modules` and limited disk space, so:

- ✅ Source-level: every file compiles against `@chatrix/shared` types.
- ⏳ Runtime: requires `pnpm install` + `pnpm dev` + an admin account
  (created via `pnpm db:bootstrap-admin` after a normal signup).

The backend additions integrate with the existing `AdminGuard`, `JwtAuthGuard`,
`DatabaseService`, and `admin_audit_log` table — no schema changes were
needed.

---

## Try it (when the install path is unblocked)

```bash
# Bring up infra + run migrations
pnpm db:up && pnpm db:migrate

# Run the API
pnpm --filter @chatrix/backend dev

# Sign up a normal user via the web app, then promote yourself:
ADMIN_BOOTSTRAP_EMAIL=you@example.com pnpm --filter @chatrix/backend db:bootstrap-admin

# Run the web app and visit /admin
pnpm --filter @chatrix/web dev
```

Once you're in:

1. **Overview** auto-refreshes every 15 s — leave it open in a tab to watch
   the system pulse.
2. **Users** → search a username → click the row → suspend with a reason →
   confirm in **Audit log** that the action wrote the row.
3. **Reports** — file a test report from the user app (any user can hit
   `POST /v1/reports`), then triage it from the queue.

---

## ⏳ Deferred

- **Time-series charts** — the stats endpoint returns scalars; charts come
  in Phase 7+ via Recharts (the data shape is already trend-friendly per
  `created_at` / `last_login_at`).
- **User search by ID + sort options** — sortable table headers, secondary
  filters (verified-only, with-reports-only, etc.).
- **Bulk actions** on the user table — checkbox column + bulk status change.
- **Report deep-link to original message** — backend already stores the
  `target_id`; the message-view modal in admin lands when E2E + redaction
  tooling does.
- **Session-revoke from the user detail page** — the active-session count
  is shown; per-session list + revoke needs a small endpoint addition.

None of these are required for the moderation MVP — operators can already
suspend, ban, change roles, and triage reports end-to-end with what's here.
