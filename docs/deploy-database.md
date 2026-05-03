# Database + Redis + Object Storage

The backend talks to three external systems: **Postgres** (primary state),
**Redis** (presence + Socket.IO fanout), and **object storage** (uploaded
media). Pick a provider per box.

---

## Postgres

### Option A — Supabase *(recommended for MVP)*

[supabase.com](https://supabase.com) — free tier covers 500 MB + 2 GB egress;
$25/mo Pro tier covers most early-stage products.

**Setup:**
1. Create a project; Supabase auto-provisions Postgres 15 + connection pooler.
2. **Database → Settings → Connection string**:
   - Use the **session-mode** pooler URL for the app: `postgresql://postgres.<ref>:<pass>@aws-0-<region>.pooler.supabase.com:5432/postgres`
   - Use the **transaction-mode** pooler (`:6543`) only for ad-hoc tools that
     don't need session-level state (the app uses session features like
     `LISTEN/NOTIFY`-friendly transactions).
3. **Required extensions** — enable from *Database → Extensions*:
   - `pgcrypto`, `citext`, `pg_trgm`, `btree_gin`
   - All four are pre-shipped on Supabase; just toggle them on.
4. Set `DATABASE_URL` on the backend host to the session-mode pooler URL.

**Migration**: from your laptop, run:
```bash
DATABASE_URL=postgres://... pnpm --filter @chatrix/backend db:migrate
```
The runner is idempotent and tracks state in the `_migrations` table.

### Option B — Neon

[neon.tech](https://neon.tech) — Postgres with branching (a separate DB
per PR, free). Excellent for staging environments.

```bash
neonctl projects create --name chatrix
neonctl databases create chatrix
neonctl roles create app
```

Same migration command; same connection-string format.

### Option C — RDS / Cloud SQL / Azure Postgres

Standard managed Postgres. Make sure to:
- Enable `pgcrypto`, `citext`, `pg_trgm`, `btree_gin` (all are shipped, may
  not be enabled by default).
- Use SSL — the backend's pg config sends `rejectUnauthorized: false` in
  production, which works with managed providers' default certs.

### Sizing

| Stage              | DB tier (RAM)   | Connection pool size  |
| ------------------ | --------------- | --------------------- |
| MVP / first 1k DAU | 1 GB            | 20                    |
| 10k DAU            | 4 GB            | 40                    |
| 100k DAU           | 16 GB + replica | 100 + read replica    |

The hot path is `messages_chat_created_idx (chat_id, created_at DESC)` —
already in the schema. At 10k DAU expect ~30 reads + ~5 writes per second;
modest by Postgres standards.

---

## Redis

### Option A — Upstash *(recommended)*

[upstash.com](https://upstash.com) — serverless Redis, pay-per-request, free
tier covers 10 k commands/day.

**Important**: enable **Eviction = `allkeys-lru`** on the database (the
backend's [redis.module.ts](../apps/backend/src/redis/redis.module.ts) sets
this when running locally — Upstash needs it set in the dashboard).

The Socket.IO Redis adapter and presence cache work over Upstash without
modifications. Set `REDIS_URL=rediss://default:<pass>@<region>.upstash.io:6379`
(note the `s` — TLS is required).

### Option B — Redis Cloud

[redis.com/redis-enterprise-cloud](https://redis.com/redis-enterprise-cloud) —
30 MB free tier, good for testing. For production go with Upstash unless you
need RedisJSON / RediSearch (we don't).

### Option C — ElastiCache / Memorystore

Standard managed Redis on AWS / GCP. Use VPC peering — Redis traffic should
not traverse the public internet at scale. Enable in-transit + at-rest
encryption.

### What we use Redis for

| Purpose                        | Key shape                     | TTL   |
| ------------------------------ | ----------------------------- | ----- |
| Online/away presence           | `presence:user:<uuid>`        | 90 s  |
| Per-user socket set            | `presence:sockets:<uuid>`     | 90 s  |
| Socket.IO pub/sub adapter      | (managed by adapter library)  | —     |
| Rate limit (auth bucket)       | `throttler:...`               | 60 s  |

Memory footprint is tiny — even at 100 k concurrent users, presence keys are
~10 MB. Upstash's per-command billing is cheaper than reserved Redis Cloud
until you cross ~50 commands/sec sustained.

---

## Object storage (media uploads)

The backend's storage layer is pluggable — see
[storage.interface.ts](../apps/backend/src/modules/media/storage/storage.interface.ts:1).

### Option A — Supabase Storage *(recommended if you're already on Supabase)*

Free tier: 1 GB. Pro: 100 GB included.

```bash
# Create the bucket once via the dashboard:
#   Storage → New Bucket → name: chatrix-media → public: ON
```

Set:
```
STORAGE_DRIVER=supabase
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # NOT the anon key
SUPABASE_BUCKET=chatrix-media
```

### Option B — AWS S3 (or any S3-compatible: R2, B2, MinIO)

Use Cloudflare R2 if cost matters — zero egress, $0.015/GB stored, S3-compatible.

```
STORAGE_DRIVER=s3
S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com   # omit for AWS
S3_REGION=auto                                           # `us-east-1` for AWS
S3_BUCKET=chatrix-media
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
```

The driver hand-rolls SigV4 PUT presigning — no AWS SDK in the bundle (see
[s3.driver.ts](../apps/backend/src/modules/media/storage/s3.driver.ts:1)).

### Bucket policy

For both providers:
- **Public read** — uploaded media is referenced by the public CDN URL;
  privacy is enforced at the API layer (you must be in the chat to see
  the message that links to the media).
- **CORS** — allow PUT from your web origin so the browser can upload
  directly to the presigned URL:
  ```json
  [
    { "AllowedOrigins": ["https://chatrix.app"],
      "AllowedMethods": ["PUT"],
      "AllowedHeaders": ["content-type"],
      "MaxAgeSeconds":  3600 }
  ]
  ```

### CDN

Stick a CDN in front of object storage so global users get sub-100 ms
loads:
- **Cloudflare** in front of R2 / S3 — free.
- **Supabase** ships with its own CDN; nothing to configure.

Update `public_url` in the storage driver if you serve through a custom
CDN domain (e.g. `cdn.chatrix.app` instead of the bucket URL).

---

## Backups

| System    | Strategy                                                    |
| --------- | ----------------------------------------------------------- |
| Postgres  | Supabase / Neon / RDS — daily PITR (point-in-time recovery) included on paid tiers. Free tiers usually offer 7-day history; paid 30+. |
| Redis     | Don't bother — every key is reconstructible from Postgres + live socket state. Treat Redis as cache. |
| Storage   | S3 / R2 / Supabase Storage — enable versioning on the bucket. Restore is per-object. |

Disaster recovery means **Postgres restore + bucket replay** — Redis and
sockets reconstruct themselves on boot.

---

## Cost overview

A reasonable production stack for ~10 k DAU:

| Component        | Provider          | Tier                | Monthly  |
| ---------------- | ----------------- | ------------------- | -------- |
| Backend runtime  | Fly.io            | shared-1x × 2       | ~$8      |
| Postgres         | Supabase Pro      | 8 GB DB, 100 GB BW  | $25      |
| Redis            | Upstash           | Pay-as-you-go       | ~$5-10   |
| Storage + CDN    | Cloudflare R2     | 100 GB stored, free egress | ~$1.50 |
| Web              | Vercel Hobby      | Free tier           | $0       |
| Mobile           | EAS Hobby         | 30 builds/mo        | $0       |
| **Total**        |                   |                     | **~$45/mo** |

Scaling to 100 k DAU bumps Postgres to $200-400/mo (the dominant cost) and
adds a read replica + Redis Cloud reserved instance — the rest stays
linear.
