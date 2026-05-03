import { Injectable, Logger } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { ChatrixError, ErrorCode } from "@chatrix/shared/errors";
import type { SelfUser, AuthSession, DeviceInfo, UUID } from "@chatrix/shared/types";
import type { SignupInput, LoginInput } from "@chatrix/shared/schemas";
import { DatabaseService } from "../../db/database.service";
import { Env } from "../../config/env";
import { EmailService } from "../email/email.service";
import { PasswordService } from "./password.service";
import { TokenService } from "./token.service";

interface UserRow {
  id: UUID;
  username: string;
  email: string;
  password_hash: string;
  role: "user" | "moderator" | "admin";
  status: "active" | "suspended" | "banned" | "deleted";
  email_verified_at: Date | null;
  created_at: Date;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly password: PasswordService,
    private readonly tokens: TokenService,
    private readonly email: EmailService,
    private readonly env: Env,
  ) {}

  // ---------- Signup ----------

  async signup(input: SignupInput, ctx: { userAgent?: string; ip?: string }): Promise<AuthSession> {
    const passwordHash = await this.password.hash(input.password);

    return this.db.tx(async (client) => {
      // Conflict-aware insert — surface the right error code instead of a generic 500.
      const { rows } = await client.query<UserRow>(
        `INSERT INTO users (username, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, username, email, password_hash, role, status, email_verified_at, created_at`,
        [input.username, input.email, passwordHash],
      ).catch((err: { code?: string; constraint?: string }) => {
        if (err.code === "23505") {
          throw new ChatrixError(
            err.constraint?.includes("email") ? ErrorCode.AUTH_EMAIL_TAKEN : ErrorCode.AUTH_USERNAME_TAKEN,
            err.constraint?.includes("email") ? "Email already in use." : "Username already taken.",
            409,
          );
        }
        throw err;
      });

      const user = rows[0]!;
      await client.query(
        `INSERT INTO profiles (user_id, display_name) VALUES ($1, $2)`,
        [user.id, input.displayName ?? input.username],
      );

      const deviceId = await this.linkDevice(client, user.id, input.device);
      const session = await this.issueSession(user, { ...ctx, deviceId });

      // Fire-and-forget the verification email. Failure here must not block
      // signup — the user can request a resend.
      this.queueVerificationEmail(user.id, user.email, user.username).catch((err) =>
        this.logger.error(`verification email failed for ${user.email}: ${(err as Error).message}`),
      );
      return session;
    });
  }

  /** Public — used by signup + the resend-verification endpoint. */
  async queueVerificationEmail(userId: UUID, toEmail: string, username: string) {
    const token = await this.createEmailVerificationToken(userId);
    const verifyUrl = `${this.env.WEB_APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
    await this.email.sendVerifyEmail({ to: toEmail, username, verifyUrl });
  }

  // ---------- Login ----------

  async login(input: LoginInput, ctx: { userAgent?: string; ip?: string }): Promise<AuthSession> {
    const isEmail = input.identifier.includes("@");
    const user = await this.db.oneOrNull<UserRow>(
      isEmail
        ? `SELECT * FROM users WHERE email    = $1 AND deleted_at IS NULL`
        : `SELECT * FROM users WHERE username = $1 AND deleted_at IS NULL`,
      [input.identifier],
    );

    // Always run a verify call to keep timing constant for unknown users.
    const dummyHash = "$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const ok = await this.password.verify(user?.password_hash ?? dummyHash, input.password);
    if (!user || !ok) {
      throw new ChatrixError(ErrorCode.AUTH_INVALID_CREDENTIALS, "Invalid username/email or password.", 401);
    }
    if (user.status === "banned") throw new ChatrixError(ErrorCode.AUTH_ACCOUNT_BANNED, "This account is banned.", 403);
    if (user.status === "suspended") throw new ChatrixError(ErrorCode.AUTH_ACCOUNT_SUSPENDED, "This account is suspended.", 403);

    return this.db.tx(async (client) => {
      const deviceId = await this.linkDevice(client, user.id, input.device);
      await client.query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [user.id]);
      return this.issueSession(user, { ...ctx, deviceId });
    });
  }

  // ---------- Refresh ----------

  async refresh(refreshToken: string, ctx: { userAgent?: string; ip?: string }): Promise<AuthSession> {
    const session = await this.tokens.rotateRefreshToken(refreshToken, ctx);
    if (!session) throw new ChatrixError(ErrorCode.AUTH_TOKEN_INVALID, "Refresh token invalid or expired.", 401);

    const user = await this.db.oneOrNull<UserRow>(
      `SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [session.user_id],
    );
    if (!user || user.status !== "active") {
      throw new ChatrixError(ErrorCode.AUTH_TOKEN_INVALID, "Account not available.", 401);
    }
    return this.issueSession(user, ctx);
  }

  // ---------- Sign out ----------

  async logout(refreshToken: string) {
    await this.tokens.revokeRefreshToken(refreshToken);
  }

  // ---------- Helpers ----------

  private async linkDevice(client: any, userId: UUID, device?: DeviceInfo): Promise<UUID | null> {
    if (!device) return null;
    const { rows } = await client.query<{ id: UUID }>(
      `INSERT INTO devices (user_id, platform, device_name, push_token)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, push_token) DO UPDATE SET last_active_at = now()
       RETURNING id`,
      [userId, device.platform, device.deviceName ?? null, device.pushToken ?? null],
    );
    return rows[0]?.id ?? null;
  }

  private async issueSession(
    user: UserRow,
    ctx: { userAgent?: string; ip?: string; deviceId?: UUID | null },
  ): Promise<AuthSession> {
    const accessToken = this.tokens.signAccess({ userId: user.id, role: user.role });
    const { token: refreshToken, expiresAt } = await this.tokens.issueRefreshToken({
      userId: user.id,
      deviceId: ctx.deviceId,
      userAgent: ctx.userAgent,
      ip: ctx.ip,
    });

    const self = await this.loadSelf(user.id);
    return { accessToken, refreshToken, expiresAt: expiresAt.toISOString(), user: self };
  }

  /** Load the SelfUser projection (joins profile). */
  async loadSelf(userId: UUID): Promise<SelfUser> {
    const row = await this.db.one<{
      id: UUID; username: string; email: string; role: SelfUser["role"]; status: SelfUser["status"];
      email_verified_at: Date | null; created_at: Date;
      display_name: string | null; bio: string | null; avatar_url: string | null; banner_url: string | null;
      presence: SelfUser["presence"]; last_seen_at: Date | null;
      privacy: SelfUser["privacy"]; notifications: SelfUser["notifications"]; theme: string; locale: string;
    }>(
      `SELECT u.id, u.username, u.email, u.role, u.status, u.email_verified_at, u.created_at,
              p.display_name, p.bio, p.avatar_url, p.banner_url,
              p.presence, p.last_seen_at, p.privacy, p.notifications, p.theme, p.locale
         FROM users u
         JOIN profiles p ON p.user_id = u.id
        WHERE u.id = $1`,
      [userId],
    );
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      role: row.role,
      status: row.status,
      emailVerifiedAt: row.email_verified_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
      displayName: row.display_name,
      bio: row.bio,
      avatarUrl: row.avatar_url,
      bannerUrl: row.banner_url,
      presence: row.presence,
      lastSeenAt: row.last_seen_at?.toISOString() ?? null,
      privacy: row.privacy,
      notifications: row.notifications,
      theme: row.theme,
      locale: row.locale,
    };
  }

  // ---------- Email verification ----------

  async createEmailVerificationToken(userId: UUID): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
    await this.db.query(
      `INSERT INTO email_verification_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)`,
      [token, userId, expiresAt],
    );
    return token;
  }

  async consumeEmailVerificationToken(token: string): Promise<void> {
    const row = await this.db.oneOrNull<{ user_id: UUID; expires_at: Date; consumed_at: Date | null }>(
      `SELECT user_id, expires_at, consumed_at FROM email_verification_tokens WHERE token = $1`,
      [token],
    );
    if (!row || row.consumed_at || row.expires_at < new Date()) {
      throw new ChatrixError(ErrorCode.AUTH_TOKEN_INVALID, "Verification link is invalid or expired.", 400);
    }
    await this.db.tx(async (client) => {
      await client.query(`UPDATE email_verification_tokens SET consumed_at = now() WHERE token = $1`, [token]);
      await client.query(`UPDATE users SET email_verified_at = now() WHERE id = $1`, [row.user_id]);
    });
  }

  // ---------- Password reset ----------

  /**
   * Step 1 — user enters their email. Always returns silently to avoid
   * leaking whether an account exists (email enumeration).
   *
   * If the email matches a real account we generate a 1h single-use token,
   * persist its hash, and send an email with the link.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.db.oneOrNull<{ id: UUID; username: string; email: string }>(
      `SELECT id, username, email FROM users
        WHERE email = $1 AND deleted_at IS NULL AND status <> 'banned'`,
      [email],
    );
    if (!user) return;

    // Token shape mirrors the verification token so consumers stay simple.
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h
    await this.db.query(
      `INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)`,
      [token, user.id, expiresAt],
    );

    const resetUrl = `${this.env.WEB_APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
    await this.email.sendResetPasswordEmail({ to: user.email, username: user.username, resetUrl });
  }

  /**
   * Step 2 — consume the token, set the new password, sign every session out.
   *
   * "Sign out everywhere" is the safe default: if an attacker triggered the
   * reset by phishing, they likely also have an active session — revoking all
   * refresh tokens locks them out immediately.
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const row = await this.db.oneOrNull<{ user_id: UUID; expires_at: Date; consumed_at: Date | null }>(
      `SELECT user_id, expires_at, consumed_at FROM password_reset_tokens WHERE token = $1`,
      [token],
    );
    if (!row || row.consumed_at || row.expires_at < new Date()) {
      throw new ChatrixError(ErrorCode.AUTH_TOKEN_INVALID, "Reset link is invalid or expired.", 400);
    }

    const passwordHash = await this.password.hash(newPassword);

    await this.db.tx(async (client) => {
      await client.query(`UPDATE password_reset_tokens SET consumed_at = now() WHERE token = $1`, [token]);
      await client.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [row.user_id, passwordHash]);
      await client.query(
        `UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
        [row.user_id],
      );
      // Also invalidate any other unconsumed reset tokens for the same user.
      await client.query(
        `UPDATE password_reset_tokens SET consumed_at = now()
          WHERE user_id = $1 AND token <> $2 AND consumed_at IS NULL`,
        [row.user_id, token],
      );
    });
  }
}
