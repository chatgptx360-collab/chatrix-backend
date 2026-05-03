/**
 * Domain types — wire shapes returned by the API and emitted over the socket.
 * Any field that maps to a DB enum keeps the same string union for cheap mapping.
 */

export type UUID = string;
export type ISODateString = string;

// ===== Identity =====

export type UserRole = "user" | "moderator" | "admin";
export type UserStatus = "active" | "suspended" | "banned" | "deleted";
export type PresenceState = "online" | "away" | "offline";

/** Public-facing user view (safe for any other user to see). */
export interface PublicUser {
  id: UUID;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  presence: PresenceState;
  lastSeenAt: ISODateString | null;
}

/** Self view — what the authed user sees about themselves. */
export interface SelfUser extends PublicUser {
  email: string;
  emailVerifiedAt: ISODateString | null;
  role: UserRole;
  status: UserStatus;
  bannerUrl: string | null;
  privacy: PrivacySettings;
  notifications: NotificationSettings;
  theme: string;
  locale: string;
  createdAt: ISODateString;
}

export interface PrivacySettings {
  lastSeen: "everyone" | "contacts" | "nobody";
  profilePicture: "everyone" | "contacts" | "nobody";
  readReceipts: boolean;
  searchable: boolean;
}

export interface NotificationSettings {
  mentions: boolean;
  messages: boolean;
  sounds: boolean;
  preview: boolean;
}

// ===== Auth =====

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: ISODateString;
  user: SelfUser;
}

export interface DeviceInfo {
  platform: "ios" | "android" | "web" | "desktop";
  deviceName?: string;
  pushToken?: string;
}

// ===== Social =====

export type FriendshipStatus = "pending" | "accepted" | "declined" | "cancelled";

export interface Friendship {
  id: UUID;
  requesterId: UUID;
  addresseeId: UUID;
  status: FriendshipStatus;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  // Hydrated when returned from API:
  user?: PublicUser;
}

// ===== Chats =====

export type ChatType = "dm" | "group" | "channel";
export type MemberRole = "owner" | "admin" | "member";

export interface ChatMember {
  userId: UUID;
  role: MemberRole;
  pinned: boolean;
  archived: boolean;
  mutedUntil: ISODateString | null;
  nickname: string | null;
  joinedAt: ISODateString;
  leftAt: ISODateString | null;
  lastReadMessageId: UUID | null;
  lastReadAt: ISODateString | null;
  user?: PublicUser;
}

export interface Chat {
  id: UUID;
  type: ChatType;
  title: string | null;
  description: string | null;
  avatarUrl: string | null;
  publicHandle: string | null;
  createdBy: UUID | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  // Convenience joins:
  members?: ChatMember[];
  lastMessage?: Message | null;
  unreadCount?: number;
}

// ===== Messages =====

export type MessageKind = "text" | "image" | "video" | "audio" | "file" | "gif" | "system";

export interface MessageAttachment {
  mediaId: UUID;
  position: number;
  url: string;
  thumbnailUrl: string | null;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  blurhash: string | null;
  waveform: number[] | null;
}

export interface MessageReaction {
  emoji: string;
  userIds: UUID[];
  count: number;
}

export interface Message {
  id: UUID;
  chatId: UUID;
  senderId: UUID | null;
  kind: MessageKind;
  body: string | null;
  replyToId: UUID | null;
  replyTo?: Pick<Message, "id" | "senderId" | "body" | "kind"> | null;
  forwardedFrom: { chatId: UUID; messageId: UUID; senderId: UUID } | null;
  attachments: MessageAttachment[];
  reactions: MessageReaction[];
  editedAt: ISODateString | null;
  deletedAt: ISODateString | null;
  // Per-recipient delivery state (from the perspective of the requesting user)
  state?: "sent" | "delivered" | "read";
  clientId?: string | null;
  createdAt: ISODateString;
}

// ===== Media =====

export type MediaKind = "image" | "video" | "audio" | "file" | "gif";
export type MediaStatus = "pending" | "uploaded" | "processing" | "ready" | "failed" | "rejected";

export interface MediaFile {
  id: UUID;
  kind: MediaKind;
  status: MediaStatus;
  url: string | null;
  thumbnailUrl: string | null;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  blurhash: string | null;
  waveform: number[] | null;
  createdAt: ISODateString;
}

// ===== Notifications =====

export type NotificationKind =
  | "friend_request"
  | "friend_accepted"
  | "message"
  | "mention"
  | "reaction"
  | "system";

export interface AppNotification {
  id: UUID;
  kind: NotificationKind;
  payload: Record<string, unknown>;
  readAt: ISODateString | null;
  createdAt: ISODateString;
}

// ===== Pagination =====

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}
