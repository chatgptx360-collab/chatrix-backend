"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  Users, MessageSquare, HardDrive, Wifi, UserPlus, Flag, ArrowRight,
} from "lucide-react";
import { ApiAdmin, type AdminStats } from "@/lib/api/admin";
import { cn } from "@/lib/cn";

/**
 * Overview — stat cards + shortcut cards. Refreshes every 15 s while the
 * tab is focused so operators see the system pulse.
 *
 * No charts here yet — when we add them, ship via Recharts (already a peer
 * dep of the project's charting needs in Phase 7).
 */
export default function AdminOverviewPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn:  () => ApiAdmin.stats(),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });

  return (
    <div className="flex-1 overflow-y-auto chat-scroll">
      <header className="h-[60px] shrink-0 border-b border-border px-8 flex items-center">
        <h1 className="text-[18px] font-semibold tracking-tight text-fg">Overview</h1>
        <span className="ml-3 inline-block h-2 w-2 rounded-full bg-success animate-pulse" title="Live" />
      </header>

      <div className="p-8 max-w-6xl">
        <h2 className="text-[13px] font-bold uppercase tracking-wider text-muted mb-3">Now</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            icon={<Users size={20} />}
            label="Total users"
            value={isLoading ? null : data?.users}
            sub={data ? `${fmtNumber(data.signupsToday)} today · ${fmtNumber(data.signupsWeek)} this week` : null}
          />
          <StatCard
            icon={<Wifi size={20} />}
            label="Online now"
            value={isLoading ? null : data?.online}
            tone="accent"
          />
          <StatCard
            icon={<MessageSquare size={20} />}
            label="Messages (24 h)"
            value={isLoading ? null : data?.messages24h}
          />
          <StatCard
            icon={<HardDrive size={20} />}
            label="Media stored"
            value={isLoading ? null : data ? fmtBytes(data.mediaBytes) : null}
            sub="Across all users"
          />
        </div>

        <h2 className="text-[13px] font-bold uppercase tracking-wider text-muted mt-10 mb-3">Needs attention</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ShortcutCard
            href="/admin/reports"
            icon={<Flag size={18} />}
            title="Reports queue"
            description={
              isLoading
                ? "Loading…"
                : data?.openReports
                  ? `${data.openReports} open ${data.openReports === 1 ? "report" : "reports"} to review`
                  : "Inbox zero — nothing to action"
            }
            highlight={!isLoading && (data?.openReports ?? 0) > 0}
          />
          <ShortcutCard
            href="/admin/users"
            icon={<UserPlus size={18} />}
            title="User management"
            description="Search, suspend, change roles, view sessions"
          />
        </div>
      </div>
    </div>
  );
}

// =====================================================
// Cards
// =====================================================

function StatCard({
  icon, label, value, sub, tone = "default",
}: {
  icon: React.ReactNode; label: string;
  value: AdminStats[keyof AdminStats] | string | null | undefined;
  sub?: string | null;
  tone?: "default" | "accent";
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-muted">{label}</span>
        <span className={cn(
          "h-8 w-8 rounded-xl flex items-center justify-center",
          tone === "accent" ? "bg-success/15 text-success" : "bg-primary/15 text-primary",
        )}>
          {icon}
        </span>
      </div>
      <p className="mt-3 text-[28px] font-bold tracking-tight text-fg tabular-nums">
        {value === null || value === undefined ? <span className="text-muted">—</span> : typeof value === "number" ? fmtNumber(value) : value}
      </p>
      {sub && <p className="mt-1 text-[12px] text-muted">{sub}</p>}
    </div>
  );
}

function ShortcutCard({
  href, icon, title, description, highlight,
}: {
  href: string; icon: React.ReactNode; title: string; description: string; highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center justify-between gap-4 p-5 rounded-2xl border bg-surface transition",
        highlight ? "border-danger/40 bg-danger/5 hover:bg-danger/10" : "border-border hover:bg-elevated",
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className={cn(
          "h-10 w-10 rounded-xl flex items-center justify-center",
          highlight ? "bg-danger/15 text-danger" : "bg-elevated text-primary",
        )}>{icon}</span>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-fg">{title}</p>
          <p className="text-[13px] text-muted truncate">{description}</p>
        </div>
      </div>
      <ArrowRight size={16} className={highlight ? "text-danger" : "text-muted group-hover:text-fg transition"} />
    </Link>
  );
}

// ---------- Format helpers ----------

function fmtNumber(n: number): string {
  return new Intl.NumberFormat().format(n);
}

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = b / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}
