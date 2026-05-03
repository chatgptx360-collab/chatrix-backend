"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useParams, usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Users, Settings, Search, X, Plus, Pin, BellOff } from "lucide-react";
import { ApiChats } from "@/lib/api/endpoints";
import { useAuthStore } from "@/lib/auth/store";
import { useSocketEvent, useSocketStatus } from "@/lib/socket";
import { Avatar } from "@/components/ui/Avatar";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { cn } from "@/lib/cn";
import { formatRelativeTime, kindLabel, previewBody } from "@/lib/format";
import type { Chat, Message } from "@chatrix/shared/types";

/**
 * Persistent sidebar. Three regions:
 *   1. Brand + nav rail (small left strip)
 *   2. Chat list — search, pinned, unread badges. Live-updates via socket.
 *   3. Profile pill at the bottom — quick access to /settings
 *
 * The chat list is the same data served to mobile; rendering rules match
 * the mobile ChatRow so the product feels consistent across surfaces.
 */
export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const params = useParams<{ id?: string }>();
  const activeChatId = params?.id;
  const me = useAuthStore((s) => s.user);
  const connected = useSocketStatus();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("");

  const { data: chats = [], isLoading } = useQuery({
    queryKey: ["chats", "list"],
    queryFn:  () => ApiChats.list(),
  });

  // Live updates — invalidate the list whenever a message arrives or a chat is
  // updated server-side.
  useSocketEvent("message:created", () => queryClient.invalidateQueries({ queryKey: ["chats", "list"] }));
  useSocketEvent("chat:updated",    () => queryClient.invalidateQueries({ queryKey: ["chats", "list"] }));

  const filtered = useMemo(() => {
    if (!filter.trim()) return chats;
    const q = filter.trim().toLowerCase();
    return chats.filter((c) => {
      const peer = c.members?.[0]?.user;
      const title  = c.type === "dm" ? (peer?.displayName ?? `@${peer?.username ?? ""}`) : (c.title ?? "");
      const handle = peer?.username ?? "";
      return title.toLowerCase().includes(q) || handle.toLowerCase().includes(q);
    });
  }, [filter, chats]);

  // ---------- Active nav highlighting ----------
  const inFriends  = pathname.startsWith("/friends");
  const inSettings = pathname.startsWith("/settings");
  const inChats    = pathname.startsWith("/chats") || pathname === "/";

  return (
    <aside className="h-full w-[340px] shrink-0 border-r border-border bg-surface flex">
      {/* Nav rail */}
      <nav className="w-[64px] shrink-0 border-r border-border flex flex-col items-center justify-between py-4">
        <div className="flex flex-col items-center gap-1.5">
          <Link href="/chats" className="mb-3" aria-label="Chatrix"><BrandLogo size={28} /></Link>
          <RailButton label="Chats"    active={inChats}    onClick={() => router.push("/chats")}>
            <MessageCircle size={20} />
          </RailButton>
          <RailButton label="Friends"  active={inFriends}  onClick={() => router.push("/friends")}>
            <Users size={20} />
          </RailButton>
          <RailButton label="Settings" active={inSettings} onClick={() => router.push("/settings")}>
            <Settings size={20} />
          </RailButton>
        </div>
        <Link href="/settings" className="block" aria-label="Profile">
          <Avatar url={me?.avatarUrl} name={me?.displayName ?? me?.username} size={36} />
        </Link>
      </nav>

      {/* Chat list pane */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-[22px] font-bold tracking-tight text-fg">
              {inFriends ? "Friends" : inSettings ? "Settings" : "Chats"}
            </h1>
            <button
              onClick={() => router.push("/friends")}
              aria-label="New chat"
              className="h-9 w-9 rounded-full bg-brand-gradient text-white inline-flex items-center justify-center shadow-glow hover:opacity-95 transition"
            >
              <Plus size={18} strokeWidth={2.5} />
            </button>
          </div>

          {/* Search */}
          <label className="flex items-center gap-2 h-10 px-3 rounded-xl bg-elevated border border-border focus-within:border-primary/60 transition">
            <Search size={16} className="text-muted" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search conversations"
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted text-fg"
            />
            {filter && (
              <button onClick={() => setFilter("")} className="text-muted hover:text-fg" aria-label="Clear search">
                <X size={14} />
              </button>
            )}
          </label>

          {!connected && (
            <p className="mt-2 text-[11px] text-danger">Reconnecting…</p>
          )}
        </header>

        <div className="flex-1 overflow-y-auto pb-3">
          {isLoading ? (
            <div className="flex items-center justify-center h-24">
              <div className="h-5 w-5 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted text-center px-6 py-12">
              {filter ? `No conversations match "${filter}"` : "No conversations yet — find friends to get started."}
            </p>
          ) : (
            <ul className="px-1.5">
              {filtered.map((chat) => (
                <ChatRow key={chat.id} chat={chat} viewerId={me?.id} active={chat.id === activeChatId} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </aside>
  );
}

// =====================================================
// Components
// =====================================================

function RailButton({
  label, active, onClick, children,
}: { label: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "h-10 w-10 rounded-xl flex items-center justify-center transition",
        active
          ? "bg-elevated text-primary"
          : "text-muted hover:bg-elevated hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

function ChatRow({
  chat, viewerId, active,
}: { chat: Chat; viewerId?: string; active?: boolean }) {
  const peer = chat.members?.[0]?.user;
  const title  = chat.type === "dm" ? (peer?.displayName ?? `@${peer?.username ?? "unknown"}`) : (chat.title ?? "Group");
  const avatar = chat.type === "dm" ? peer?.avatarUrl : chat.avatarUrl;
  const presence = chat.type === "dm" ? peer?.presence : undefined;

  const last = chat.lastMessage;
  const isYou = last?.senderId === viewerId;
  const previewText = previewMessage(last, isYou);

  const unread = chat.unreadCount ?? 0;
  const muted  = chat.members?.[0]?.mutedUntil ? new Date(chat.members[0]!.mutedUntil!) > new Date() : false;
  const pinned = chat.members?.[0]?.pinned;

  return (
    <li>
      <Link
        href={`/chats/${chat.id}`}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-xl transition group",
          active ? "bg-elevated" : "hover:bg-elevated/60",
        )}
      >
        <Avatar url={avatar ?? undefined} name={title} presence={presence} size={44} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className={cn("flex-1 truncate text-[15px] font-semibold tracking-tight", active ? "text-fg" : "text-fg")}>
              {title}
            </p>
            {muted  && <BellOff size={12} className="text-muted shrink-0" />}
            {pinned && <Pin     size={12} className="text-muted shrink-0" />}
            {last && (
              <span className={cn("ml-1.5 shrink-0 text-[11px]", unread > 0 ? "text-primary" : "text-muted")}>
                {formatRelativeTime(last.createdAt)}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <p className={cn(
              "flex-1 truncate text-[13px] leading-snug",
              unread > 0 && !muted ? "text-fg font-medium" : "text-muted",
            )}>
              {previewText}
            </p>
            {unread > 0 && (
              <span
                className={cn(
                  "shrink-0 inline-flex items-center justify-center rounded-full px-1.5 min-w-[18px] h-[18px] text-[10px] font-bold text-white",
                  muted ? "bg-muted" : "bg-primary",
                )}
              >
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}

function previewMessage(m: Message | null | undefined, isYou: boolean): string {
  if (!m) return "Tap to start chatting";
  if (m.deletedAt) return isYou ? "You deleted a message" : "This message was deleted";
  const prefix = isYou ? "You: " : "";
  if (m.kind === "text") return prefix + (previewBody(m.body) || "(empty)");
  return prefix + kindLabel(m.kind);
}
