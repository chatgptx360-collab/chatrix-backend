import {
  ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect,
  SubscribeMessage, WebSocketGateway, WebSocketServer,
} from "@nestjs/websockets";
import { Inject, Logger, forwardRef } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@chatrix/shared/events";
import type { UUID, PresenceState } from "@chatrix/shared/types";
import { ChatrixError } from "@chatrix/shared/errors";
import { TokenService } from "../modules/auth/token.service";
import { MessagesService } from "../modules/messages/messages.service";
import { DatabaseService } from "../db/database.service";
import { PresenceService } from "./presence.service";

type S = Socket<ClientToServerEvents, ServerToClientEvents, {}, { userId: UUID }>;

/**
 * Realtime gateway. Authenticates on connection via the `auth.token` handshake
 * field, then routes per-event work to the appropriate service.
 *
 * Joining a chat room requires membership — checked once on `chat:join` and
 * cached implicitly via socket.io rooms. Membership changes (kick, leave) are
 * enforced by the chats service emitting `chat:member:left`, which clients
 * react to by leaving the room.
 */
@WebSocketGateway({ namespace: "/", cors: { origin: true, credentials: true } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server<ClientToServerEvents, ServerToClientEvents>;
  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly tokens: TokenService,
    private readonly presence: PresenceService,
    private readonly db: DatabaseService,
    @Inject(forwardRef(() => MessagesService)) private readonly messages: MessagesService,
  ) {}

  // ---------- Lifecycle ----------

  async handleConnection(socket: S) {
    const token = (socket.handshake.auth as { token?: string })?.token
              ?? (socket.handshake.headers["authorization"] as string | undefined)?.replace(/^Bearer /i, "");
    if (!token) return socket.disconnect(true);

    let userId: UUID;
    try {
      userId = this.tokens.verifyAccess(token).sub;
    } catch {
      return socket.disconnect(true);
    }

    socket.data.userId = userId;
    socket.join(`user:${userId}`);
    await this.presence.addSocket(userId, socket.id);
    this.broadcastPresence(userId, "online");

    socket.emit("connection:ready", { userId, serverTime: new Date().toISOString() });
  }

  async handleDisconnect(socket: S) {
    const userId = socket.data.userId;
    if (!userId) return;
    const state = await this.presence.removeSocket(userId, socket.id);
    if (state === "offline") this.broadcastPresence(userId, "offline");
  }

  // ---------- Subscriptions ----------

  @SubscribeMessage("chat:join")
  async onJoin(@ConnectedSocket() socket: S, @MessageBody() chatId: UUID): Promise<boolean> {
    const ok = await this.db.oneOrNull(
      `SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [chatId, socket.data.userId],
    );
    if (!ok) return false;
    socket.join(`chat:${chatId}`);
    return true;
  }

  @SubscribeMessage("chat:leave")
  onLeave(@ConnectedSocket() socket: S, @MessageBody() chatId: UUID) {
    socket.leave(`chat:${chatId}`);
  }

  // ---------- Messaging ----------

  @SubscribeMessage("message:send")
  async onSend(
    @ConnectedSocket() socket: S,
    @MessageBody() payload: Parameters<ClientToServerEvents["message:send"]>[0],
  ) {
    try {
      const message = await this.messages.send(socket.data.userId, payload as never);
      // Service already emits `message:created` to the room; we just ack the sender.
      return { ok: true as const, message };
    } catch (err) {
      if (err instanceof ChatrixError) return { ok: false as const, code: err.code, message: err.message };
      this.logger.error(`message:send failed: ${(err as Error).message}`, (err as Error).stack);
      return { ok: false as const, code: "UNKNOWN", message: "Failed to send message." };
    }
  }

  @SubscribeMessage("message:edit")
  async onEdit(@ConnectedSocket() socket: S, @MessageBody() payload: { messageId: UUID; body: string }) {
    try { await this.messages.edit(socket.data.userId, payload.messageId, payload.body); }
    catch (err) { this.emitError(socket, err); }
  }

  @SubscribeMessage("message:delete")
  async onDelete(
    @ConnectedSocket() socket: S,
    @MessageBody() payload: { messageId: UUID; scope: "me" | "everyone" },
  ) {
    if (payload.scope === "me") return; // local-only on the client
    try { await this.messages.deleteForEveryone(socket.data.userId, payload.messageId); }
    catch (err) { this.emitError(socket, err); }
  }

  @SubscribeMessage("read:mark")
  async onRead(
    @ConnectedSocket() socket: S,
    @MessageBody() payload: { chatId: UUID; lastReadMessageId: UUID },
  ) {
    try { await this.messages.markRead(socket.data.userId, payload.chatId, payload.lastReadMessageId); }
    catch (err) { this.emitError(socket, err); }
  }

  @SubscribeMessage("reaction:add")
  async onReactionAdd(
    @ConnectedSocket() socket: S,
    @MessageBody() payload: { messageId: UUID; emoji: string },
  ) {
    try { await this.messages.toggleReaction(socket.data.userId, payload.messageId, payload.emoji, "add"); }
    catch (err) { this.emitError(socket, err); }
  }

  @SubscribeMessage("reaction:remove")
  async onReactionRemove(
    @ConnectedSocket() socket: S,
    @MessageBody() payload: { messageId: UUID; emoji: string },
  ) {
    try { await this.messages.toggleReaction(socket.data.userId, payload.messageId, payload.emoji, "remove"); }
    catch (err) { this.emitError(socket, err); }
  }

  // ---------- Indicators ----------

  @SubscribeMessage("typing:start")
  onTypingStart(@ConnectedSocket() socket: S, @MessageBody() chatId: UUID) {
    socket.to(`chat:${chatId}`).emit("typing:started", { chatId, userId: socket.data.userId });
  }

  @SubscribeMessage("typing:stop")
  onTypingStop(@ConnectedSocket() socket: S, @MessageBody() chatId: UUID) {
    socket.to(`chat:${chatId}`).emit("typing:stopped", { chatId, userId: socket.data.userId });
  }

  @SubscribeMessage("presence:update")
  async onPresence(
    @ConnectedSocket() socket: S,
    @MessageBody() state: Exclude<PresenceState, "offline">,
  ) {
    await this.presence.setState(socket.data.userId, state);
    this.broadcastPresence(socket.data.userId, state);
  }

  // ---------- Public helpers (used by services) ----------

  emitToChat<E extends keyof ServerToClientEvents>(
    chatId: UUID, event: E, payload: Parameters<ServerToClientEvents[E]>[0],
  ) {
    this.server.to(`chat:${chatId}`).emit(event as any, payload as any);
  }

  emitToUser<E extends keyof ServerToClientEvents>(
    userId: UUID, event: E, payload: Parameters<ServerToClientEvents[E]>[0],
  ) {
    this.server.to(`user:${userId}`).emit(event as any, payload as any);
  }

  // ---------- Internals ----------

  private broadcastPresence(userId: UUID, state: PresenceState) {
    // TODO(phase-6): scope to contacts based on profiles.privacy.lastSeen.
    this.server.emit("presence:changed", {
      userId,
      state,
      lastSeenAt: state === "offline" ? new Date().toISOString() : null,
    });
  }

  private emitError(socket: S, err: unknown) {
    if (err instanceof ChatrixError) {
      socket.emit("error", { code: err.code, message: err.message });
    } else {
      this.logger.error(`unhandled gateway error: ${(err as Error).message}`, (err as Error).stack);
      socket.emit("error", { code: "UNKNOWN", message: "Unexpected error." });
    }
  }
}

