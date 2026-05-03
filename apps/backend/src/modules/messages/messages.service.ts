import { Injectable, Inject, forwardRef, Logger } from "@nestjs/common";
import { ChatrixError, ErrorCode } from "@chatrix/shared/errors";
import type { Message, MessageReaction, UUID, CursorPage } from "@chatrix/shared/types";
import type { SendMessageInput } from "@chatrix/shared/schemas";
import { MESSAGE_EDIT_WINDOW_MS } from "@chatrix/shared/constants";
import { DatabaseService } from "../../db/database.service";
import { ChatGateway } from "../../realtime/chat.gateway";
import { MediaService } from "../media/media.service";
import { PushService } from "../notifications/push.service";
import { PresenceService } from "../../realtime/presence.service";

/**
 * Core message engine.
 *
 *   send       — insert + attach media + bump chat + emit message:created
 *   list       — paginated reverse-chrono with hydrated attachments/reactions/reply
 *   edit       — body update within MESSAGE_EDIT_WINDOW_MS, edit_history append
 *   delete     — me=local hide, everyone=tombstone (deleted_at + deleted_by)
 *   markRead   — advance chat_members.last_read_message_id + emit message:read
 *   addReaction / removeReaction — aggregated emit
 *
 * The wire `Message` shape is the source of truth — we normalize from the
 * raw row into it once, here, and never let DB shapes leak past the service.
 */
interface MessageRow {
  id: UUID;
  chat_id: UUID;
  sender_id: UUID | null;
  kind: Message["kind"];
  body: string | null;
  reply_to_id: UUID | null;
  forwarded_from: { chatId: UUID; messageId: UUID; senderId: UUID } | null;
  edited_at: Date | null;
  deleted_at: Date | null;
  client_id: string | null;
  created_at: Date;
}

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly db: DatabaseService,
    @Inject(forwardRef(() => ChatGateway)) private readonly gw: ChatGateway,
    private readonly media: MediaService,
    private readonly push: PushService,
    private readonly presence: PresenceService,
  ) {}

  // ====================================================
  // Send
  // ====================================================

  async send(senderId: UUID, input: SendMessageInput): Promise<Message> {
    await this.assertMember(input.chatId, senderId);
    if (input.replyToId) await this.assertReplyTargetReachable(input.chatId, input.replyToId);

    // The transaction handles only DB writes. Wire-format projection happens
    // after commit so we can read replies / attachments via the main pool
    // without binding `toWire` to a PoolClient type.
    const { row, attachments } = await this.db.tx(async (client) => {
      const { rows } = await client.query<MessageRow>(
        `INSERT INTO messages (chat_id, sender_id, kind, body, reply_to_id, client_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (chat_id, sender_id, client_id) DO UPDATE
           SET body = messages.body  -- NO-OP write so we get the existing row back
         RETURNING id, chat_id, sender_id, kind, body, reply_to_id, forwarded_from,
                   edited_at, deleted_at, client_id, created_at`,
        [input.chatId, senderId, input.kind ?? "text", input.body ?? null,
         input.replyToId ?? null, input.clientId ?? null],
      );
      const row = rows[0]!;

      const attachments = input.attachments?.length
        ? await this.media.attachToMessage(senderId, row.id, input.attachments)
        : [];

      // Mark online recipients as 'delivered' so the sender's UI gets ✓✓
      // without waiting for them to scroll into view.
      await client.query(
        `INSERT INTO message_reads (message_id, user_id, delivered_at)
         SELECT $1, cm.user_id, now()
           FROM chat_members cm
          WHERE cm.chat_id = $2 AND cm.user_id <> $3 AND cm.left_at IS NULL
         ON CONFLICT DO NOTHING`,
        [row.id, input.chatId, senderId],
      );

      return { row, attachments };
    });

    const message = await this.toWire(row, { attachments, reactions: [] });
    this.gw.emitToChat(input.chatId, "message:created", message);

    // Push fanout for OFFLINE recipients only — fire-and-forget, never blocks
    // the response. Online recipients already got the WS event.
    this.fanoutPush(senderId, input.chatId, message).catch((err) =>
      this.logger.warn(`push fanout failed: ${(err as Error).message}`),
    );

    return message;
  }

  /** Build the push payload + skip anyone currently online. */
  private async fanoutPush(senderId: UUID, chatId: UUID, message: Message) {
    const recipients = await this.db.many<{ user_id: UUID; muted_until: Date | null; display_name: string | null; chat_title: string | null; chat_type: string }>(
      `SELECT cm.user_id, cm.muted_until,
              p.display_name AS display_name,
              c.title       AS chat_title,
              c.type        AS chat_type
         FROM chat_members cm
         JOIN chats     c ON c.id = cm.chat_id
    LEFT JOIN profiles p ON p.user_id = cm.user_id
        WHERE cm.chat_id = $1 AND cm.user_id <> $2 AND cm.left_at IS NULL`,
      [chatId, senderId],
    );

    const sender = await this.db.oneOrNull<{ display_name: string | null; username: string }>(
      `SELECT u.username, p.display_name
         FROM users u JOIN profiles p ON p.user_id = u.id WHERE u.id = $1`,
      [senderId],
    );
    const senderLabel = sender?.display_name ?? `@${sender?.username ?? "someone"}`;

    const previewBody =
      message.kind === "text" && message.body
        ? message.body.slice(0, 140)
        : prettyKindLabel(message.kind);

    await Promise.all(
      recipients.map(async (r) => {
        if (r.muted_until && r.muted_until > new Date()) return;
        const presence = await this.presence.get(r.user_id);
        if (presence === "online") return; // they got the WS event

        const title = r.chat_type === "dm" ? senderLabel : (r.chat_title ?? "Chatrix");
        const body  = r.chat_type === "dm" ? previewBody : `${senderLabel}: ${previewBody}`;

        await this.push.sendToUser(r.user_id, {
          title, body,
          collapseKey: chatId,
          data: { chatId, messageId: message.id },
        });
      }),
    );
  }

  // ====================================================
  // Edit
  // ====================================================

  async edit(senderId: UUID, messageId: UUID, body: string): Promise<Message> {
    const row = await this.db.oneOrNull<MessageRow>(
      `SELECT id, chat_id, sender_id, kind, body, reply_to_id, forwarded_from,
              edited_at, deleted_at, client_id, created_at
         FROM messages WHERE id = $1`,
      [messageId],
    );
    if (!row) throw new ChatrixError(ErrorCode.MESSAGE_NOT_FOUND, "Message not found.", 404);
    if (row.sender_id !== senderId) {
      throw new ChatrixError(ErrorCode.MESSAGE_NOT_OWNED, "You can only edit your own messages.", 403);
    }
    if (row.deleted_at) {
      throw new ChatrixError(ErrorCode.MESSAGE_NOT_FOUND, "Message has been deleted.", 410);
    }
    if (Date.now() - row.created_at.getTime() > MESSAGE_EDIT_WINDOW_MS) {
      throw new ChatrixError(ErrorCode.MESSAGE_EDIT_WINDOW_CLOSED, "Edit window has closed.", 403);
    }

    const updated = await this.db.one<MessageRow>(
      `UPDATE messages
          SET body = $2,
              edited_at = now(),
              edit_history = edit_history || jsonb_build_array(
                jsonb_build_object('at', now(), 'body', $3::text)
              )
        WHERE id = $1
        RETURNING id, chat_id, sender_id, kind, body, reply_to_id, forwarded_from,
                  edited_at, deleted_at, client_id, created_at`,
      [messageId, body, row.body],
    );

    const message = await this.toWire(updated);
    this.gw.emitToChat(updated.chat_id, "message:updated", message);
    return message;
  }

  // ====================================================
  // Delete
  // ====================================================

  async deleteForEveryone(senderId: UUID, messageId: UUID): Promise<void> {
    const row = await this.db.oneOrNull<MessageRow>(
      `SELECT id, chat_id, sender_id, deleted_at FROM messages WHERE id = $1`,
      [messageId],
    );
    if (!row) throw new ChatrixError(ErrorCode.MESSAGE_NOT_FOUND, "Message not found.", 404);
    if (row.sender_id !== senderId) {
      throw new ChatrixError(ErrorCode.MESSAGE_NOT_OWNED, "You can only delete your own messages.", 403);
    }
    if (row.deleted_at) return;

    await this.db.query(
      `UPDATE messages
          SET deleted_at = now(), deleted_by = $2, body = NULL
        WHERE id = $1`,
      [messageId, senderId],
    );
    this.gw.emitToChat(row.chat_id, "message:deleted", {
      chatId: row.chat_id, messageId, scope: "everyone",
    });
  }

  // ====================================================
  // Reactions
  // ====================================================

  async toggleReaction(userId: UUID, messageId: UUID, emoji: string, mode: "add" | "remove") {
    const row = await this.db.oneOrNull<{ chat_id: UUID }>(
      `SELECT chat_id FROM messages WHERE id = $1 AND deleted_at IS NULL`,
      [messageId],
    );
    if (!row) throw new ChatrixError(ErrorCode.MESSAGE_NOT_FOUND, "Message not found.", 404);
    await this.assertMember(row.chat_id, userId);

    if (mode === "add") {
      await this.db.query(
        `INSERT INTO message_reactions (message_id, user_id, emoji)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [messageId, userId, emoji],
      );
    } else {
      await this.db.query(
        `DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
        [messageId, userId, emoji],
      );
    }

    const reactions = await this.loadReactions([messageId]);
    this.gw.emitToChat(row.chat_id, "reaction:updated", {
      chatId: row.chat_id,
      messageId,
      reactions: reactions.get(messageId) ?? [],
    });
  }

  // ====================================================
  // Read receipts
  // ====================================================

  async markRead(userId: UUID, chatId: UUID, lastReadMessageId: UUID): Promise<void> {
    await this.assertMember(chatId, userId);

    // Verify the message is in this chat to prevent cross-chat shenanigans.
    const ok = await this.db.oneOrNull(
      `SELECT 1 FROM messages WHERE id = $1 AND chat_id = $2`,
      [lastReadMessageId, chatId],
    );
    if (!ok) throw new ChatrixError(ErrorCode.MESSAGE_NOT_FOUND, "Message not in this chat.", 400);

    const now = new Date();
    await this.db.tx(async (client) => {
      // Only advance the cursor — never move it backwards.
      await client.query(
        `UPDATE chat_members
            SET last_read_message_id = $3, last_read_at = $4
          WHERE chat_id = $1 AND user_id = $2
            AND (
              last_read_message_id IS NULL
              OR (SELECT created_at FROM messages WHERE id = $3) >
                 (SELECT created_at FROM messages WHERE id = chat_members.last_read_message_id)
            )`,
        [chatId, userId, lastReadMessageId, now],
      );

      // Record per-message read entries — needed for group read-receipt UX
      // (e.g. "seen by 3 of 5"). For DMs this is also the source of truth.
      await client.query(
        `INSERT INTO message_reads (message_id, user_id, read_at, delivered_at)
         SELECT m.id, $2, $3, COALESCE(mr.delivered_at, $3)
           FROM messages m
      LEFT JOIN message_reads mr ON mr.message_id = m.id AND mr.user_id = $2
          WHERE m.chat_id = $1
            AND m.created_at <= (SELECT created_at FROM messages WHERE id = $4)
            AND m.sender_id <> $2
         ON CONFLICT (message_id, user_id) DO UPDATE
           SET read_at = COALESCE(message_reads.read_at, EXCLUDED.read_at)`,
        [chatId, userId, now, lastReadMessageId],
      );
    });

    this.gw.emitToChat(chatId, "message:read", {
      chatId, userId, lastReadMessageId, at: now.toISOString(),
    });
  }

  // ====================================================
  // List
  // ====================================================

  async listForChat(viewerId: UUID, chatId: UUID, cursor?: string, limit = 50): Promise<CursorPage<Message>> {
    await this.assertMember(chatId, viewerId);

    // limit+1 trick: if we got an extra row, there's another page.
    const rows = await this.db.many<MessageRow>(
      `SELECT id, chat_id, sender_id, kind, body, reply_to_id, forwarded_from,
              edited_at, deleted_at, client_id, created_at
         FROM messages
        WHERE chat_id = $1
          AND ($2::timestamptz IS NULL OR created_at < $2)
        ORDER BY created_at DESC
        LIMIT $3`,
      [chatId, cursor ? new Date(cursor) : null, limit + 1],
    );
    const pageRows = rows.slice(0, limit);
    const ids = pageRows.map((r) => r.id);

    // Hydrate attachments + reactions in one round-trip each, not per-message.
    const [attachmentsByMessage, reactionsByMessage] = await Promise.all([
      this.media.hydrateForMessages(ids),
      this.loadReactions(ids),
    ]);

    const items = await Promise.all(
      pageRows.map((r) => this.toWire(r, {
        attachments: attachmentsByMessage.get(r.id) ?? [],
        reactions: reactionsByMessage.get(r.id) ?? [],
      })),
    );

    return {
      items,
      hasMore: rows.length > limit,
      nextCursor: rows.length > limit && items.length > 0
        ? items[items.length - 1]!.createdAt
        : null,
    };
  }

  // ====================================================
  // Internals
  // ====================================================

  private async assertMember(chatId: UUID, userId: UUID) {
    const ok = await this.db.oneOrNull(
      `SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [chatId, userId],
    );
    if (!ok) throw new ChatrixError(ErrorCode.CHAT_NOT_MEMBER, "Not a member of this chat.", 403);
  }

  private async assertReplyTargetReachable(chatId: UUID, replyToId: UUID) {
    const ok = await this.db.oneOrNull(
      `SELECT 1 FROM messages WHERE id = $1 AND chat_id = $2`,
      [replyToId, chatId],
    );
    if (!ok) throw new ChatrixError(ErrorCode.MESSAGE_NOT_FOUND, "Reply target not found in this chat.", 404);
  }

  private async loadReactions(messageIds: UUID[]): Promise<Map<UUID, MessageReaction[]>> {
    const out = new Map<UUID, MessageReaction[]>();
    if (messageIds.length === 0) return out;
    const rows = await this.db.many<{ message_id: UUID; emoji: string; user_id: UUID }>(
      `SELECT message_id, emoji, user_id FROM message_reactions
        WHERE message_id = ANY($1::uuid[])
        ORDER BY message_id, emoji, created_at`,
      [messageIds],
    );
    // Group: { messageId → { emoji → [userIds] } }
    const grouped = new Map<UUID, Map<string, UUID[]>>();
    for (const r of rows) {
      let byEmoji = grouped.get(r.message_id);
      if (!byEmoji) { byEmoji = new Map(); grouped.set(r.message_id, byEmoji); }
      const list = byEmoji.get(r.emoji) ?? [];
      list.push(r.user_id);
      byEmoji.set(r.emoji, list);
    }
    for (const [messageId, byEmoji] of grouped) {
      const arr: MessageReaction[] = [];
      for (const [emoji, userIds] of byEmoji) {
        arr.push({ emoji, userIds, count: userIds.length });
      }
      out.set(messageId, arr);
    }
    return out;
  }

  /** Project a row + its already-loaded sub-resources to the wire format. */
  private async toWire(
    row: MessageRow,
    opts?: { attachments?: Message["attachments"]; reactions?: Message["reactions"] },
  ): Promise<Message> {
    let replyTo: Message["replyTo"] = null;
    if (row.reply_to_id) {
      const r = await this.db.oneOrNull<{ id: UUID; sender_id: UUID | null; body: string | null; kind: Message["kind"] }>(
        `SELECT id, sender_id, body, kind FROM messages WHERE id = $1`,
        [row.reply_to_id],
      );
      if (r) replyTo = { id: r.id, senderId: r.sender_id, body: r.body, kind: r.kind };
    }

    return {
      id: row.id,
      chatId: row.chat_id,
      senderId: row.sender_id,
      kind: row.kind,
      body: row.deleted_at ? null : row.body,
      replyToId: row.reply_to_id,
      replyTo,
      forwardedFrom: row.forwarded_from,
      attachments: opts?.attachments ?? [],
      reactions: opts?.reactions ?? [],
      editedAt: row.edited_at?.toISOString() ?? null,
      deletedAt: row.deleted_at?.toISOString() ?? null,
      clientId: row.client_id,
      createdAt: row.created_at.toISOString(),
      state: row.deleted_at ? undefined : "sent",
    };
  }
}

function prettyKindLabel(kind: Message["kind"]): string {
  switch (kind) {
    case "image": return "📷 Photo";
    case "video": return "🎥 Video";
    case "audio": return "🎤 Voice note";
    case "file":  return "📎 File";
    case "gif":   return "🎞 GIF";
    case "system": return "•";
    default:       return "Message";
  }
}
