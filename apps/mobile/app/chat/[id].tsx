import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  View, Text, FlatList, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { ArrowLeft } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { Avatar } from "@/components/Avatar";
import { MessageBubble } from "@/components/MessageBubble";
import { TypingDots } from "@/components/TypingDots";
import { Composer } from "@/components/Composer";
import { ReactionsSheet } from "@/components/ReactionsSheet";
import { ReplyBanner } from "@/components/ReplyBanner";
import { useTheme } from "@/lib/ui/theme";
import { ApiChats, ApiMessages } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/store";
import { useSocketEvent, getSocket } from "@/lib/socket";
import { formatLastSeen } from "@/lib/format";
import type { Chat, Message, UUID } from "@chatrix/shared/types";

/**
 * Chat room.
 *
 * Architecture:
 *   - Two queries: chat metadata (for the header) + paginated messages.
 *   - Joins the `chat:<id>` socket room on mount, leaves on unmount.
 *   - Subscribes to message:created/updated/deleted/reaction:updated.
 *   - Optimistic send: insert a placeholder with `clientId` immediately,
 *     replace it when the server emits `message:created` with the same
 *     `clientId` (idempotency-aware).
 *   - Marks the most-recent message read whenever the list scrolls or new
 *     ones arrive while focused.
 *   - Auto-scrolls to bottom when the viewer was already near the bottom;
 *     otherwise stays put (don't yank users away from history they're reading).
 */
export default function ChatRoom() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const chatId = id!;
  const router = useRouter();
  const t = useTheme();
  const queryClient = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const listRef = useRef<FlatList<Message>>(null);
  const nearBottomRef = useRef(true);

  const { data: chat } = useQuery({ queryKey: ["chat", chatId], queryFn: () => ApiChats.load(chatId) });

  const messagesQuery = useQuery({
    queryKey: ["messages", chatId],
    queryFn: () => ApiMessages.list(chatId),
  });
  const messages = messagesQuery.data?.items ?? [];

  // Local "optimistic" messages, keyed by clientId until the server echo lands.
  const [optimistic, setOptimistic] = useState<Message[]>([]);
  const [typingUsers, setTypingUsers] = useState<Set<UUID>>(new Set());
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [reactingId, setReactingId] = useState<string | null>(null);

  const peer = chat?.members?.[0]?.user;
  const headerTitle  = chat?.type === "dm" ? (peer?.displayName ?? `@${peer?.username ?? ""}`) : (chat?.title ?? "Group");
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
    // If this is our own echo, clear the matching optimistic placeholder.
    if (m.senderId === me?.id && m.clientId) {
      setOptimistic((list) => list.filter((x) => x.clientId !== m.clientId));
    }
    if (nearBottomRef.current) requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }));
  });

  useSocketEvent("message:updated", (m) => {
    if (m.chatId !== chatId) return;
    queryClient.setQueryData<typeof messagesQuery.data>(["messages", chatId], (prev) => prev && {
      ...prev,
      items: prev.items.map((x) => (x.id === m.id ? m : x)),
    });
  });

  useSocketEvent("message:deleted", ({ chatId: cid, messageId }) => {
    if (cid !== chatId) return;
    queryClient.setQueryData<typeof messagesQuery.data>(["messages", chatId], (prev) => prev && {
      ...prev,
      items: prev.items.map((x) => x.id === messageId ? { ...x, body: null, deletedAt: new Date().toISOString() } : x),
    });
  });

  useSocketEvent("reaction:updated", ({ chatId: cid, messageId, reactions }) => {
    if (cid !== chatId) return;
    queryClient.setQueryData<typeof messagesQuery.data>(["messages", chatId], (prev) => prev && {
      ...prev,
      items: prev.items.map((x) => x.id === messageId ? { ...x, reactions } : x),
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

  // Auto-clear typing indicators after 5s of silence (defensive — server already
  // emits `stopped`, but a dropped event would leave the dot hanging forever).
  useEffect(() => {
    if (typingUsers.size === 0) return;
    const t = setTimeout(() => setTypingUsers(new Set()), 5_000);
    return () => clearTimeout(t);
  }, [typingUsers]);

  // ---------- Read receipts ----------

  // Mark the newest message read whenever the chat is open.
  useEffect(() => {
    const newest = messages[0];
    if (!newest || newest.senderId === me?.id) return;
    ApiMessages.markRead(chatId, newest.id).catch(() => undefined);
  }, [messages[0]?.id, chatId, me?.id]);

  // ---------- Send ----------

  const handleSend = useCallback((
    body: string,
    attachmentIds?: string[],
    kindHint?: "text" | "audio" | "image" | "video" | "file" | "gif",
  ) => {
    const clientId = `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const replyTarget = replyTo;
    // Composer hints the message kind based on the dominant attachment so
    // optimistic placeholder + outgoing message kind match what the
    // receiver should render. Server's `message:created` echo replaces this
    // with the canonical row, so any imprecision is short-lived.
    const kind: Message["kind"] = kindHint
      ?? ((attachmentIds && attachmentIds.length > 0) ? "image" : "text");
    const placeholder: Message = {
      id: clientId, // temporary; replaced by server echo
      chatId, senderId: me?.id ?? null, kind,
      body: body || null,
      replyToId: replyTarget?.id ?? null,
      replyTo: replyTarget ? {
        id: replyTarget.id, senderId: replyTarget.senderId,
        body: replyTarget.body, kind: replyTarget.kind,
      } : null,
      forwardedFrom: null,
      attachments: [], reactions: [],
      editedAt: null, deletedAt: null,
      clientId, createdAt: new Date().toISOString(),
      state: "sent",
    };
    setOptimistic((list) => [placeholder, ...list]);
    setReplyTo(null);                  // clear once submitted

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

  const handleReact = useCallback((messageId: string, emoji: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Optimistic patch matches the web flow.
    queryClient.setQueryData<typeof messagesQuery.data>(["messages", chatId], (prev) => {
      if (!prev || !me) return prev;
      return {
        ...prev,
        items: prev.items.map((m) => {
          if (m.id !== messageId) return m;
          const existing = m.reactions.find((r) => r.emoji === emoji);
          if (existing?.userIds.includes(me.id)) {
            const userIds = existing.userIds.filter((u) => u !== me.id);
            return { ...m, reactions: userIds.length === 0
              ? m.reactions.filter((r) => r.emoji !== emoji)
              : m.reactions.map((r) => r.emoji === emoji ? { ...r, userIds, count: userIds.length } : r) };
          }
          return existing ? {
            ...m,
            reactions: m.reactions.map((r) => r.emoji === emoji
              ? { ...r, userIds: [...r.userIds, me.id], count: r.count + 1 }
              : r),
          } : { ...m, reactions: [...m.reactions, { emoji, userIds: [me.id], count: 1 }] };
        }),
      };
    });
    // Pick add vs remove based on the new local state.
    const item = queryClient.getQueryData<typeof messagesQuery.data>(["messages", chatId])
      ?.items.find((x) => x.id === messageId);
    const reaction = item?.reactions.find((r) => r.emoji === emoji);
    const stillMine = !!(reaction && me?.id && reaction.userIds.includes(me.id));
    (stillMine ? ApiMessages.addReaction(messageId, emoji)
               : ApiMessages.removeReaction(messageId, emoji)).catch(() => undefined);
  }, [chatId, me, queryClient]);

  const handleTyping = useCallback((isTyping: boolean) => {
    const socket = getSocket();
    socket.emit(isTyping ? "typing:start" : "typing:stop", chatId);
  }, [chatId]);

  // ---------- Combined view list ----------

  const view = useMemo(() => {
    // Optimistic at the very top (newest); de-dupe by clientId.
    const serverIds = new Set(messages.map((m) => m.clientId).filter(Boolean));
    const uncommitted = optimistic.filter((m) => !serverIds.has(m.clientId ?? ""));
    return [...uncommitted, ...messages];
  }, [messages, optimistic]);

  const renderItem = useCallback(({ item, index }: { item: Message; index: number }) => {
    const next = view[index - 1]; // newer, since list is inverted
    const prev = view[index + 1]; // older
    const groupedWithPrev = !!prev && prev.senderId === item.senderId &&
      Math.abs(new Date(item.createdAt).getTime() - new Date(prev.createdAt).getTime()) < 5 * 60_000;
    const groupedWithNext = !!next && next.senderId === item.senderId &&
      Math.abs(new Date(next.createdAt).getTime() - new Date(item.createdAt).getTime()) < 5 * 60_000;
    return (
      <MessageBubble
        message={item}
        mine={item.senderId === me?.id}
        groupedWithPrev={groupedWithPrev}
        groupedWithNext={groupedWithNext}
        onLongPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setReactingId(item.id);
        }}
      />
    );
  }, [view, me?.id]);

  return (
    <Screen edges={["top"]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: t.colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={{ padding: 6, marginRight: 6 }}>
          <ArrowLeft size={24} color={t.colors.fg} />
        </Pressable>
        <Pressable
          onPress={() => peer && router.push(`/profile/${peer.id}`)}
          style={{ flex: 1, flexDirection: "row", alignItems: "center" }}
          hitSlop={4}
        >
          <Avatar
            url={peer?.avatarUrl}
            name={headerTitle}
            presence={peer?.presence}
            size={36}
          />
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={[s.headerTitle, { color: t.colors.fg }]} numberOfLines={1}>{headerTitle}</Text>
            <Text style={[s.headerSubtitle, { color: typingUsers.size > 0 ? t.colors.primary : t.colors.muted }]} numberOfLines={1}>
              {typingUsers.size > 0 ? "typing…" : headerSubtitle}
            </Text>
          </View>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
        style={{ flex: 1 }}
      >
        {messagesQuery.isLoading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={t.colors.primary} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={view}
            keyExtractor={(m) => m.id}
            renderItem={renderItem}
            inverted
            onScroll={(e) => {
              // "Near bottom" = within 80px of the bottom (which is offset 0 in inverted list).
              nearBottomRef.current = e.nativeEvent.contentOffset.y < 80;
            }}
            scrollEventThrottle={16}
            contentContainerStyle={{ paddingTop: 8, paddingBottom: 4 }}
            ListHeaderComponent={typingUsers.size > 0 ? <TypingDots /> : null}
            onEndReached={() => {
              const cursor = messagesQuery.data?.nextCursor;
              if (!cursor || !messagesQuery.data?.hasMore) return;
              // Older messages — appended to the cache.
              ApiMessages.list(chatId, cursor).then((page) => {
                queryClient.setQueryData<typeof messagesQuery.data>(["messages", chatId], (prev) => prev && {
                  ...prev,
                  items: [...prev.items, ...page.items],
                  hasMore: page.hasMore,
                  nextCursor: page.nextCursor,
                });
              }).catch(() => undefined);
            }}
            onEndReachedThreshold={0.5}
          />
        )}

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
      </KeyboardAvoidingView>

      <ReactionsSheet
        visible={!!reactingId}
        canDelete={!!reactingId && view.find((m) => m.id === reactingId)?.senderId === me?.id}
        onClose={() => setReactingId(null)}
        onPick={(emoji) => {
          if (reactingId) handleReact(reactingId, emoji);
          setReactingId(null);
        }}
        onReply={() => {
          const target = view.find((m) => m.id === reactingId);
          if (target) setReplyTo(target);
          setReactingId(null);
        }}
        onDelete={() => {
          if (!reactingId) return;
          ApiMessages.remove(reactingId, "everyone").catch(() => undefined);
          setReactingId(null);
        }}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle:    { fontSize: 16, fontWeight: "600", letterSpacing: -0.1 },
  headerSubtitle: { fontSize: 12, marginTop: 1 },
});
