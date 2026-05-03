# =====================================================
# Chatrix web — production Dockerfile (self-host fallback)
#
# Most teams will deploy via Vercel — see docs/deploy-web.md. This Dockerfile
# exists for self-hosters and on-prem deployments.
#
# Uses Next.js `output: "standalone"` so the runtime image is ~120 MB.
# =====================================================

ARG NODE_VERSION=20.18.0
ARG PNPM_VERSION=9.12.0

# ---- deps ------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS deps
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/web/package.json        apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json     packages/ui/
RUN pnpm install --frozen-lockfile

# ---- build -----------------------------------------------------------------
FROM deps AS build
COPY packages/shared packages/shared
COPY packages/ui     packages/ui
COPY apps/web        apps/web
# Fail fast if env-time references are missing — Next inlines NEXT_PUBLIC_*
# at build time, so we accept them here.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
RUN pnpm --filter @chatrix/web build

# ---- runtime ---------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production PORT=3000
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app

# `next build --output standalone` emits a tiny self-contained server tree.
COPY --from=build --chown=app:app /app/apps/web/.next/standalone ./
COPY --from=build --chown=app:app /app/apps/web/.next/static     ./apps/web/.next/static
COPY --from=build --chown=app:app /app/apps/web/public           ./apps/web/public

USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/ || exit 1
CMD ["node", "apps/web/server.js"]
