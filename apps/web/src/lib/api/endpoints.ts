/**
 * Typed API helpers. All callers go through these so the wire shapes are
 * checked at compile time. Mirrors `apps/mobile/src/lib/api/client.ts`.
 */
import { api } from "./client";
import type {
  AuthSession, Chat, Message, PublicUser, SelfUser, CursorPage, Friendship,
} from "@chatrix/shared/types";

export const ApiAuth = {
  signup: (body: { username: string; email: string; password: string; displayName?: string }) =>
    api<AuthSession>("/auth/signup", { method: "POST", body }),
  login:  (body: { identifier: string; password: string }) =>
    api<AuthSession>("/auth/login",  { method: "POST", body }),
  me:     () => api<SelfUser>("/auth/me", { method: "POST" }),
  logout: (refreshToken: string) =>
    api<{ ok: true }>("/auth/logout", { method: "POST", body: { refreshToken } }),
  forgot: (email: string) =>
    api<{ ok: true }>("/auth/password/forgot", { method: "POST", body: { email } }),
  reset:  (token: string, password: string) =>
    api<{ ok: true }>("/auth/password/reset",  { method: "POST", body: { token, password } }),
  verifyEmail:        (token: string) =>
    api<{ ok: true }>("/auth/verify-email", { method: "POST", body: { token } }),
  resendVerifyEmail: () =>
    api<{ ok: true }>("/auth/verify-email/resend", { method: "POST" }),
};

export const ApiChats = {
  list:   (archived?: boolean) =>
    api<Chat[]>(`/chats${archived ? "?archived=true" : ""}`),
  load:   (id: string) => api<Chat>(`/chats/${id}`),
  openDm: (peerId: string) =>
    api<Chat>("/chats/dm", { method: "POST", body: { peerId } }),
};

export const ApiMessages = {
  list: (chatId: string, cursor?: string) =>
    api<CursorPage<Message>>(
      `/messages/chat/${chatId}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    ),
  send: (body: {
    chatId: string; body?: string; kind?: Message["kind"];
    replyToId?: string; attachments?: string[]; clientId?: string;
  }) =>
    api<Message>("/messages", { method: "POST", body }),
  edit: (id: string, body: string) =>
    api<Message>(`/messages/${id}`, { method: "PATCH", body: { messageId: id, body } }),
  remove: (id: string, scope: "me" | "everyone") =>
    api<{ ok: true }>(`/messages/${id}`, { method: "DELETE", body: { scope } }),
  markRead: (chatId: string, lastReadMessageId: string) =>
    api<{ ok: true }>("/messages/mark-read", { method: "POST", body: { chatId, lastReadMessageId } }),
  addReaction:    (id: string, emoji: string) =>
    api<{ ok: true }>(`/messages/${id}/reactions`, { method: "POST",   body: { emoji } }),
  removeReaction: (id: string, emoji: string) =>
    api<{ ok: true }>(`/messages/${id}/reactions`, { method: "DELETE", body: { emoji } }),
};

export const ApiUsers = {
  search:     (q: string) => api<PublicUser[]>(`/users/search?q=${encodeURIComponent(q)}`),
  byUsername: (username: string) => api<PublicUser>(`/users/@${encodeURIComponent(username)}`),
  updateMe:   (patch: Partial<SelfUser>) =>
    api<SelfUser>("/users/me", { method: "PATCH", body: patch }),
};

export const ApiFriends = {
  list:    () => api<Friendship[]>("/friends"),
  pending: () => api<{ incoming: Friendship[]; outgoing: Friendship[] }>("/friends/pending"),
  request: (userId: string) => api<Friendship>("/friends/request", { method: "POST", body: { userId } }),
  accept:  (userId: string) => api<Friendship>("/friends/accept",  { method: "POST", body: { userId } }),
  decline: (userId: string) => api<Friendship>("/friends/decline", { method: "POST", body: { userId } }),
};

export interface SessionView {
  id: string;
  platform: "ios" | "android" | "web" | "desktop" | null;
  deviceName: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  lastUsedAt: string;
  createdAt: string;
  isCurrent: boolean;
}

export const ApiSessions = {
  withCurrent: (refreshToken: string) =>
    api<SessionView[]>("/sessions/with-current", { method: "POST", body: { refreshToken } }),
  revoke: (id: string) => api(`/sessions/${id}`, { method: "DELETE" }),
};
