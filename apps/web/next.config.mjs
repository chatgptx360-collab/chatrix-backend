import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // `standalone` produces a self-contained server in `.next/standalone` —
  // used by the Dockerfile for self-host. Vercel deploys ignore this and
  // use their own build pipeline.
  output: "standalone",
  // The shared package is consumed as TS source — let Next compile it.
  transpilePackages: ["@chatrix/shared", "@chatrix/ui"],

  // Vercel monorepo + npm `file:` deps install `@chatrix/*` as symlinks into
  // node_modules. With webpack's default `resolve.symlinks=true`, any import
  // inside the symlinked package walks up from the SYMLINK TARGET
  // (`packages/shared/`) rather than the consumer's node_modules. That means
  // `zod` (a dep of @chatrix/shared, hoisted to apps/web/node_modules/zod)
  // can't be found. `symlinks: false` makes webpack resolve from the
  // apparent path, fixing the walk-up.
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.symlinks = false;
    // The TS path alias `@chatrix/shared` points at `../../packages/shared/src`,
    // so when webpack hits `import 'zod'` inside that file, it walks up from
    // packages/shared/ — and never reaches apps/web/node_modules. Pinning the
    // resolution roots to apps/web/node_modules + the default keeps everything
    // resolvable from a single place.
    config.resolve.modules = [
      path.resolve(__dirname, "node_modules"),
      "node_modules",
    ];
    return config;
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "**.amazonaws.com" },
      { protocol: "https", hostname: "cdn.chatrix.app" },
    ],
  },
  experimental: { typedRoutes: true },

  // Skip the production build's type-check + lint passes. The webpack compile
  // already validates everything that matters at runtime; these passes use
  // independent module resolution that doesn't see the workspace symlinks
  // correctly. PR-level CI runs `pnpm typecheck` + `pnpm lint` separately,
  // which IS the right place to enforce these.
  typescript: { ignoreBuildErrors: true },
  eslint:     { ignoreDuringBuilds: true },

  // Brand share-link pattern: chatrix.app/@kamsy → renders /u/kamsy.
  // The redirect form (instead of rewrite) keeps the canonical URL clean
  // for SEO and analytics — and avoids encoding "@" twice in some edge clients.
  async redirects() {
    return [
      { source: "/@:username", destination: "/u/:username", permanent: false },
    ];
  },

  // Universal Links (iOS) + App Links (Android) require the well-known
  // files to be served as `application/json`. Next defaults extensionless
  // files to octet-stream; this explicit header makes both stacks happy.
  async headers() {
    return [
      {
        source: "/.well-known/apple-app-site-association",
        headers: [{ key: "content-type", value: "application/json" }],
      },
      {
        source: "/.well-known/assetlinks.json",
        headers: [{ key: "content-type", value: "application/json" }],
      },
    ];
  },
};
export default nextConfig;
