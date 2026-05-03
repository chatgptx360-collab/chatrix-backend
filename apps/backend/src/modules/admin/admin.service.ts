import { Injectable } from "@nestjs/common";
import { ChatrixError, ErrorCode } from "@chatrix/shared/errors";
import type { UUID } from "@chatrix/shared/types";
import { DatabaseService } from "../../db/database.service";

/**
 * Admin / moderator surface area.
 *
 * Every state-changing action writes to admin_audit_log so we can answer
 * "who suspended this user, when, and why" — the audit trail is the single
 * most important moderation feature beyond the actions themselves.
 *
 * Keep all queries defensive: admin tools must never throw 500s on edge
 * cases (deleted users, missing reports, etc) since that's how operators lose
 * trust in the panel.
 */
@Injectable()
export class AdminService {
  constructor(private readonly db: DatabaseService) {}

  // ====================================================
  // Stats — dashboard overview
  // ====================================================

  async stats() {
    const [users, online, today, week, msgs24, mediaBytes, openReports] = await Promise.all([
      this.db.one<{ count: string }>(`SELECT count(*)::text FROM users WHERE deleted_at IS NULL`),
      this.db.one<{ count: string }>(`SELECT count(*)::text FROM profiles WHERE presence <> 'offline'`),
      this.db.one<{ count: string }>(`SELECT count(*)::text FROM users WHERE created_at > now() - interval '24 hours'`),
      this.db.one<{ count: string }>(`SELECT count(*)::text FROM users WHERE created_at > now() - interval '7 days'`),
      this.db.one<{ count: string }>(`SELECT count(*)::text FROM messages WHERE created_at > now() - interval '24 hours'`),
      this.db.one<{ bytes: string }>(`SELECT COALESCE(SUM(size_bytes),0)::text AS bytes FROM media_files WHERE deleted_at IS NULL`),
      this.db.one<{ count: string }>(`SELECT count(*)::text FROM reports WHERE status IN ('open', 'reviewing')`),
    ]);
    return {
      users:        parseInt(users.count, 10),
      online:       parseInt(online.count, 10),
      signupsToday: parseInt(today.count, 10),
      signupsWeek:  parseInt(week.count, 10),
      messages24h:  parseInt(msgs24.count, 10),
      mediaBytes:   parseInt(mediaBytes.bytes, 10),
      openReports:  parseInt(openReports.count, 10),
    };
  }

  // ====================================================
  // Users
  // ====================================================

  async listUsers(opts: { q?: string; status?: "active" | "suspended" | "banned"; limit?: number; cursor?: string }) {
    const limit = Math.min(opts.limit ?? 50, 200);
    const where: string[] = ["u.deleted_at IS NULL"];
    const params: unknown[] = [];

    if (opts.status) {
      params.push(opts.status);
      where.push(`u.status = $${params.length}`);
    }
    if (opts.q && opts.q.trim().length >= 2) {
      params.push(`%${opts.q.trim().replace(/^@/, "")}%`);
      where.push(`(u.username ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
    }
    if (opts.cursor) {
      params.push(new Date(opts.cursor));
      where.push(`u.created_at < $${params.length}`);
    }
    params.push(limit + 1);

    const rows = await this.db.many<any>(
      `SELECT u.id, u.username, u.email, u.role, u.status, u.email_verified_at,
              u.last_login_at, u.created_at,
              p.display_name, p.avatar_url, p.presence, p.last_seen_at,
              (SELECT count(*)::int FROM messages m WHERE m.sender_id = u.id) AS messages_count,
              (SELECT count(*)::int FROM reports  r WHERE r.target_kind = 'user' AND r.target_id = u.id) AS reports_count
         FROM users u
         JOIN profiles p ON p.user_id = u.id
        WHERE ${where.join(" AND ")}
        ORDER BY u.created_at DESC
        LIMIT $${params.length}`,
      params,
    );

    const items = rows.slice(0, limit).map(mapAdminUser);
    return {
      items,
      hasMore: rows.length > limit,
      nextCursor: rows.length > limit ? items[items.length - 1]!.createdAt : null,
    };
  }

  async getUser(userId: UUID) {
    const row = await this.db.oneOrNull<any>(
      `SELECT u.*, p.display_name, p.avatar_url, p.bio, p.presence, p.last_seen_at,
              (SELECT count(*)::int FROM messages m WHERE m.sender_id = u.id) AS messages_count,
              (SELECT count(*)::int FROM reports  r WHERE r.target_kind = 'user' AND r.target_id = u.id) AS reports_count,
              (SELECT count(*)::int FROM sessions s WHERE s.user_id  = u.id AND s.revoked_at IS NULL) AS active_sessions
         FROM users u
         JOIN profiles p ON p.user_id = u.id
        WHERE u.id = $1`,
      [userId],
    );
    if (!row) throw new ChatrixError(ErrorCode.NOT_FOUND, "User not found.", 404);
    return { ...mapAdminUser(row), bio: row.bio, activeSessions: row.active_sessions };
  }

  async setUserStatus(actorId: UUID, userId: UUID, status: "active" | "suspended" | "banned", reason?: string) {
    if (actorId === userId) {
      throw new ChatrixError(ErrorCode.FORBIDDEN, "Admins cannot moderate their own account.", 403);
    }
    await this.db.tx(async (client) => {
      const result = await client.query(`UPDATE users SET status = $2 WHERE id = $1 AND deleted_at IS NULL`, [userId, status]);
      if (result.rowCount === 0) throw new ChatrixError(ErrorCode.NOT_FOUND, "User not found.", 404);

      // Suspended/banned users lose every active session immediately.
      if (status !== "active") {
        await client.query(`UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
      }

      await client.query(
        `INSERT INTO admin_audit_log (actor_id, action, target_kind, target_id, metadata)
         VALUES ($1, $2, 'user', $3, $4)`,
        [actorId, `user.${status}`, userId, JSON.stringify({ status, reason: reason ?? null })],
      );
    });
  }

  async setUserRole(actorId: UUID, userId: UUID, role: "user" | "moderator" | "admin") {
    if (actorId === userId) {
      throw new ChatrixError(ErrorCode.FORBIDDEN, "Admins cannot change their own role.", 403);
    }
    await this.db.tx(async (client) => {
      const result = await client.query(`UPDATE users SET role = $2 WHERE id = $1 AND deleted_at IS NULL`, [userId, role]);
      if (result.rowCount === 0) throw new ChatrixError(ErrorCode.NOT_FOUND, "User not found.", 404);
      await client.query(
        `INSERT INTO admin_audit_log (actor_id, action, target_kind, target_id, metadata)
         VALUES ($1, $2, 'user', $3, $4)`,
        [actorId, `user.role.${role}`, userId, JSON.stringify({ role })],
      );
    });
  }

  // ====================================================
  // Reports
  // ====================================================

  async listReports(opts: { status?: "open" | "reviewing" | "actioned" | "dismissed"; limit?: number }) {
    const limit = Math.min(opts.limit ?? 100, 300);
    const params: unknown[] = [];
    let where = "TRUE";
    if (opts.status) {
      params.push(opts.status);
      where = `r.status = $${params.length}`;
    } else {
      where = `r.status IN ('open', 'reviewing')`;
    }
    params.push(limit);

    return this.db.many<any>(
      `SELECT r.id, r.target_kind, r.target_id, r.reason, r.details, r.status,
              r.created_at, r.handled_at, r.resolution,
              -- Hydrate the reporter's identity (cheap, useful in the queue UI).
              ru.username    AS reporter_username,
              rp.display_name AS reporter_display_name,
              ru.id          AS reporter_id,
              -- Hydrate the target if it's a user (most common case).
              tu.username    AS target_username,
              tp.display_name AS target_display_name,
              tu.status      AS target_status
         FROM reports r
    LEFT JOIN users    ru ON ru.id = r.reporter_id
    LEFT JOIN profiles rp ON rp.user_id = ru.id
    LEFT JOIN users    tu ON r.target_kind = 'user' AND tu.id = r.target_id
    LEFT JOIN profiles tp ON tp.user_id = tu.id
        WHERE ${where}
        ORDER BY r.created_at DESC
        LIMIT $${params.length}`,
      params,
    ).then((rows) => rows.map(mapReport));
  }

  async setReportStatus(actorId: UUID, reportId: UUID, status: "reviewing" | "actioned" | "dismissed", resolution?: string) {
    const result = await this.db.tx(async (client) => {
      const r = await client.query<{ id: UUID }>(
        `UPDATE reports
            SET status = $2,
                handled_by = CASE WHEN $2 IN ('actioned','dismissed') THEN $3 ELSE handled_by END,
                handled_at = CASE WHEN $2 IN ('actioned','dismissed') THEN now() ELSE handled_at END,
                resolution = COALESCE($4, resolution)
          WHERE id = $1
      RETURNING id`,
        [reportId, status, actorId, resolution ?? null],
      );
      if (r.rowCount === 0) throw new ChatrixError(ErrorCode.NOT_FOUND, "Report not found.", 404);

      await client.query(
        `INSERT INTO admin_audit_log (actor_id, action, target_kind, target_id, metadata)
         VALUES ($1, $2, 'report', $3, $4)`,
        [actorId, `report.${status}`, reportId, JSON.stringify({ status, resolution: resolution ?? null })],
      );
      return r.rows[0]!;
    });
    return result;
  }

  // ====================================================
  // Audit log
  // ====================================================

  async listAudit(opts: { limit?: number; cursor?: string }) {
    const limit = Math.min(opts.limit ?? 100, 300);
    const params: unknown[] = [];
    let where = "TRUE";
    if (opts.cursor) {
      params.push(new Date(opts.cursor));
      where = `l.created_at < $${params.length}`;
    }
    params.push(limit + 1);

    const rows = await this.db.many<any>(
      `SELECT l.id, l.action, l.target_kind, l.target_id, l.metadata, l.created_at,
              u.id AS actor_id, u.username AS actor_username, p.display_name AS actor_display_name
         FROM admin_audit_log l
    LEFT JOIN users u ON u.id = l.actor_id
    LEFT JOIN profiles p ON p.user_id = u.id
        WHERE ${where}
        ORDER BY l.created_at DESC
        LIMIT $${params.length}`,
      params,
    );

    const items = rows.slice(0, limit).map((r) => ({
      id: r.id,
      action: r.action,
      targetKind: r.target_kind,
      targetId: r.target_id,
      metadata: r.metadata,
      createdAt: r.created_at.toISOString(),
      actor: r.actor_id ? {
        id: r.actor_id,
        username: r.actor_username,
        displayName: r.actor_display_name,
      } : null,
    }));

    return {
      items,
      hasMore: rows.length > limit,
      nextCursor: rows.length > limit ? items[items.length - 1]!.createdAt : null,
    };
  }
}

// ---------- Mappers ----------

function mapAdminUser(r: any) {
  return {
    id: r.id,
    username: r.username,
    email: r.email,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    role: r.role as "user" | "moderator" | "admin",
    status: r.status as "active" | "suspended" | "banned" | "deleted",
    emailVerifiedAt: r.email_verified_at?.toISOString() ?? null,
    presence: r.presence as "online" | "away" | "offline",
    lastSeenAt: r.last_seen_at?.toISOString() ?? null,
    lastLoginAt: r.last_login_at?.toISOString() ?? null,
    createdAt: r.created_at.toISOString(),
    messagesCount: r.messages_count ?? 0,
    reportsCount:  r.reports_count ?? 0,
  };
}

function mapReport(r: any) {
  return {
    id: r.id,
    targetKind: r.target_kind as "user" | "message" | "chat",
    targetId: r.target_id,
    reason: r.reason,
    details: r.details,
    status: r.status as "open" | "reviewing" | "actioned" | "dismissed",
    createdAt: r.created_at.toISOString(),
    handledAt: r.handled_at?.toISOString() ?? null,
    resolution: r.resolution,
    reporter: r.reporter_id ? {
      id: r.reporter_id,
      username: r.reporter_username,
      displayName: r.reporter_display_name,
    } : null,
    target: r.target_kind === "user" && r.target_username ? {
      username: r.target_username,
      displayName: r.target_display_name,
      status: r.target_status,
    } : null,
  };
}
