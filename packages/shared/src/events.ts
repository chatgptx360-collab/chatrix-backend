/**
 * Socket.IO event contract.
 *
 * Naming: <domain>:<verb>. Server-emitted events are past-tense ("message:created"),
 * client-emitted events are imperative ("message:send").
 *
 * Both sides import from this file — there is no other source of truth.
 */
import type {
  Call,
  CallKind,
  Chat,
  ChatMember,
  IceServer,
  Message,
  MessageReaction,
  PresenceState,
  PublicUser,
  UUID,
  ISODateString,
} from "./types";

/** SDP / ICE payloads — mirror the WebRTC spec types we'll ship across. */
export interface SdpPayload {
  type: "offer" | "answer";
  sdp: string;
}
/** Subset of RTCIceCandidateInit. */
export interface IcePayload {
  candidate: string;
  sdpMLineIndex: number | null;
  sdpMid: string | null;
  usernameFragment?: string | null;
}

// ===== Client → Server =====

export interface ClientToServerEvents {
  "chat:join":   (chatId: UUID, ack: (ok: boolean) => void) => void;
  "chat:leave":  (chatId: UUID) => void;

  "message:send": (
    payload: {
      chatId: UUID;
      body?: string;
      kind?: Message["kind"];
      replyToId?: UUID;
      attachments?: UUID[];
      clientId?: string;
    },
    ack: (result: { ok: true; message: Message } | { ok: false; code: string; message: string }) => void,
  ) => void;

  "message:edit":   (payload: { messageId: UUID; body: string }) => void;
  "message:delete": (payload: { messageId: UUID; scope: "me" | "everyone" }) => void;

  "typing:start":   (chatId: UUID) => void;
  "typing:stop":    (chatId: UUID) => void;

  "read:mark":      (payload: { chatId: UUID; lastReadMessageId: UUID }) => void;

  "reaction:add":    (payload: { messageId: UUID; emoji: string }) => void;
  "reaction:remove": (payload: { messageId: UUID; emoji: string }) => void;

  "presence:update": (state: Exclude<PresenceState, "offline">) => void;

  // ----- Calls (1:1) -----
  // The caller invites a peer. Server creates the Call row, validates that
  // the peer is online + not already in a call, returns the freshly-allocated
  // callId + ICE server config, and emits "call:incoming" to the callee.
  "call:invite": (
    payload: { calleeId: UUID; kind: CallKind; chatId?: UUID },
    ack: (
      result:
        | { ok: true;  callId: UUID; iceServers: IceServer[] }
        | { ok: false; code: string; message: string },
    ) => void,
  ) => void;

  // Callee accepts. Server flips the row to 'answered' and returns ICE config.
  "call:accept": (
    payload: { callId: UUID },
    ack: (
      result:
        | { ok: true;  iceServers: IceServer[] }
        | { ok: false; code: string; message: string },
    ) => void,
  ) => void;

  // Callee taps Decline before pickup.
  "call:reject":   (payload: { callId: UUID; reason?: string }) => void;
  // Caller hangs up before the callee picks up.
  "call:cancel":   (payload: { callId: UUID }) => void;
  // Either side after pickup.
  "call:end":      (payload: { callId: UUID }) => void;

  // WebRTC signalling — the server validates participation and relays.
  "call:offer":    (payload: { callId: UUID; sdp: SdpPayload }) => void;
  "call:answer":   (payload: { callId: UUID; sdp: SdpPayload }) => void;
  "call:ice":      (payload: { callId: UUID; candidate: IcePayload }) => void;
}

// ===== Server → Client =====

export interface ServerToClientEvents {
  // Connection lifecycle
  "connection:ready": (payload: { userId: UUID; serverTime: ISODateString }) => void;

  // Chat
  "chat:created":  (chat: Chat) => void;
  "chat:updated":  (chat: Chat) => void;
  "chat:member:joined": (payload: { chatId: UUID; member: ChatMember }) => void;
  "chat:member:left":   (payload: { chatId: UUID; userId: UUID }) => void;

  // Messaging
  "message:created":   (message: Message) => void;
  "message:updated":   (message: Message) => void;
  "message:deleted":   (payload: { chatId: UUID; messageId: UUID; scope: "me" | "everyone" }) => void;

  // Receipts + indicators
  "message:delivered": (payload: { chatId: UUID; messageId: UUID; userId: UUID; at: ISODateString }) => void;
  "message:read":      (payload: { chatId: UUID; userId: UUID; lastReadMessageId: UUID; at: ISODateString }) => void;

  "typing:started":    (payload: { chatId: UUID; userId: UUID }) => void;
  "typing:stopped":    (payload: { chatId: UUID; userId: UUID }) => void;

  // Reactions
  "reaction:updated":  (payload: { chatId: UUID; messageId: UUID; reactions: MessageReaction[] }) => void;

  // Presence
  "presence:changed":  (payload: { userId: UUID; state: PresenceState; lastSeenAt: ISODateString | null }) => void;

  // Friends
  "friend:request":    (payload: { from: PublicUser }) => void;
  "friend:accepted":   (payload: { user: PublicUser }) => void;

  // ----- Calls (server → client) -----
  // Pushed to the callee's sockets when someone invites them.
  "call:incoming":  (payload: { call: Call; from: PublicUser; iceServers: IceServer[] }) => void;
  // Pushed to the caller when the callee accepts.
  "call:accepted":  (payload: { callId: UUID; by: PublicUser }) => void;
  // Pushed to the caller when the callee rejects.
  "call:rejected":  (payload: { callId: UUID; reason?: string }) => void;
  // Pushed to the callee when the caller cancels before pickup.
  "call:cancelled": (payload: { callId: UUID }) => void;
  // Pushed to whichever side did NOT call end().
  "call:ended":     (payload: { callId: UUID; durationMs: number; status: Call["status"] }) => void;
  // Relayed signalling — see ClientToServerEvents for shape.
  "call:offer":     (payload: { callId: UUID; sdp: SdpPayload }) => void;
  "call:answer":    (payload: { callId: UUID; sdp: SdpPayload }) => void;
  "call:ice":       (payload: { callId: UUID; candidate: IcePayload }) => void;

  // Server-pushed errors that don't fit a specific ack
  "error":             (payload: { code: string; message: string }) => void;
}

export type ChatrixSocketEvent = keyof ClientToServerEvents | keyof ServerToClientEvents;
