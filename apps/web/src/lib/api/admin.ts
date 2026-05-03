/**
 * Typed admin endpoints. Kept in their own file so the bundle for non-admin
 * pages doesn't import them — small but real win.
 */
import { api } from "./client";

export interface AdminStats {
  users: number;
  online: number;
  signupsToday: number;
  signupsWeek: number;
  messages24h: number;
  mediaBytes: number;
  openReports: number;
}

export interface AdminUser {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: "user" | "moderator" | "admin";
  status: "active" | "suspended" | "banned" | "deleted";
  emailVerifiedAt: string | null;
  presence: "online" | "away" | "offline";
  lastSeenAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  messagesCount: number;
  reportsCount: number;
}

export interface AdminUserDetail extends AdminUser {
  bio: string | null;
  activeSessions: number;
}

export interface AdminReport {
  id: string;
  targetKind: "user" | "message" | "chat";
  targetId: string;
  reason: string;
  details: string | null;
  status: "open" | "reviewing" | "actioned" | "dismissed";
  createdAt: string;
  handledAt: string | null;
  resolution: string | null;
  reporter: { id: string; username: string; displayName: string | null } | null;
  target: { username: string; displayName: string | null; status: string } | null;
}

export interface AdminAuditEntry {
  id: string;
  action: string;
  targetKind: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: { id: string; username: string; displayName: string | null } | null;
}

export interface CursorPage<T> {
  items: T[];
  hasMore: boolean;
  nextCursor: string | null;
}

export const ApiAdmin = {
  stats:    () => api<AdminStats>("/admin/stats"),

  listUsers: (opts: { q?: string; status?: AdminUser["status"]; cursor?: string; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (opts.q)      qs.set("q", opts.q);
    if (opts.status) qs.set("status", opts.status);
    if (opts.cursor) qs.set("cursor", opts.cursor);
    if (opts.limit)  qs.set("limit", String(opts.limit));
    return api<CursorPage<AdminUser>>(`/admin/users${qs.size ? `?${qs}` : ""}`);
  },

  getUser:   (id: string) => api<AdminUserDetail>(`/admin/users/${id}`),

  setStatus: (id: string, status: "active" | "suspended" | "banned", reason?: string) =>
    api<{ ok: true }>(`/admin/users/${id}/status`, { method: "PATCH", body: { status, reason } }),

  setRole: (id: string, role: "user" | "moderator" | "admin") =>
    api<{ ok: true }>(`/admin/users/${id}/role`, { method: "PATCH", body: { role } }),

  listReports: (status?: AdminReport["status"]) => {
    const qs = status ? `?status=${status}` : "";
    return api<AdminReport[]>(`/admin/reports${qs}`);
  },

  setReportStatus: (id: string, status: "reviewing" | "actioned" | "dismissed", resolution?: string) =>
    api<{ id: string }>(`/admin/reports/${id}`, { method: "PATCH", body: { status, resolution } }),

  listAudit: (opts: { cursor?: string; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (opts.cursor) qs.set("cursor", opts.cursor);
    if (opts.limit)  qs.set("limit", String(opts.limit));
    return api<CursorPage<AdminAuditEntry>>(`/admin/audit${qs.size ? `?${qs}` : ""}`);
  },
};
