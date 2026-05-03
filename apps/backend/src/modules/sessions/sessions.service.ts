import { Injectable } from "@nestjs/common";
import { ChatrixError, ErrorCode } from "@chatrix/shared/errors";
import type { UUID } from "@chatrix/shared/types";
import { DatabaseService } from "../../db/database.service";

export interface SessionView {
  id: UUID;
  deviceId: UUID | null;
  platform: "ios" | "android" | "web" | "desktop" | null;
  deviceName: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  lastUsedAt: string;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

/**
 * Surface for the "Logged-in devices" screen.
 *
 * `isCurrent` requires the caller to pass the refresh token in use on this
 * client — we hash it the same way TokenService does and compare.
 *
 * Revoke semantics:
 *   - revoke(sessionId) — sign out one device.
 *   - revokeOthers()    — sign out everywhere except the current session.
 *   - revokeAll()       — sign out everywhere (also re-issues no new tokens).
 */
@Injectable()
export class SessionsService {
  constructor(private readonly db: DatabaseService) {}

  async list(userId: UUID, currentRefreshTokenHash: string | null): Promise<SessionView[]> {
    const rows = await this.db.many<{
      id: UUID; device_id: UUID | null; user_agent: string | null; ip_address: string | null;
      refresh_token_hash: string;
      last_used_at: Date; created_at: Date; expires_at: Date;
      platform: "ios" | "android" | "web" | "desktop" | null;
      device_name: string | null;
    }>(
      `SELECT s.id, s.device_id, s.user_agent, s.ip_address, s.refresh_token_hash,
              s.last_used_at, s.created_at, s.expires_at,
              d.platform, d.device_name
         FROM sessions s
    LEFT JOIN devices d ON d.id = s.device_id
        WHERE s.user_id = $1 AND s.revoked_at IS NULL AND s.expires_at > now()
        ORDER BY s.last_used_at DESC`,
      [userId],
    );

    return rows.map((r) => ({
      id: r.id,
      deviceId: r.device_id,
      platform: r.platform,
      deviceName: r.device_name,
      userAgent: r.user_agent,
      ipAddress: r.ip_address ? String(r.ip_address) : null,
      lastUsedAt: r.last_used_at.toISOString(),
      createdAt: r.created_at.toISOString(),
      expiresAt: r.expires_at.toISOString(),
      isCurrent: !!currentRefreshTokenHash && r.refresh_token_hash === currentRefreshTokenHash,
    }));
  }

  async revoke(userId: UUID, sessionId: UUID): Promise<void> {
    const result = await this.db.query(
      `UPDATE sessions SET revoked_at = now()
        WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
      [sessionId, userId],
    );
    if (result.rowCount === 0) {
      throw new ChatrixError(ErrorCode.NOT_FOUND, "Session not found.", 404);
    }
  }

  async revokeOthers(userId: UUID, currentRefreshTokenHash: string): Promise<number> {
    const result = await this.db.query(
      `UPDATE sessions SET revoked_at = now()
        WHERE user_id = $1 AND revoked_at IS NULL AND refresh_token_hash <> $2`,
      [userId, currentRefreshTokenHash],
    );
    return result.rowCount ?? 0;
  }
}
