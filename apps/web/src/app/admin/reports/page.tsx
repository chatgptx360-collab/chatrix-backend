"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Eye, CheckCircle2, XCircle, Flag } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ApiAdmin, type AdminReport } from "@/lib/api/admin";
import { formatRelativeTime } from "@/lib/format";
import { ChatrixError } from "@chatrix/shared/errors";

/**
 * Reports queue. Default view is open + reviewing (the work-to-do filter);
 * operators can flip to "all" or any single status.
 *
 * Each row gets three quick actions:
 *   - Review (mark as in-progress so other mods don't double-handle)
 *   - Action (mark resolved with a one-line resolution string)
 *   - Dismiss (no-action close, also resolution-tagged)
 *
 * The user-detail page is the next-step landing for any user-targeted report.
 */
export default function AdminReportsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<AdminReport["status"] | "open+reviewing">("open+reviewing");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin", "reports", filter],
    queryFn: () =>
      filter === "open+reviewing"
        ? Promise.all([ApiAdmin.listReports("open"), ApiAdmin.listReports("reviewing")])
            .then(([a, b]) => [...a, ...b].sort((x, y) => +new Date(y.createdAt) - +new Date(x.createdAt)))
        : ApiAdmin.listReports(filter),
    placeholderData: (prev) => prev,
  });

  async function action(id: string, status: "reviewing" | "actioned" | "dismissed") {
    let resolution: string | undefined;
    if (status === "actioned" || status === "dismissed") {
      resolution = prompt("One-line resolution (logged to audit log):") ?? undefined;
      if (!resolution) return;
    }
    setPendingId(id); setError(null);
    try {
      await ApiAdmin.setReportStatus(id, status, resolution);
      queryClient.invalidateQueries({ queryKey: ["admin", "reports"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    } catch (err) {
      setError(err instanceof ChatrixError ? err.message : "Couldn't update report.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto chat-scroll">
      <header className="h-[60px] shrink-0 border-b border-border px-8 flex items-center justify-between">
        <h1 className="text-[18px] font-semibold tracking-tight text-fg">Reports</h1>
        {isFetching && <Loader2 size={14} className="text-muted animate-spin" />}
      </header>

      <div className="p-8 max-w-5xl">
        {/* Filter bar */}
        <div className="mb-5 flex items-center gap-1 p-1 rounded-xl bg-surface border border-border w-fit">
          {[
            { v: "open+reviewing", l: "Inbox" },
            { v: "open",           l: "Open" },
            { v: "reviewing",      l: "Reviewing" },
            { v: "actioned",       l: "Actioned" },
            { v: "dismissed",      l: "Dismissed" },
          ].map((f) => (
            <button
              key={f.v}
              onClick={() => setFilter(f.v as typeof filter)}
              className={`px-3 h-8 rounded-lg text-[12px] font-semibold transition ${
                filter === f.v ? "bg-elevated text-fg" : "text-muted hover:text-fg"
              }`}
            >
              {f.l}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-danger/40 bg-danger/5 p-3 text-[13px] text-danger">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 size={20} className="text-primary animate-spin" /></div>
        ) : (data ?? []).length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface p-10 text-center">
            <Flag size={28} className="text-muted mx-auto mb-3" />
            <p className="text-[15px] font-semibold text-fg">Inbox zero</p>
            <p className="text-[13px] text-muted mt-1">Nothing in this bucket. Nice.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {(data ?? []).map((r) => (
              <li key={r.id} className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <StatusBadge value={r.status} />
                      <span className="text-[12px] text-muted">{formatRelativeTime(r.createdAt)}</span>
                      <span className="text-[12px] text-muted">·</span>
                      <span className="text-[12px] text-muted capitalize">{r.targetKind} report</span>
                    </div>

                    <p className="text-[15px] font-semibold text-fg">{r.reason}</p>
                    {r.details && (
                      <p className="mt-1 text-[14px] text-muted leading-relaxed whitespace-pre-wrap">
                        {r.details}
                      </p>
                    )}

                    {/* Reporter + target */}
                    <div className="mt-3 flex items-center gap-6 flex-wrap text-[12px] text-muted">
                      {r.reporter && (
                        <div className="flex items-center gap-2">
                          <Avatar name={r.reporter.displayName ?? r.reporter.username} size={20} />
                          <span>Reported by <Link href={`/admin/users/${r.reporter.id}`} className="text-fg font-semibold hover:underline">@{r.reporter.username}</Link></span>
                        </div>
                      )}
                      {r.target && r.targetKind === "user" && (
                        <div className="flex items-center gap-2">
                          <span>Target:</span>
                          <Link href={`/admin/users/${r.targetId}`} className="text-fg font-semibold hover:underline flex items-center gap-1">
                            @{r.target.username}
                            <StatusBadge value={r.target.status} />
                          </Link>
                        </div>
                      )}
                    </div>

                    {r.resolution && (
                      <p className="mt-3 px-3 py-2 rounded-xl bg-elevated text-[13px] text-fg">
                        <span className="text-muted font-semibold uppercase tracking-wider text-[10px]">Resolution: </span>
                        {r.resolution}
                      </p>
                    )}
                  </div>

                  {r.status !== "actioned" && r.status !== "dismissed" && (
                    <div className="flex flex-col gap-2 shrink-0">
                      {r.status === "open" && (
                        <Button
                          label="Review"
                          size="sm"
                          variant="secondary"
                          icon={<Eye size={14} />}
                          loading={pendingId === r.id}
                          onClick={() => action(r.id, "reviewing")}
                        />
                      )}
                      <Button
                        label="Action"
                        size="sm"
                        icon={<CheckCircle2 size={14} />}
                        loading={pendingId === r.id}
                        onClick={() => action(r.id, "actioned")}
                      />
                      <Button
                        label="Dismiss"
                        size="sm"
                        variant="ghost"
                        icon={<XCircle size={14} />}
                        loading={pendingId === r.id}
                        onClick={() => action(r.id, "dismissed")}
                      />
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
