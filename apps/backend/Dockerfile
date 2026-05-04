# =====================================================
# Chatrix backend — Railway-friendly Dockerfile.
#
# Strategy:
#   - npm (not pnpm) so we don't have to fight workspace:* / lockfile dance
#   - tsx at runtime (no separate compile step) so the image works even
#     when @chatrix/shared is consumed as TS source
#   - debian-slim base so argon2's prebuilt linux-x64 binaries (glibc) load,
#     with build-essential available as a fallback compile path
#
# Build context expected: monorepo ROOT (so Dockerfile can copy packages/*).
# Railway's nixpacks/buildkit honours `.dockerignore` at the context root.
# =====================================================

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV NODE_OPTIONS="--enable-source-maps"

# argon2 + ioredis ship prebuilts for linux-x64-glibc, but we keep a working
# toolchain available for any package that needs to compile from source.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 build-essential ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1. Workspace deps that the backend's `file:` ref resolves to.
COPY packages/shared/package.json packages/shared/
COPY packages/shared/src           packages/shared/src/
COPY packages/ui/package.json      packages/ui/
COPY packages/ui/src               packages/ui/src/

# 2. Backend
COPY apps/backend/package.json     apps/backend/

# Install backend deps directly, ignoring the monorepo root's workspace
# field (which would otherwise drag in `apps/web`'s deps and fail).
WORKDIR /app/apps/backend
RUN npm install --no-audit --no-fund --legacy-peer-deps --workspaces=false \
 && npm cache clean --force

# Also install @chatrix/shared's own deps (zod). Required because at runtime
# tsx loads packages/shared/src/**.ts directly, and Node resolves `zod` from
# that file's location — it never walks into apps/backend/node_modules.
WORKDIR /app/packages/shared
RUN npm install --no-audit --no-fund --legacy-peer-deps --workspaces=false --omit=dev \
 && npm cache clean --force
WORKDIR /app/apps/backend

# 3. Source + tsconfig + migrations
COPY apps/backend/src              ./src/
COPY apps/backend/tsconfig.json    ./
COPY apps/backend/nest-cli.json    ./
COPY tsconfig.base.json            /app/tsconfig.base.json
COPY db                            /app/db/

EXPOSE 4000

# Healthcheck — Railway picks it up as readiness probe.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:4000/v1/health > /dev/null || exit 1

# Run TypeScript directly via tsx. Slightly slower cold start vs compiled JS,
# but avoids a separate build step + the @chatrix/shared compile cascade.
CMD ["npx", "--no-install", "tsx", "src/main.ts"]
