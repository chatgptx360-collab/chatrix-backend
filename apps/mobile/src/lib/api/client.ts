import { ChatrixError, ErrorCode } from "@chatrix/shared/errors";
import type { ApiError } from "@chatrix/shared/errors";
import { useAuthStore } from "../auth/store";

/**
 * Mobile fetch wrapper. Mirrors the web client byte-for-byte so behavior is
 * identical across platforms — auto refresh on 401, ChatrixError mapping,
 * stable JSON shape on errors.
 */
const BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";
const PREFIX = "/v1";

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** Skip the auto-refresh recursion (used by /auth/refresh itself). */
  skipRefresh?: boolean;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { skipRefresh, body, headers, ...rest } = opts;
  const auth = useAuthStore.getState();

  const res = await fetch(`${BASE}${PREFIX}${path}`, {
    ...rest,
    headers: {
      "content-type": "application/json",
      ...(auth.accessToken ? { authorization: `Bearer ${auth.accessToken}` } : {}),
      ...(headers ?? {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && !skipRefresh && auth.refreshToken) {
    const refreshed = await auth.refresh();
    if (refreshed) return api<T>(path, { ...opts, skipRefresh: true });
  }

  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as ApiError | null;
    throw new ChatrixError(
      err?.code ?? ErrorCode.UNKNOWN,
      err?.message ?? `HTTP ${res.status}`,
      res.status,
      err?.details,
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ---------- Typed helpers ----------

import type { AuthSession, Chat, Message, PublicUser, SelfUser, CursorPage, Friendship } from "@chatrix/shared/types";

export const ApiAuth = {
  signup:  (body: { username: string; email: string; password: string; displayName?: string }) =>
    api<AuthSession>("/auth/signup", { method: "POST", body }),
  login:   (body: { identifier: string; password: string }) =>
    api<AuthSession>("/auth/login", { method: "POST", body }),
  me:      () => api<SelfUser>("/auth/me", { method: "POST" }),
  logout:  (refreshToken: string) =>
    api<{ ok: true }>("/auth/logout", { method: "POST", body: { refreshToken } }),
};

export const ApiChats = {
  list:        (archived?: boolean) =>
    api<Chat[]>(`/chats${archived ? "?archived=true" : ""}`),
  openDm:      (peerId: string) =>
    api<Chat>("/chats/dm", { method: "POST", body: { peerId } }),
  load:        (id: string) => api<Chat>(`/chats/${id}`),
};

export const ApiMessages = {
  list: (chatId: string, cursor?: string) =>
    api<CursorPage<Message>>(`/messages/chat/${chatId}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),
  send: (body: { chatId: string; body?: string; kind?: Message["kind"]; replyToId?: string; attachments?: string[]; clientId?: string }) =>
    api<Message>("/messages", { method: "POST", body }),
  edit: (id: string, body: string) =>
    api<Message>(`/messages/${id}`, { method: "PATCH", body: { messageId: id, body } }),
  remove: (id: string, scope: "me" | "everyone") =>
    api<{ ok: true }>(`/messages/${id}`, { method: "DELETE", body: { scope } }),
  markRead: (chatId: string, lastReadMessageId: string) =>
    api<{ ok: true }>("/messages/mark-read", { method: "POST", body: { chatId, lastReadMessageId } }),
  addReaction:    (id: string, emoji: string) =>
    api<{ ok: true }>(`/messages/${id}/reactions`, { method: "POST", body: { emoji } }),
  removeReaction: (id: string, emoji: string) =>
    api<{ ok: true }>(`/messages/${id}/reactions`, { method: "DELETE", body: { emoji } }),
};

export const ApiUsers = {
  search:       (q: string) => api<PublicUser[]>(`/users/search?q=${encodeURIComponent(q)}`),
  byUsername:   (username: string) => api<PublicUser>(`/users/@${encodeURIComponent(username)}`),
  updateMe:     (patch: Partial<SelfUser>) =>
    api<SelfUser>("/users/me", { method: "PATCH", body: patch }),
};

export const ApiFriends = {
  list:    () => api<Friendship[]>("/friends"),
  pending: () => api<{ incoming: Friendship[]; outgoing: Friendship[] }>("/friends/pending"),
  request: (userId: string) => api<Friendship>("/friends/request", { method: "POST", body: { userId } }),
  accept:  (userId: string) => api<Friendship>("/friends/accept",  { method: "POST", body: { userId } }),
  decline: (userId: string) => api<Friendship>("/friends/decline", { method: "POST", body: { userId } }),
};
