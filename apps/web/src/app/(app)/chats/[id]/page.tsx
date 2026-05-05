"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Phone, Video, MoreHorizontal, Loader2 } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { Composer } from "@/components/chat/Composer";
import { TypingDots } from "@/components/chat/TypingDots";
import { ReactionPicker } from "@/components/chat/ReactionPicker";
import { ReplyBanner } from "@/components/chat/ReplyBanner";
import { ApiChats, ApiMessages } from "@/lib/api/endpoints";
import { useAuthStore } from "@/lib/auth/store";
import { useSocketEvent, getSocket } from "@/lib/socket";
import { formatLastSeen } from "@/lib/format";
import type { Message, UUID } from "@chatrix/shared/types";

/**
 * Chat room (web). Mirrors the mobile screen feature-for-feature:
 *
 *   - Joins `chat:<id>` socket room on mount, leaves on unmount.
 *   - Optimistic send via clientId; server's idempotent insert dedupes the
 *     echo. Local placeholder is dropped when the server message lands.
 *   - Read cursor advances whenever the chat is open or a new message lands.
 *   - Auto-scroll only when the viewer was already near the bottom — no
 *     yanking out of the history they're reading.
 *   - Incremental history via `nextCursor` on scroll-to-top.
 */
export default function ChatRoomPage() {
  const { id } = useParams<{ id: string }>();
  const chatId = id!;
  const me = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  // Auto-scroll bookkeeping — flipped from the scroll handler.
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);

  const { data: chat } = useQuery({ queryKey: ["chat", chatId], queryFn: () => ApiChats.load(chatId) });
  const messagesQuery = useQuery({
    queryKey: ["messages", chatId],
    queryFn: () => ApiMessages.list(chatId),
  });
  const messages = messagesQuery.data?.items ?? [];

  const [optimistic, setOptimistic] = useState<Message[]>([]);
  const [typingUsers, setTypingUsers] = useState<Set<UUID>>(new Set());
  const [loadingMore, setLoadingMore] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [picker, setPicker] = useState<{ messageId: string; rect: DOMRect; mine: boolean } | null>(null);

  const peer = chat?.members?.[0]?.user;
  const headerTitle = chat?.type === "dm"
    ? (peer?.displayName ?? `@${peer?.username ?? ""}`)
    : (chat?.title ?? "Group");
  const headerSubtitle = chat?.type === "dm" && peer
    ? formatLastSeen(peer.presence, peer.lastSeenAt)
    : (chat?.members ? `${chat.members.length} members` : "");

  // ---------- Socket lifecycle ----------

  useEffect(() => {
    const socket = getSocket();
    socket.emit("chat:join", chatId, () => undefined);
    return () => { socket.emit("chat:leave", chatId); };
  }, [chatId]);

  useSocketEvent("message:created", (m) => {
    if (m.chatId !== chatId) return;
    queryClient.setQueryData<typeof messagesQuery.data>(["messages", chatId], (prev) => {
      const items = prev?.items ?? [];
      if (items.some((x) => x.id === m.id)) return prev;
      return { ...prev!, items: [m, ...items], hasMore: prev?.hasMore ?? false, nextCursor: prev?.nextCursor ?? null };
    });
    if (m.senderId === me?.id && m.clientId) {
      setOptimistic((list) => list.filter((x) => x.clientId !== m.clientId));
    }
    if (nearBottomRef.current) requestAnimationFrame(() => scrollToBottom("smooth"));
  });

  useSocketEvent("message:updated", (m) => {
    if (m.chatId !== chatId) return;
    queryClient.setQueryData<typeof messagesQuery.data>(["messages", chatId], (prev) => prev && {
      ...prev, items: prev.items.map((x) => x.id === m.id ? m : x),
    });
  });

  useSocketEvent("message:deleted", ({ chatId: cid, messageId }) => {
    if (cid !== chatId) return;
    queryClient.setQueryData<typeof messagesQuery.data>(["messages", chatId], (prev) => prev && {
      ...prev,
      items: prev.items.map((x) => x.id === messageId
        ? { ...x, body: null, deletedAt: new Date().toISOString() }
        : x),
    });
  });

  useSocketEvent("reaction:updated", ({ chatId: cid, messageId, reactions }) => {
    if (cid !== chatId) return;
    queryClient.setQueryData<typeof messagesQuery.data>(["messages", chatId], (prev) => prev && {
      ...prev, items: prev.items.map((x) => x.id === messageId ? { ...x, reactions } : x),
    });
  });

  useSocketEvent("typing:started", ({ chatId: cid, userId }) => {
    if (cid !== chatId || userId === me?.id) return;
    setTypingUsers((s) => new Set(s).add(userId));
  });
  useSocketEvent("typing:stopped", ({ chatId: cid, userId }) => {
    if (cid !== chatId) return;
    setTypingUsers((s) => { const next = new Set(s); next.delete(userId); return next; });
  });

  // Defensive: drop hanging typers if their `stop` event is lost.
  useEffect(() => {
    if (typingUsers.size === 0) return;
    const t = setTimeout(() => setTypingUsers(new Set()), 5_000);
    return () => clearTimeout(t);
  }, [typingUsers]);

  // ---------- Read receipts ----------

  useEffect(() => {
    const newest = messages[0];
    if (!newest || newest.senderId === me?.id) return;
    ApiMessages.markRead(chatId, newest.id).catch(() => undefined);
  }, [messages[0]?.id, chatId, me?.id]);

  // ---------- Initial scroll ----------

  useEffect(() => {
    // Snap to bottom on first chat load — no smooth scroll for the cold start.
    if (!messagesQuery.isLoading) requestAnimationFrame(() => scrollToBottom("auto"));
  }, [chatId, messagesQuery.isLoading]);

  function scrollToBottom(behavior: ScrollBehavior) {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    if (behavior === "smooth") el.scrollTo({ top: el.scrollHeight, behavior });
  }

  // ---------- Send ----------

  const handleSend = useCallback((
    body: string,
    attachmentIds?: string[],
    kindHint?: "text" | "audio" | "image" | "video" | "file" | "gif",
  ) => {
    const clientId = `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const replyTarget = replyTo;
    // Composer passes an explicit kind for audio (voice notes). For other
    // attachments we keep the legacy default of `image` — the server-rendered
    // message will replace this with the canonical kind based on the actual
    // media row, so a misidentified placeholder kind is purely cosmetic until
    // the round-trip completes.
    const kind: Message["kind"] = kindHint
      ?? ((attachmentIds && attachmentIds.length > 0) ? "image" : "text");

    const placeholder: Message = {
      id: clientId,
      chatId, senderId: me?.id ?? null, kind,
      body: body || null,
      replyToId: replyTarget?.id ?? null,
      replyTo: replyTarget ? {
        id: replyTarget.id, senderId: replyTarget.senderId,
        body: replyTarget.body, kind: replyTarget.kind,
      } : null,
      forwardedFrom: null,
      // The server-rendered bubble will replace this with the canonical
      // attachments shape (with public URLs); the optimistic placeholder
      // shows nothing until then so we don't ship a broken-image flash.
      attachments: [], reactions: [],
      editedAt: null, deletedAt: null,
      clientId, createdAt: new Date().toISOString(),
      state: "sent",
    };
    setOptimistic((list) => [placeholder, ...list]);
    setReplyTo(null);
    nearBottomRef.current = true;
    requestAnimationFrame(() => scrollToBottom("smooth"));

    ApiMessages.send({
      chatId,
      body: body || undefined,
      clientId,
      kind,
      replyToId: replyTarget?.id,
      attachments: attachmentIds,
    }).catch(() => {
      setOptimistic((list) => list.filter((x) => x.clientId !== clientId));
    });
  }, [chatId, me?.id, replyTo]);

  // ---------- Reactions ----------

  const handleToggleReaction = useCallback((messageId: string, emoji: string) => {
    // Optimistic — flip locally; rely on server's `reaction:updated` to settle.
    queryClient.setQueryData<typeof messagesQuery.data>(["messages", chatId], (prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map((m) => {
          if (m.id !== messageId) return m;
          const existing = m.reactions.find((r) => r.emoji === emoji);
          const mine = me?.id;
          if (!mine) return m;
          if (existing?.userIds.includes(mine)) {
            // toggle off
            const userIds = existing.userIds.filter((u) => u !== mine);
            return {
              ...m,
              reactions: userIds.length === 0
                ? m.reactions.filter((r) => r.emoji !== emoji)
                : m.reactions.map((r) => r.emoji === emoji ? { ...r, userIds, count: userIds.length } : r),
            };
          }
          // toggle on
          return existing ? {
            ...m,
            reactions: m.reactions.map((r) => r.emoji === emoji
              ? { ...r, userIds: [...r.userIds, mine], count: r.count + 1 }
              : r),
          } : { ...m, reactions: [...m.reactions, { emoji, userIds: [mine], count: 1 }] };
        }),
      };
    });

    // Decide the server call based on the *post-flip* local state.
    const item = queryClient.getQueryData<typeof messagesQuery.data>(["messages", chatId])
      ?.items.find((x) => x.id === messageId);
    const reaction = item?.reactions.find((r) => r.emoji === emoji);
    const stillMine = !!(reaction && me?.id && reaction.userIds.includes(me.id));
    const call = stillMine
      ? ApiMessages.addReaction(messageId, emoji)
      : ApiMessages.removeReaction(messageId, emoji);
    call.catch(() => undefined);
  }, [chatId, me?.id, queryClient]);

  const handleDelete = useCallback((messageId: string) => {
    if (!confirm("Delete this message for everyone?")) return;
    ApiMessages.remove(messageId, "everyone").catch(() => undefined);
  }, []);

  const handleTyping = useCallback((isTyping: boolean) => {
    const socket = getSocket();
    socket.emit(isTyping ? "typing:start" : "typing:stop", chatId);
  }, [chatId]);

  // ---------- Combined view list ----------

  const view = useMemo(() => {
    const serverIds = new Set(messages.map((m) => m.clientId).filter(Boolean));
    const uncommitted = optimistic.filter((m) => !serverIds.has(m.clientId ?? ""));
    return [...uncommitted, ...messages];
  }, [messages, optimistic]);

  // ---------- Infinite history ----------

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;

    if (loadingMore) return;
    if (el.scrollTop < 60 && messagesQuery.data?.hasMore) {
      const cursor = messagesQuery.data.nextCursor;
      if (!cursor) return;
      setLoadingMore(true);
      const prevHeight = el.scrollHeight;

      ApiMessages.list(chatId, cursor)
        .then((page) => {
          queryClient.setQueryData<typeof messagesQuery.data>(["messages", chatId], (prev) => prev && {
            ...prev,
            items: [...prev.items, ...page.items],
            hasMore: page.hasMore,
            nextCursor: page.nextCursor,
          });
          // Preserve scroll offset relative to the new content height — no
          // jumpy "rubber-band" effect when older messages prepend.
          requestAnimationFrame(() => {
            if (!scrollRef.current) return;
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight - prevHeight + el.scrollTop;
          });
        })
        .finally(() => setLoadingMore(false));
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <header className="h-[60px] shrink-0 border-b border-border px-5 flex items-center gap-3 bg-bg">
        {peer ? (
          <Link href={`/u/${peer.username}`} className="flex items-center gap-3 min-w-0 flex-1">
            <Avatar url={peer.avatarUrl} name={headerTitle} presence={peer.presence} size={36} />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-fg leading-tight">{headerTitle}</p>
              <p className={`truncate text-[12px] mt-0.5 ${typingUsers.size > 0 ? "text-primary" : "text-muted"}`}>
                {typingUsers.size > 0 ? "typing…" : headerSubtitle}
              </p>
            </div>
          </Link>
        ) : (
          <div className="flex-1">
            <p className="text-[15px] font-semibold text-fg">{headerTitle}</p>
            <p className="text-[12px] text-muted">{headerSubtitle}</p>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <HeaderIconButton aria-label="Voice call"><Phone size={18} /></HeaderIconButton>
          <HeaderIconButton aria-label="Video call"><Video size={18} /></HeaderIconButton>
          <HeaderIconButton aria-label="More"><MoreHorizontal size={18} /></HeaderIconButton>
        </div>
      </header>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto chat-scroll bg-bg pt-3"
      >
        {loadingMore && (
          <div className="flex justify-center py-2">
            <Loader2 size={16} className="text-muted animate-spin" />
          </div>
        )}

        {messagesQuery.isLoading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 size={20} className="text-primary animate-spin" />
          </div>
        ) : (
          // Render OLDEST → NEWEST top to bottom. The API returns newest first,
          // so we reverse the slice once here and let the container scroll.
          [...view].reverse().map((m, i, arr) => {
            const prev = arr[i - 1]; // older
            const next = arr[i + 1]; // newer
            const groupedWithPrev = !!prev && prev.senderId === m.senderId &&
              Math.abs(new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime()) < 5 * 60_000;
            const groupedWithNext = !!next && next.senderId === m.senderId &&
              Math.abs(new Date(next.createdAt).getTime() - new Date(m.createdAt).getTime()) < 5 * 60_000;

            return (
              <MessageBubble
                key={m.id}
                message={m}
                mine={m.senderId === me?.id}
                groupedWithPrev={groupedWithPrev}
                groupedWithNext={groupedWithNext}
                onReact={(rect, mine) => setPicker({ messageId: m.id, rect, mine })}
                onReply={() => setReplyTo(m)}
                onDelete={() => handleDelete(m.id)}
                onToggleReaction={(emoji) => handleToggleReaction(m.id, emoji)}
              />
            );
          })
        )}

        {typingUsers.size > 0 && <TypingDots />}
        <div className="h-2" />
      </div>

      {replyTo && (
        <ReplyBanner
          target={replyTo}
          authorLabel={
            replyTo.senderId === me?.id
              ? "yourself"
              : (peer ? (peer.displayName ?? `@${peer.username}`) : "them")
          }
          onCancel={() => setReplyTo(null)}
        />
      )}

      <Composer onSubmit={handleSend} onTyping={handleTyping} />

      {picker && (
        <ReactionPicker
          anchor={{
            x: picker.rect.left, y: picker.rect.top,
            width: picker.rect.width, height: picker.rect.height,
          }}
          mine={picker.mine}
          onPick={(emoji) => handleToggleReaction(picker.messageId, emoji)}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

function HeaderIconButton({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className="h-9 w-9 rounded-xl flex items-center justify-center text-muted hover:text-fg hover:bg-elevated transition"
    >
      {children}
    </button>
  );
}
