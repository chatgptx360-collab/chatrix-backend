"use client";
import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Mail, Calendar, MessageSquare, Flag, MonitorSmartphone,
  Ban, ShieldCheck, ShieldOff, RotateCcw, Loader2,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ApiAdmin } from "@/lib/api/admin";
import { formatRelativeTime, formatLastSeen } from "@/lib/format";
import { useAuthStore } from "@/lib/auth/store";
import { ChatrixError } from "@chatrix/shared/errors";

/**
 * User detail. Header card + at-a-glance metrics + moderation actions.
 *
 * Action ergonomics:
 *   - State-changing buttons confirm before firing (banned is destructive).
 *   - The current user can never moderate themselves (server rejects too).
 *   - Role changes are admin-only — moderators see them disabled with a hint.
 */
export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const [busy, setBusy] = useState<"status" | "role" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: user, isLoading } = useQuery({
    queryKey: ["admin", "user", id],
    queryFn:  () => ApiAdmin.getUser(id!),
    enabled:  !!id,
  });

  const isSelf = me?.id === user?.id;
  const canChangeRole = me?.role === "admin";

  async function setStatus(status: "active" | "suspended" | "banned") {
    if (!user) return;
    if (status === "banned" && !confirm(`Ban @${user.username}? This signs them out everywhere and prevents login.`)) return;
    if (status === "suspended" && !confirm(`Suspend @${user.username}? They'll be signed out everywhere.`)) return;
    let reason: string | undefined;
    if (status !== "active") {
      reason = prompt("Reason (logged to audit log)?") ?? undefined;
    }
    setBusy("status"); setError(null);
    try {
      await ApiAdmin.setStatus(user.id, status, reason);
      queryClient.invalidateQueries({ queryKey: ["admin", "user", id] });
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    } catch (err) {
      setError(err instanceof ChatrixError ? err.message : "Couldn't update status.");
    } finally {
      setBusy(null);
    }
  }

  async function setRole(role: "user" | "moderator" | "admin") {
    if (!user) return;
    if (!confirm(`Set @${user.username} to ${role}?`)) return;
    setBusy("role"); setError(null);
    try {
      await ApiAdmin.setRole(user.id, role);
      queryClient.invalidateQueries({ queryKey: ["admin", "user", id] });
    } catch (err) {
      setError(err instanceof ChatrixError ? err.message : "Couldn't update role.");
    } finally {
      setBusy(null);
    }
  }

  if (isLoading || !user) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={20} className="text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto chat-scroll">
      <header className="h-[60px] shrink-0 border-b border-border px-8 flex items-center gap-3">
        <button onClick={() => router.back()} aria-label="Back" className="h-9 w-9 rounded-xl flex items-center justify-center text-muted hover:bg-elevated hover:text-fg transition">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-[18px] font-semibold tracking-tight text-fg">User detail</h1>
      </header>

      <div className="p-8 max-w-4xl">
        {/* Header card */}
        <div className="rounded-2xl border border-border bg-surface p-6 flex items-start gap-5">
          <Avatar url={user.avatarUrl} name={user.displayName ?? user.username} presence={user.presence} size={88} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-2xl font-bold tracking-tight text-fg">{user.displayName ?? `@${user.username}`}</h2>
              <StatusBadge value={user.status} />
              <StatusBadge value={user.role} />
            </div>
            <div className="mt-1 flex items-center gap-3 text-[13px] text-muted flex-wrap">
              <span>@{user.username}</span>
              <span>·</span>
              <span className="flex items-center gap-1"><Mail size={12} /> {user.email}</span>
              {!user.emailVerifiedAt && (
                <span className="text-danger font-semibold">unverified</span>
              )}
            </div>
            <div className="mt-1 text-[12px] text-muted">
              {formatLastSeen(user.presence, user.lastSeenAt)}
            </div>
            {user.bio && <p className="mt-3 text-[14px] text-fg leading-relaxed">{user.bio}</p>}
            <div className="mt-4">
              <Link href={`/u/${user.username}`} className="text-primary text-[13px] font-semibold hover:underline">
                View public profile →
              </Link>
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat icon={<Calendar size={16} />}       label="Joined"          value={formatRelativeTime(user.createdAt)} />
          <Stat icon={<MessageSquare size={16} />}  label="Messages sent"   value={user.messagesCount.toLocaleString()} />
          <Stat icon={<Flag size={16} />}           label="Reports against" value={user.reportsCount.toLocaleString()} highlight={user.reportsCount > 0} />
          <Stat icon={<MonitorSmartphone size={16} />} label="Active sessions"  value={user.activeSessions.toLocaleString()} />
        </div>

        {/* Moderation actions */}
        <h3 className="mt-10 text-[13px] font-bold uppercase tracking-wider text-muted mb-3">Moderation</h3>

        {isSelf ? (
          <div className="rounded-2xl border border-border bg-surface p-5">
            <p className="text-[14px] text-muted">
              You can't moderate your own account from this panel.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-surface p-5 space-y-5">
            {/* Status row */}
            <div>
              <p className="text-[13px] font-semibold text-fg mb-2">Account status</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  label="Reactivate"
                  size="sm"
                  variant={user.status === "active" ? "ghost" : "secondary"}
                  icon={<RotateCcw size={14} />}
                  loading={busy === "status"}
                  disabled={user.status === "active"}
                  onClick={() => setStatus("active")}
                />
                <Button
                  label="Suspend"
                  size="sm"
                  variant="secondary"
                  icon={<ShieldOff size={14} className="text-amber-500" />}
                  loading={busy === "status"}
                  disabled={user.status === "suspended"}
                  onClick={() => setStatus("suspended")}
                />
                <Button
                  label={user.status === "banned" ? "Banned" : "Ban"}
                  size="sm"
                  variant="danger"
                  icon={<Ban size={14} />}
                  loading={busy === "status"}
                  disabled={user.status === "banned"}
                  onClick={() => setStatus("banned")}
                />
              </div>
              <p className="mt-2 text-[12px] text-muted">
                Suspension and bans sign the user out of every device immediately.
              </p>
            </div>

            {/* Role row */}
            <div className="pt-5 border-t border-border">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-[13px] font-semibold text-fg">Role</p>
                {!canChangeRole && (
                  <span className="text-[12px] text-muted">Admin only</span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["user", "moderator", "admin"] as const).map((r) => (
                  <Button
                    key={r}
                    label={r[0]!.toUpperCase() + r.slice(1)}
                    size="sm"
                    variant={user.role === r ? "primary" : "secondary"}
                    icon={r === "admin" ? <ShieldCheck size={14} /> : undefined}
                    loading={busy === "role"}
                    disabled={user.role === r || !canChangeRole}
                    onClick={() => setRole(r)}
                  />
                ))}
              </div>
            </div>

            {error && <p className="text-[13px] text-danger">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({
  icon, label, value, highlight,
}: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border bg-surface p-4 ${highlight ? "border-danger/40" : "border-border"}`}>
      <div className="flex items-center gap-1.5 text-muted text-[11px] font-bold uppercase tracking-wider">
        {icon}
        <span>{label}</span>
      </div>
      <p className={`mt-2 text-xl font-bold tabular-nums ${highlight ? "text-danger" : "text-fg"}`}>
        {value}
      </p>
    </div>
  );
}
