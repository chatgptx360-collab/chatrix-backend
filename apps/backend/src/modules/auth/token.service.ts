import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { createHash, randomBytes } from "node:crypto";
import { Env } from "../../config/env";
import { DatabaseService } from "../../db/database.service";
import type { UUID } from "@chatrix/shared/types";

/**
 * Token strategy:
 *   - Access token: short-lived (15m) JWT carrying { sub, role }.
 *   - Refresh token: opaque random 64-byte string. We store its SHA-256
 *     in `sessions.refresh_token_hash` and rotate on every use.
 *
 * Why opaque refresh tokens? They can be revoked by deleting the row;
 * JWT refresh tokens can't be revoked without an extra DB lookup anyway,
 * so we may as well skip the JWT overhead.
 */
export interface AccessTokenClaims {
  sub: UUID;
  role: "user" | "moderator" | "admin";
  type: "access";
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly db: DatabaseService,
    private readonly env: Env,
  ) {}

  signAccess(claims: { userId: UUID; role: AccessTokenClaims["role"] }): string {
    return this.jwt.sign(
      { sub: claims.userId, role: claims.role, type: "access" } satisfies AccessTokenClaims,
      { secret: this.env.JWT_ACCESS_SECRET, expiresIn: this.env.JWT_ACCESS_TTL },
    );
  }

  verifyAccess(token: string): AccessTokenClaims {
    const claims = this.jwt.verify<AccessTokenClaims>(token, { secret: this.env.JWT_ACCESS_SECRET });
    if (claims.type !== "access") throw new Error("Wrong token type");
    return claims;
  }

  /** Generate a new refresh token + persist its hash. Returns the plaintext. */
  async issueRefreshToken(args: {
    userId: UUID;
    deviceId?: UUID | null;
    userAgent?: string;
    ip?: string;
  }): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(48).toString("base64url");
    const hash = sha256(token);
    const ttlSeconds = parseTtl(this.env.JWT_REFRESH_TTL);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    await this.db.query(
      `INSERT INTO sessions (user_id, refresh_token_hash, device_id, user_agent, ip_address, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [args.userId, hash, args.deviceId ?? null, args.userAgent ?? null, args.ip ?? null, expiresAt],
    );
    return { token, expiresAt };
  }

  /** Rotate: validate, revoke, issue new pair. */
  async rotateRefreshToken(token: string, ctx: { userAgent?: string; ip?: string }) {
    const hash = sha256(token);
    const session = await this.db.oneOrNull<{ id: string; user_id: UUID; revoked_at: Date | null; expires_at: Date }>(
      `SELECT id, user_id, revoked_at, expires_at FROM sessions WHERE refresh_token_hash = $1`,
      [hash],
    );
    if (!session || session.revoked_at || session.expires_at < new Date()) {
      // Reuse-detection: if a revoked token is presented, revoke ALL of the user's
      // sessions — likely a stolen-token replay.
      if (session?.revoked_at) {
        await this.db.query(`UPDATE sessions SET revoked_at = now() WHERE user_id = $1`, [session.user_id]);
      }
      return null;
    }

    await this.db.query(`UPDATE sessions SET revoked_at = now() WHERE id = $1`, [session.id]);
    return session;
  }

  /** Sign out a single session by refresh token. */
  async revokeRefreshToken(token: string) {
    const hash = sha256(token);
    await this.db.query(`UPDATE sessions SET revoked_at = now() WHERE refresh_token_hash = $1`, [hash]);
  }

  /** Sign out everywhere — used after password reset. */
  async revokeAll(userId: UUID) {
    await this.db.query(`UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
  }
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** Parse "15m" / "30d" / "3600" → seconds. */
function parseTtl(v: string): number {
  if (/^\d+$/.test(v)) return parseInt(v, 10);
  const m = /^(\d+)([smhd])$/.exec(v);
  if (!m) throw new Error(`Invalid TTL: ${v}`);
  const n = parseInt(m[1]!, 10);
  switch (m[2]) {
    case "s": return n;
    case "m": return n * 60;
    case "h": return n * 3600;
    case "d": return n * 86400;
    default:  throw new Error(`Invalid TTL unit: ${v}`);
  }
}
