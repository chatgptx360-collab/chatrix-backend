import { Injectable } from "@nestjs/common";
import { ChatrixError, ErrorCode } from "@chatrix/shared/errors";
import type { UUID, Friendship } from "@chatrix/shared/types";
import { DatabaseService } from "../../db/database.service";

/**
 * Friend graph operations. Block-aware: every action checks blocked_users
 * so a blocked user cannot bypass with a fresh request.
 */
@Injectable()
export class FriendsService {
  constructor(private readonly db: DatabaseService) {}

  async sendRequest(requesterId: UUID, addresseeId: UUID): Promise<Friendship> {
    if (requesterId === addresseeId) {
      throw new ChatrixError(ErrorCode.SOCIAL_SELF_ACTION, "You can't friend yourself.", 400);
    }
    const blocked = await this.db.oneOrNull(
      `SELECT 1 FROM blocked_users
        WHERE (blocker_id = $1 AND blocked_id = $2)
           OR (blocker_id = $2 AND blocked_id = $1)`,
      [requesterId, addresseeId],
    );
    if (blocked) throw new ChatrixError(ErrorCode.SOCIAL_BLOCKED, "Action not allowed.", 403);

    const row = await this.db.one<any>(
      `INSERT INTO friendships (requester_id, addressee_id, status)
       VALUES ($1, $2, 'pending')
       ON CONFLICT (requester_id, addressee_id)
       DO UPDATE SET status = 'pending', updated_at = now()
       RETURNING id, requester_id, addressee_id, status, created_at, updated_at`,
      [requesterId, addresseeId],
    );
    return mapFriendship(row);
  }

  async respond(addresseeId: UUID, requesterId: UUID, accept: boolean): Promise<Friendship> {
    const row = await this.db.oneOrNull<any>(
      `UPDATE friendships
          SET status = $3, updated_at = now()
        WHERE requester_id = $1 AND addressee_id = $2 AND status = 'pending'
        RETURNING id, requester_id, addressee_id, status, created_at, updated_at`,
      [requesterId, addresseeId, accept ? "accepted" : "declined"],
    );
    if (!row) throw new ChatrixError(ErrorCode.NOT_FOUND, "No pending request.", 404);
    return mapFriendship(row);
  }

  async block(blockerId: UUID, blockedId: UUID, reason?: string) {
    if (blockerId === blockedId) {
      throw new ChatrixError(ErrorCode.SOCIAL_SELF_ACTION, "You can't block yourself.", 400);
    }
    await this.db.tx(async (client) => {
      await client.query(
        `INSERT INTO blocked_users (blocker_id, blocked_id, reason)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [blockerId, blockedId, reason ?? null],
      );
      // Cancel any open friend requests in either direction.
      await client.query(
        `UPDATE friendships SET status = 'cancelled'
          WHERE ((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1))
            AND status IN ('pending', 'accepted')`,
        [blockerId, blockedId],
      );
    });
  }

  async unblock(blockerId: UUID, blockedId: UUID) {
    await this.db.query(
      `DELETE FROM blocked_users WHERE blocker_id = $1 AND blocked_id = $2`,
      [blockerId, blockedId],
    );
  }

  async listFriends(userId: UUID): Promise<Friendship[]> {
    return this.db
      .many<any>(
        `SELECT f.id, f.requester_id, f.addressee_id, f.status, f.created_at, f.updated_at,
                u.id AS uid, u.username, p.display_name, p.avatar_url, p.presence, p.last_seen_at, p.bio
           FROM friendships f
           JOIN users u ON u.id = CASE
             WHEN f.requester_id = $1 THEN f.addressee_id
             ELSE f.requester_id
           END
      LEFT JOIN profiles p ON p.user_id = u.id
          WHERE f.status = 'accepted' AND (f.requester_id = $1 OR f.addressee_id = $1)
          ORDER BY f.updated_at DESC`,
        [userId],
      )
      .then((rows) => rows.map(mapFriendshipWithUser));
  }

  /**
   * Pending friend requests for the inbox UI.
   *   - direction='incoming' — others want to friend the user (actionable)
   *   - direction='outgoing' — pending requests they sent (cancellable, but
   *     for the MVP we just list them so the user sees nothing's lost)
   */
  async listPendingRequests(userId: UUID): Promise<{
    incoming: Friendship[];
    outgoing: Friendship[];
  }> {
    const rows = await this.db.many<any>(
      `SELECT f.id, f.requester_id, f.addressee_id, f.status, f.created_at, f.updated_at,
              u.id AS uid, u.username, p.display_name, p.avatar_url, p.presence, p.last_seen_at, p.bio,
              CASE WHEN f.addressee_id = $1 THEN 'incoming' ELSE 'outgoing' END AS direction
         FROM friendships f
         JOIN users u ON u.id = CASE
           WHEN f.addressee_id = $1 THEN f.requester_id
           ELSE f.addressee_id
         END
    LEFT JOIN profiles p ON p.user_id = u.id
        WHERE f.status = 'pending' AND (f.requester_id = $1 OR f.addressee_id = $1)
        ORDER BY f.updated_at DESC`,
      [userId],
    );
    const all = rows.map(mapFriendshipWithUser);
    return {
      incoming: rows.filter((r) => r.direction === "incoming").map(mapFriendshipWithUser),
      outgoing: rows.filter((r) => r.direction === "outgoing").map(mapFriendshipWithUser),
    };
  }
}

function mapFriendshipWithUser(r: any): Friendship {
  return {
    ...mapFriendship(r),
    user: r.uid ? {
      id: r.uid,
      username: r.username,
      displayName: r.display_name ?? null,
      avatarUrl: r.avatar_url ?? null,
      bio: r.bio ?? null,
      presence: (r.presence ?? "offline") as "online" | "away" | "offline",
      lastSeenAt: r.last_seen_at?.toISOString() ?? null,
    } : undefined,
  };
}

function mapFriendship(r: any): Friendship {
  return {
    id: r.id,
    requesterId: r.requester_id,
    addresseeId: r.addressee_id,
    status: r.status,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}
