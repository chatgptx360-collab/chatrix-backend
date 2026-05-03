import { Injectable } from "@nestjs/common";
import { ChatrixError, ErrorCode } from "@chatrix/shared/errors";
import type { Chat, UUID } from "@chatrix/shared/types";
import { DatabaseService } from "../../db/database.service";

/**
 * Chat lifecycle. The hot path here is `listForUser` (chat list screen) —
 * it must stay fast as users grow chat counts.
 */
@Injectable()
export class ChatsService {
  constructor(private readonly db: DatabaseService) {}

  /** Get-or-create the canonical DM chat between two users. */
  async openDm(userA: UUID, userB: UUID): Promise<Chat> {
    if (userA === userB) {
      throw new ChatrixError(ErrorCode.SOCIAL_SELF_ACTION, "You can't DM yourself.", 400);
    }
    return this.db.tx(async (client) => {
      const existing = await client.query<{ chat_id: UUID }>(
        `SELECT cm.chat_id
           FROM chat_members cm
           JOIN chat_members peer ON peer.chat_id = cm.chat_id AND peer.user_id = $2
           JOIN chats c ON c.id = cm.chat_id
          WHERE cm.user_id = $1 AND c.type = 'dm' AND c.deleted_at IS NULL
          LIMIT 1`,
        [userA, userB],
      );
      const chatId =
        existing.rows[0]?.chat_id ??
        (await client.query<{ id: UUID }>(
          `INSERT INTO chats (type, created_by) VALUES ('dm', $1) RETURNING id`,
          [userA],
        )).rows[0]!.id;

      if (!existing.rows[0]) {
        await client.query(
          `INSERT INTO chat_members (chat_id, user_id, role) VALUES ($1, $2, 'owner'), ($1, $3, 'owner')
           ON CONFLICT DO NOTHING`,
          [chatId, userA, userB],
        );
      }
      return this.loadChat(chatId, userA);
    });
  }

  /**
   * Chat list — the home-screen query. One round-trip with:
   *   - chat metadata
   *   - the cached last message (denormalized via the bump-trigger)
   *   - per-viewer pinned/archived/muted state
   *   - unread count (messages newer than the viewer's last_read cursor)
   *
   * Pinned chats float to the top regardless of recency; otherwise sort by
   * last activity. Archived chats are excluded by default.
   */
  async listForUser(userId: UUID, opts: { archived?: boolean } = {}): Promise<Chat[]> {
    const rows = await this.db.many<any>(
      `SELECT
          c.id, c.type, c.title, c.description, c.avatar_url, c.public_handle,
          c.created_by, c.created_at, c.updated_at,
          cm.pinned, cm.archived, cm.muted_until, cm.nickname,
          cm.last_read_message_id, cm.last_read_at,
          lm.id           AS last_msg_id,
          lm.sender_id    AS last_msg_sender,
          lm.kind         AS last_msg_kind,
          lm.body         AS last_msg_body,
          lm.created_at   AS last_msg_at,
          lm.deleted_at   AS last_msg_deleted_at,
          (
            SELECT count(*)::int
              FROM messages m
             WHERE m.chat_id = c.id
               AND m.sender_id <> $1
               AND m.deleted_at IS NULL
               AND (
                 cm.last_read_message_id IS NULL
                 OR m.created_at > (
                   SELECT created_at FROM messages WHERE id = cm.last_read_message_id
                 )
               )
          )                AS unread_count,
          -- For DMs only: the OTHER member's profile, so the list row can
          -- render their name + avatar without an extra round-trip.
          peer.id           AS peer_id,
          peer.username     AS peer_username,
          peer_p.display_name AS peer_display_name,
          peer_p.avatar_url   AS peer_avatar_url,
          peer_p.presence     AS peer_presence,
          peer_p.last_seen_at AS peer_last_seen_at
         FROM chats c
         JOIN chat_members cm ON cm.chat_id = c.id AND cm.user_id = $1 AND cm.left_at IS NULL
    LEFT JOIN messages lm ON lm.id = c.last_message_id
    LEFT JOIN LATERAL (
            SELECT u.id, u.username
              FROM chat_members cmp
              JOIN users u ON u.id = cmp.user_id
             WHERE cmp.chat_id = c.id AND cmp.user_id <> $1 AND cmp.left_at IS NULL
             LIMIT 1
         ) peer ON c.type = 'dm'
    LEFT JOIN profiles peer_p ON peer_p.user_id = peer.id
        WHERE c.deleted_at IS NULL
          AND cm.archived = $2
        ORDER BY cm.pinned DESC, c.last_message_at DESC NULLS LAST
        LIMIT 200`,
      [userId, opts.archived ?? false],
    );

    return rows.map((r) => ({
      ...mapChat(r),
      unreadCount: r.unread_count ?? 0,
      members: r.peer_id ? [{
        userId: r.peer_id,
        role: "owner" as const,
        pinned: false, archived: false,
        mutedUntil: null, nickname: null,
        joinedAt: r.created_at.toISOString(), leftAt: null,
        lastReadMessageId: null, lastReadAt: null,
        user: {
          id: r.peer_id,
          username: r.peer_username,
          displayName: r.peer_display_name,
          avatarUrl: r.peer_avatar_url,
          bio: null,
          presence: r.peer_presence ?? "offline",
          lastSeenAt: r.peer_last_seen_at?.toISOString() ?? null,
        },
      }] : undefined,
      lastMessage: r.last_msg_id ? {
        id: r.last_msg_id,
        chatId: r.id,
        senderId: r.last_msg_sender,
        kind: r.last_msg_kind,
        body: r.last_msg_deleted_at ? null : r.last_msg_body,
        replyToId: null,
        replyTo: null,
        forwardedFrom: null,
        attachments: [],
        reactions: [],
        editedAt: null,
        deletedAt: r.last_msg_deleted_at?.toISOString() ?? null,
        clientId: null,
        createdAt: r.last_msg_at.toISOString(),
      } : null,
    }));
  }

  async loadChat(chatId: UUID, viewerId: UUID): Promise<Chat> {
    const row = await this.db.oneOrNull<any>(
      `SELECT c.*
         FROM chats c
         JOIN chat_members cm ON cm.chat_id = c.id AND cm.user_id = $2 AND cm.left_at IS NULL
        WHERE c.id = $1 AND c.deleted_at IS NULL`,
      [chatId, viewerId],
    );
    if (!row) throw new ChatrixError(ErrorCode.CHAT_NOT_FOUND, "Chat not found.", 404);
    return mapChat(row);
  }
}

function mapChat(r: any): Chat {
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    description: r.description,
    avatarUrl: r.avatar_url,
    publicHandle: r.public_handle,
    createdBy: r.created_by,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}
