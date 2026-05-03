"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Search, X, Loader2, MessageSquare, Flag } from "lucide-react";
import { ApiAdmin, type AdminUser } from "@/lib/api/admin";
import { Avatar } from "@/components/ui/Avatar";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatRelativeTime } from "@/lib/format";

/**
 * Users index — searchable, status-filterable list. Click any row to open the
 * detail page where moderation actions live.
 */
export default function AdminUsersPage() {
  const [q,        setQ]        = useState("");
  const [debounced, setDebounced] = useState("");
  const [status,   setStatus]   = useState<AdminUser["status"] | "">("");

  // Debounce the search box so we don't hammer the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin", "users", debounced, status],
    queryFn: () => ApiAdmin.listUsers({
      q: debounced.trim() || undefined,
      status: status || undefined,
    }),
    placeholderData: (prev) => prev,
  });

  return (
    <div className="flex-1 overflow-y-auto chat-scroll">
      <header className="h-[60px] shrink-0 border-b border-border px-8 flex items-center justify-between">
        <h1 className="text-[18px] font-semibold tracking-tight text-fg">Users</h1>
        {isFetching && <Loader2 size={14} className="text-muted animate-spin" />}
      </header>

      <div className="p-8 max-w-6xl">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <label className="flex items-center gap-2 h-10 px-4 rounded-xl bg-surface border border-border focus-within:border-primary/60 transition flex-1 min-w-[260px]">
            <Search size={16} className="text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by username or email…"
              autoFocus
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted text-fg"
            />
            {q && (
              <button onClick={() => setQ("")} className="text-muted hover:text-fg" aria-label="Clear">
                <X size={14} />
              </button>
            )}
          </label>

          <div className="flex items-center gap-1 p-1 rounded-xl bg-surface border border-border">
            {(["", "active", "suspended", "banned"] as const).map((s) => (
              <button
                key={s || "all"}
                onClick={() => setStatus(s)}
                className={`px-3 h-8 rounded-lg text-[12px] font-semibold transition ${
                  status === s
                    ? "bg-elevated text-fg"
                    : "text-muted hover:text-fg"
                }`}
              >
                {s ? s[0]!.toUpperCase() + s.slice(1) : "All"}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-border bg-surface overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-elevated/40">
                <th className="text-left text-[11px] font-bold uppercase tracking-wider text-muted px-5 py-3">User</th>
                <th className="text-left text-[11px] font-bold uppercase tracking-wider text-muted px-3 py-3">Status</th>
                <th className="text-left text-[11px] font-bold uppercase tracking-wider text-muted px-3 py-3">Role</th>
                <th className="text-left text-[11px] font-bold uppercase tracking-wider text-muted px-3 py-3 hidden lg:table-cell">Activity</th>
                <th className="text-left text-[11px] font-bold uppercase tracking-wider text-muted px-3 py-3">Joined</th>
                <th className="text-right text-[11px] font-bold uppercase tracking-wider text-muted px-5 py-3 hidden md:table-cell">Reports</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="px-5 py-12 text-center"><Loader2 size={18} className="text-primary animate-spin inline" /></td></tr>
              ) : data?.items.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-muted text-sm">No users match those filters.</td></tr>
              ) : (
                data?.items.map((u) => (
                  <tr key={u.id} className="border-b border-border last:border-0 hover:bg-elevated/40 transition">
                    <td className="px-5 py-3">
                      <Link href={`/admin/users/${u.id}`} className="flex items-center gap-3 min-w-0">
                        <Avatar url={u.avatarUrl} name={u.displayName ?? u.username} presence={u.presence} size={36} />
                        <div className="min-w-0">
                          <p className="text-[14px] font-semibold text-fg truncate">
                            {u.displayName ?? `@${u.username}`}
                          </p>
                          <p className="text-[12px] text-muted truncate">@{u.username} · {u.email}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-3 py-3"><StatusBadge value={u.status} /></td>
                    <td className="px-3 py-3"><StatusBadge value={u.role} /></td>
                    <td className="px-3 py-3 hidden lg:table-cell text-[12px] text-muted">
                      <span className="inline-flex items-center gap-1"><MessageSquare size={11} /> {u.messagesCount}</span>
                    </td>
                    <td className="px-3 py-3 text-[12px] text-muted whitespace-nowrap">{formatRelativeTime(u.createdAt)}</td>
                    <td className="px-5 py-3 text-right hidden md:table-cell">
                      {u.reportsCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-danger">
                          <Flag size={11} /> {u.reportsCount}
                        </span>
                      ) : (
                        <span className="text-[12px] text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {data?.hasMore && (
          <p className="mt-4 text-center text-[12px] text-muted">
            Showing first {data.items.length}. Pagination cursor wired — UI lands when needed.
          </p>
        )}
      </div>
    </div>
  );
}
