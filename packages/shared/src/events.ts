/**
 * Socket.IO event contract.
 *
 * Naming: <domain>:<verb>. Server-emitted events are past-tense ("message:created"),
 * client-emitted events are imperative ("message:send").
 *
 * Both sides import from this file — there is no other source of truth.
 */
import type {
  Chat,
  ChatMember,
  Message,
  MessageReaction,
  PresenceState,
  PublicUser,
  UUID,
  ISODateString,
} from "./types";

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

  // Server-pushed errors that don't fit a specific ack
  "error":             (payload: { code: string; message: string }) => void;
}

export type ChatrixSocketEvent = keyof ClientToServerEvents | keyof ServerToClientEvents;
