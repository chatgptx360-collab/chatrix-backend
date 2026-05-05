import {
  ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect,
  SubscribeMessage, WebSocketGateway, WebSocketServer,
} from "@nestjs/websockets";
import { Inject, Logger, forwardRef } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  IcePayload,
  SdpPayload,
} from "@chatrix/shared/events";
import type { CallKind, PublicUser, UUID, PresenceState } from "@chatrix/shared/types";
import { ChatrixError, ErrorCode } from "@chatrix/shared/errors";
import { CALL_RING_TIMEOUT_MS } from "@chatrix/shared/constants";
import { TokenService } from "../modules/auth/token.service";
import { MessagesService } from "../modules/messages/messages.service";
import { CallsService } from "../modules/calls/calls.service";
import { DatabaseService } from "../db/database.service";
import { PresenceService } from "./presence.service";
import { IceConfigService } from "./ice-config.service";

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

  /**
   * Per-call ring timer. When a callee doesn't pick up within
   * CALL_RING_TIMEOUT_MS we mark the call as 'missed' on the server and
   * emit `call:ended` to the caller. The map is keyed by callId so we can
   * cancel the timer if the call resolves earlier.
   */
  private readonly ringTimers = new Map<UUID, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly tokens: TokenService,
    private readonly presence: PresenceService,
    private readonly db: DatabaseService,
    @Inject(forwardRef(() => MessagesService)) private readonly messages: MessagesService,
    private readonly calls: CallsService,
    private readonly ice: IceConfigService,
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

  // ---------- Calls (1:1) ----------
  //
  // Lifecycle on the wire:
  //
  //   caller emits  call:invite  → server creates Call row + ring timer,
  //                                 emits call:incoming to callee
  //   callee emits  call:accept  → server flips to 'answered', emits
  //                                 call:accepted back to caller
  //          OR     call:reject  → server flips to 'declined', emits
  //                                 call:rejected back to caller
  //   caller emits  call:cancel  → server flips to 'cancelled' (only
  //                                 valid while ringing), emits
  //                                 call:cancelled to callee
  //   either emits  call:end     → server flips to 'ended' (after pickup)
  //                                 or appropriate terminal state
  //   either emits  call:offer/answer/ice → server validates participation
  //                                 and relays unchanged to the other side

  @SubscribeMessage("call:invite")
  async onCallInvite(
    @ConnectedSocket() socket: S,
    @MessageBody() payload: { calleeId: UUID; kind: CallKind; chatId?: UUID },
  ) {
    try {
      const callerId = socket.data.userId;
      const call = await this.calls.create({
        callerId,
        calleeId: payload.calleeId,
        kind: payload.kind,
        chatId: payload.chatId ?? null,
      });

      // Surface callee online-state — if they're offline we still create the
      // row (visible in their call history as 'missed' once it times out).
      const calleeOnline = await this.isUserOnline(payload.calleeId);

      const from = await this.publicUser(callerId);
      const iceServers = this.ice.getIceServers();

      // Push the invite to every socket on the callee's user-room so it
      // rings on all their devices simultaneously.
      this.emitToUser(payload.calleeId, "call:incoming", { call, from, iceServers });

      // Arm the ring timer. If the callee doesn't accept/decline in time we
      // auto-mark missed and notify the caller.
      const timeout = setTimeout(() => this.expireCall(call.id), CALL_RING_TIMEOUT_MS);
      this.ringTimers.set(call.id, timeout);

      return {
        ok: true as const,
        callId: call.id,
        iceServers,
        // The client uses calleeOnline to decide whether to show "Calling…"
        // or jump straight to "Calling… (offline)". Not part of the contract
        // but helpful UX state.
        _peerOnline: calleeOnline,
      };
    } catch (err) {
      if (err instanceof ChatrixError) return { ok: false as const, code: err.code, message: err.message };
      this.logger.error(`call:invite failed: ${(err as Error).message}`, (err as Error).stack);
      return { ok: false as const, code: ErrorCode.UNKNOWN, message: "Could not start call." };
    }
  }

  @SubscribeMessage("call:accept")
  async onCallAccept(
    @ConnectedSocket() socket: S,
    @MessageBody() payload: { callId: UUID },
  ) {
    try {
      const calleeId = socket.data.userId;
      const call = await this.calls.accept(payload.callId, calleeId);
      this.clearRingTimer(call.id);

      const by = await this.publicUser(calleeId);
      this.emitToUser(call.callerId, "call:accepted", { callId: call.id, by });

      return { ok: true as const, iceServers: this.ice.getIceServers() };
    } catch (err) {
      if (err instanceof ChatrixError) return { ok: false as const, code: err.code, message: err.message };
      this.logger.error(`call:accept failed: ${(err as Error).message}`, (err as Error).stack);
      return { ok: false as const, code: ErrorCode.UNKNOWN, message: "Could not accept call." };
    }
  }

  @SubscribeMessage("call:reject")
  async onCallReject(
    @ConnectedSocket() socket: S,
    @MessageBody() payload: { callId: UUID; reason?: string },
  ) {
    try {
      const calleeId = socket.data.userId;
      const call = await this.calls.reject(payload.callId, calleeId);
      this.clearRingTimer(call.id);
      this.emitToUser(call.callerId, "call:rejected", { callId: call.id, reason: payload.reason });
    } catch (err) {
      this.emitError(socket, err);
    }
  }

  @SubscribeMessage("call:cancel")
  async onCallCancel(
    @ConnectedSocket() socket: S,
    @MessageBody() payload: { callId: UUID },
  ) {
    try {
      const callerId = socket.data.userId;
      const call = await this.calls.cancel(payload.callId, callerId);
      this.clearRingTimer(call.id);
      this.emitToUser(call.calleeId, "call:cancelled", { callId: call.id });
    } catch (err) {
      this.emitError(socket, err);
    }
  }

  @SubscribeMessage("call:end")
  async onCallEnd(
    @ConnectedSocket() socket: S,
    @MessageBody() payload: { callId: UUID },
  ) {
    try {
      const userId = socket.data.userId;
      const call = await this.calls.end(payload.callId, userId);
      this.clearRingTimer(call.id);
      // Notify the *other* party.
      const otherId = call.callerId === userId ? call.calleeId : call.callerId;
      this.emitToUser(otherId, "call:ended", {
        callId: call.id,
        durationMs: call.durationMs ?? 0,
        status: call.status,
      });
    } catch (err) {
      this.emitError(socket, err);
    }
  }

  @SubscribeMessage("call:offer")
  async onCallOffer(
    @ConnectedSocket() socket: S,
    @MessageBody() payload: { callId: UUID; sdp: SdpPayload },
  ) {
    await this.relayToPeer(socket, payload.callId, "call:offer", { callId: payload.callId, sdp: payload.sdp });
  }

  @SubscribeMessage("call:answer")
  async onCallAnswer(
    @ConnectedSocket() socket: S,
    @MessageBody() payload: { callId: UUID; sdp: SdpPayload },
  ) {
    await this.relayToPeer(socket, payload.callId, "call:answer", { callId: payload.callId, sdp: payload.sdp });
  }

  @SubscribeMessage("call:ice")
  async onCallIce(
    @ConnectedSocket() socket: S,
    @MessageBody() payload: { callId: UUID; candidate: IcePayload },
  ) {
    await this.relayToPeer(socket, payload.callId, "call:ice", { callId: payload.callId, candidate: payload.candidate });
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

  // ---------- Call internals ----------

  /**
   * Relay an SDP offer/answer or ICE candidate from the sender to the
   * other participant of `callId`. The server validates that:
   *   - the call exists,
   *   - the sender is a participant,
   *   - the call is in a state where signalling is still meaningful
   *     (ringing for offer, answered for ICE/answer).
   * The relayed payload is forwarded *unchanged* — the SDP/ICE blob is
   * opaque to us.
   */
  private async relayToPeer<E extends "call:offer" | "call:answer" | "call:ice">(
    socket: S, callId: UUID, event: E, payload: Parameters<ServerToClientEvents[E]>[0],
  ) {
    try {
      const call = await this.calls.findById(callId);
      if (!call) throw new ChatrixError(ErrorCode.CALL_NOT_FOUND, "Call not found.", 404);
      const senderId = socket.data.userId;
      if (call.callerId !== senderId && call.calleeId !== senderId) {
        throw new ChatrixError(ErrorCode.CALL_NOT_PARTICIPANT, "Not a participant.", 403);
      }
      // Reject signalling for terminal calls.
      if (call.status === "ended" || call.status === "failed" ||
          call.status === "missed" || call.status === "declined" ||
          call.status === "cancelled") {
        throw new ChatrixError(ErrorCode.CALL_INVALID_STATE, `Call is ${call.status}.`, 409);
      }
      const otherId = call.callerId === senderId ? call.calleeId : call.callerId;
      this.emitToUser(otherId, event, payload);
    } catch (err) {
      this.emitError(socket, err);
    }
  }

  /**
   * Ring-timer expiry: if the call is still ringing we mark it missed
   * and notify the caller. Idempotent — safe to call after the row has
   * already moved on.
   */
  private async expireCall(callId: UUID) {
    this.ringTimers.delete(callId);
    try {
      const call = await this.calls.findById(callId);
      if (!call || call.status !== "ringing") return;
      const updated = await this.calls.miss(callId);
      this.emitToUser(updated.callerId, "call:ended", {
        callId: updated.id, durationMs: 0, status: updated.status,
      });
      this.emitToUser(updated.calleeId, "call:cancelled", { callId: updated.id });
    } catch (err) {
      this.logger.error(`call ${callId} expiry failed: ${(err as Error).message}`);
    }
  }

  private clearRingTimer(callId: UUID) {
    const t = this.ringTimers.get(callId);
    if (t) {
      clearTimeout(t);
      this.ringTimers.delete(callId);
    }
  }

  /** Lookup the PublicUser projection for the call:incoming payload. */
  private async publicUser(userId: UUID): Promise<PublicUser> {
    const row = await this.db.one<{
      id: UUID; username: string; display_name: string | null; avatar_url: string | null;
      bio: string | null; presence: PresenceState; last_seen_at: Date | null;
    }>(
      `SELECT u.id, u.username, p.display_name, p.avatar_url, p.bio, p.presence, p.last_seen_at
         FROM users u
         JOIN profiles p ON p.user_id = u.id
        WHERE u.id = $1`,
      [userId],
    );
    return {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      bio: row.bio,
      presence: row.presence,
      lastSeenAt: row.last_seen_at?.toISOString() ?? null,
    };
  }

  /** Cheap check via the user-room. If they have ≥1 socket, they're "online". */
  private async isUserOnline(userId: UUID): Promise<boolean> {
    const sockets = await this.server.in(`user:${userId}`).fetchSockets();
    return sockets.length > 0;
  }
}

