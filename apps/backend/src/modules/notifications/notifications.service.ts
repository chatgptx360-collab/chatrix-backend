import { Injectable } from "@nestjs/common";
import type { AppNotification, NotificationKind, UUID } from "@chatrix/shared/types";
import { DatabaseService } from "../../db/database.service";

/**
 * In-app notifications. Push-notification fanout (Expo / web-push) is a separate
 * service worker that subscribes to the same insertions over a Postgres trigger
 * or Redis stream. Wire-up in Phase 3.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly db: DatabaseService) {}

  async create(userId: UUID, kind: NotificationKind, payload: Record<string, unknown>): Promise<AppNotification> {
    const row = await this.db.one<any>(
      `INSERT INTO notifications (user_id, kind, payload) VALUES ($1, $2, $3)
       RETURNING id, kind, payload, read_at, created_at`,
      [userId, kind, payload],
    );
    return mapNotification(row);
  }

  async listForUser(userId: UUID, limit = 50): Promise<AppNotification[]> {
    const rows = await this.db.many<any>(
      `SELECT id, kind, payload, read_at, created_at FROM notifications
        WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, limit],
    );
    return rows.map(mapNotification);
  }

  async markAllRead(userId: UUID) {
    await this.db.query(
      `UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`,
      [userId],
    );
  }
}

function mapNotification(r: any): AppNotification {
  return {
    id: r.id, kind: r.kind, payload: r.payload,
    readAt: r.read_at?.toISOString() ?? null,
    createdAt: r.created_at.toISOString(),
  };
}
