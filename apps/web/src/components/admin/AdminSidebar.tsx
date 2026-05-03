"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, Flag, ClipboardList, ArrowLeft, ShieldCheck,
} from "lucide-react";
import { useAuthStore } from "@/lib/auth/store";
import { Avatar } from "@/components/ui/Avatar";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { cn } from "@/lib/cn";

/**
 * Admin sidebar. Sister to the chat sidebar — same visual rhythm but its own
 * surface so operators feel they're in a different "mode" of the app.
 *
 * Top: brand mark + "Admin" label with a shield glyph (the visual cue that
 * this is the privileged shell).
 *
 * Bottom: profile pill + a "back to app" shortcut.
 */
export function AdminSidebar() {
  const pathname = usePathname() ?? "";
  const me = useAuthStore((s) => s.user);

  const links = [
    { href: "/admin",         label: "Overview", icon: LayoutDashboard, exact: true },
    { href: "/admin/users",   label: "Users",    icon: Users },
    { href: "/admin/reports", label: "Reports",  icon: Flag },
    { href: "/admin/audit",   label: "Audit log", icon: ClipboardList },
  ];

  return (
    <aside className="h-full w-[260px] shrink-0 border-r border-border bg-surface flex flex-col">
      <div className="px-5 pt-5 pb-3 flex items-center gap-2.5">
        <BrandLogo size={28} />
        <div>
          <p className="text-[15px] font-semibold tracking-tight text-fg leading-none">Chatrix</p>
          <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-primary">
            <ShieldCheck size={10} /> Admin
          </span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-2 overflow-y-auto chat-scroll">
        <ul className="space-y-1">
          {links.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-xl transition",
                    active
                      ? "bg-elevated text-fg"
                      : "text-muted hover:bg-elevated/60 hover:text-fg",
                  )}
                >
                  <Icon size={18} className={active ? "text-primary" : ""} />
                  <span className="text-[14px] font-medium">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="px-3 py-3 border-t border-border">
        <Link
          href="/chats"
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-muted hover:text-fg hover:bg-elevated/60 transition text-[13px]"
        >
          <ArrowLeft size={14} />
          Back to Chatrix
        </Link>

        {me && (
          <div className="mt-2 flex items-center gap-2 px-3 py-2">
            <Avatar url={me.avatarUrl} name={me.displayName ?? me.username} size={32} />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-fg truncate">
                {me.displayName ?? `@${me.username}`}
              </p>
              <p className="text-[11px] text-muted capitalize">{me.role}</p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
