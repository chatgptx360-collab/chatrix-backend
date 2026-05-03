"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ClipboardList } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ApiAdmin, type AdminAuditEntry } from "@/lib/api/admin";
import { formatRelativeTime } from "@/lib/format";

/**
 * Audit log. Newest first; load-more pagination via the cursor the API
 * returns. Each row renders the actor, the action verb, and the target with
 * a link if it's a user (the most common target kind).
 *
 * Action strings come from the backend canonical list:
 *   user.active        user.suspend       user.banned
 *   user.role.user     user.role.moderator user.role.admin
 *   report.reviewing   report.actioned    report.dismissed
 *
 * We keep a small humanizer that turns those into readable lines without
 * losing the underlying string (visible on hover for forensic clarity).
 */
export default function AdminAuditPage() {
  const [pages, setPages] = useState<AdminAuditEntry[][]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [done, setDone] = useState(false);

  const { data: firstPage, isLoading } = useQuery({
    queryKey: ["admin", "audit"],
    queryFn:  () => ApiAdmin.listAudit({ limit: 50 }),
  });

  const all = firstPage ? [firstPage.items, ...pages].flat() : [];
  const lastCursor = pages[pages.length - 1]?.[pages[pages.length - 1]!.length - 1]?.createdAt
                 ?? firstPage?.nextCursor;

  async function loadMore() {
    if (!lastCursor || done) return;
    setLoadingMore(true);
    try {
      const next = await ApiAdmin.listAudit({ cursor: lastCursor, limit: 50 });
      setPages((prev) => [...prev, next.items]);
      if (!next.hasMore) setDone(true);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto chat-scroll">
      <header className="h-[60px] shrink-0 border-b border-border px-8 flex items-center">
        <h1 className="text-[18px] font-semibold tracking-tight text-fg">Audit log</h1>
      </header>

      <div className="p-8 max-w-4xl">
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 size={20} className="text-primary animate-spin" /></div>
        ) : all.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface p-10 text-center">
            <ClipboardList size={28} className="text-muted mx-auto mb-3" />
            <p className="text-[15px] font-semibold text-fg">Nothing logged yet</p>
            <p className="text-[13px] text-muted mt-1">Every admin action is recorded here automatically.</p>
          </div>
        ) : (
          <>
            <ol className="rounded-2xl border border-border bg-surface overflow-hidden">
              {all.map((entry, i) => (
                <li key={entry.id} className={`flex items-start gap-3 p-4 ${i > 0 ? "border-t border-border" : ""}`}>
                  <Avatar
                    name={entry.actor?.displayName ?? entry.actor?.username ?? "system"}
                    size={32}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] text-fg leading-snug">
                      <span className="font-semibold">{entry.actor ? (entry.actor.displayName ?? `@${entry.actor.username}`) : "System"}</span>
                      {" "}
                      <span className="text-muted">{humanize(entry.action)}</span>
                      {" "}
                      {entry.targetKind === "user" && entry.targetId && (
                        <Link href={`/admin/users/${entry.targetId}`} className="text-primary hover:underline font-semibold">
                          a user →
                        </Link>
                      )}
                      {entry.targetKind === "report" && entry.targetId && (
                        <span className="text-fg font-semibold">a report</span>
                      )}
                    </p>
                    <p className="mt-1 text-[12px] text-muted" title={entry.action}>
                      {formatRelativeTime(entry.createdAt)} · <code className="font-mono">{entry.action}</code>
                    </p>
                    {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                      <pre className="mt-2 px-3 py-2 rounded-lg bg-elevated text-[12px] text-muted overflow-x-auto">
                        {JSON.stringify(entry.metadata, null, 2)}
                      </pre>
                    )}
                  </div>
                </li>
              ))}
            </ol>

            {!done && (firstPage?.hasMore || pages.length > 0) && (
              <div className="mt-4 flex justify-center">
                <Button
                  label={loadingMore ? "Loading…" : "Load more"}
                  variant="secondary"
                  size="sm"
                  loading={loadingMore}
                  onClick={loadMore}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Turn the canonical action string into a human-readable verb phrase.
 * Falls back to the raw string so unknown actions are still visible.
 */
function humanize(action: string): string {
  if (action === "user.active")    return "reactivated";
  if (action === "user.suspended") return "suspended";
  if (action === "user.banned")    return "banned";
  if (action.startsWith("user.role.")) return `set role to ${action.slice("user.role.".length)} on`;
  if (action === "report.reviewing") return "started reviewing";
  if (action === "report.actioned")  return "actioned";
  if (action === "report.dismissed") return "dismissed";
  return action;
}
