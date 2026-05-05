import { z } from "zod";

/**
 * Strongly-typed env loader. Fail-fast at boot if anything required is missing.
 *
 * Usage:
 *   - Nest providers inject `Env` (registered as a value provider in AppModule).
 *   - Bootstrap reads from app.get(Env).
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("30d"),

  ARGON2_MEMORY_COST: z.coerce.number().int().positive().default(19456),
  ARGON2_TIME_COST: z.coerce.number().int().positive().default(2),
  ARGON2_PARALLELISM: z.coerce.number().int().positive().default(1),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().default("Chatrix <noreply@chatrix.app>"),

  STORAGE_DRIVER: z.enum(["supabase", "s3", "local"]).default("local"),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_BUCKET: z.string().default("chatrix-media"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("chatrix-media"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000,http://localhost:8081")
    .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean)),

  // Public-facing URL of the web client — used to build links in emails.
  // Mobile deep links use the `chatrix://` scheme; the web client handles both.
  WEB_APP_URL: z.string().url().default("http://localhost:3000"),

  RATE_LIMIT_GLOBAL_RPM: z.coerce.number().int().positive().default(600),
  RATE_LIMIT_AUTH_RPM:   z.coerce.number().int().positive().default(20),

  EXPO_ACCESS_TOKEN: z.string().optional(),
  WEB_PUSH_VAPID_PUBLIC: z.string().optional(),
  WEB_PUSH_VAPID_PRIVATE: z.string().optional(),
  WEB_PUSH_CONTACT: z.string().default("mailto:admin@chatrix.app"),

  // ----- Calls / WebRTC -----
  // Single TURN url, or comma-separated list (e.g. "turn:foo:3478,turns:foo:5349").
  // When unset, only public STUN is offered to clients — calls behind strict
  // NAT will fail to traverse.
  TURN_URL: z.string().optional(),
  TURN_USERNAME: z.string().optional(),
  TURN_CREDENTIAL: z.string().optional(),

  ADMIN_BOOTSTRAP_EMAIL: z.string().email().optional(),
});

export type EnvShape = z.infer<typeof schema>;

let cached: EnvShape | undefined;

export const envFactory = (): EnvShape => {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error("❌ Invalid environment variables:", parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  cached = parsed.data;
  return cached;
};

/** DI token + class type for `@Inject(Env)` / `app.get(Env)`. */
export class Env {
  static readonly token = Symbol("Env");
}
export interface Env extends EnvShape {}

/** Provider — registered globally in AppModule. */
export const EnvProvider = {
  provide: Env,
  useFactory: envFactory,
};
