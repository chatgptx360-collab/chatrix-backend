import { useCallback, useMemo } from "react";
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pin, BellOff } from "lucide-react-native";
import { ApiChats } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/store";
import { useTheme } from "@/lib/ui/theme";
import { Screen } from "@/components/Screen";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { formatRelativeTime, kindLabel, previewBody } from "@/lib/format";
import { useSocketEvent, useSocketStatus } from "@/lib/socket";
import type { Chat, Message } from "@chatrix/shared/types";

/**
 * Chat list — the home screen.
 *
 * Data flow:
 *   - React Query owns the list (15s stale, refetch on mount).
 *   - Socket events (`message:created`, `chat:updated`) invalidate the list so
 *     the unread count + last-message preview stay live.
 *   - Pinned rows float to the top (server returns them ordered).
 */
export default function ChatsScreen() {
  const t = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const connected = useSocketStatus();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["chats", "list"],
    queryFn: () => ApiChats.list(),
  });

  // Live updates — any incoming message bumps the chat list cache.
  useSocketEvent("message:created", () => {
    queryClient.invalidateQueries({ queryKey: ["chats", "list"] });
  });
  useSocketEvent("chat:updated", () => {
    queryClient.invalidateQueries({ queryKey: ["chats", "list"] });
  });

  const renderRow = useCallback(({ item }: { item: Chat }) => (
    <ChatRow chat={item} viewerId={me?.id} onPress={() => router.push(`/chat/${item.id}`)} />
  ), [me?.id, router]);

  const keyExtractor = useCallback((c: Chat) => c.id, []);

  const headerSubtitle = useMemo(() => {
    if (!connected) return "Reconnecting…";
    return data ? `${data.length} ${data.length === 1 ? "conversation" : "conversations"}` : "";
  }, [connected, data]);

  return (
    <Screen edges={["top"]}>
      <View style={[s.header, { borderBottomColor: t.colors.border }]}>
        <View>
          <Text style={[s.title, { color: t.colors.fg }]}>Chats</Text>
          <Text style={[s.subtitle, { color: connected ? t.colors.muted : t.colors.danger }]}>
            {headerSubtitle}
          </Text>
        </View>
        <Pressable
          onPress={() => router.push("/(tabs)/friends")}
          style={[s.newBtn, { backgroundColor: t.colors.primary }]}
          hitSlop={10}
        >
          <Plus color="#fff" size={20} strokeWidth={2.5} />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={t.colors.primary} />
        </View>
      ) : data?.length ? (
        <FlatList
          data={data}
          keyExtractor={keyExtractor}
          renderItem={renderRow}
          ItemSeparatorComponent={() => <View style={{ height: 1, marginLeft: 78, backgroundColor: t.colors.border }} />}
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={t.colors.primary}
            />
          }
        />
      ) : (
        <EmptyState
          title="No conversations yet"
          description="Find friends by their @username and say hello."
          ctaLabel="Find friends"
          onPressCta={() => router.push("/(tabs)/friends")}
        />
      )}
    </Screen>
  );
}

// =====================================================
// Row
// =====================================================

function ChatRow({
  chat, viewerId, onPress,
}: { chat: Chat; viewerId?: string; onPress: () => void }) {
  const t = useTheme();
  const peer = chat.members?.[0]?.user;
  const title  = chat.type === "dm" ? (peer?.displayName ?? `@${peer?.username ?? "unknown"}`) : (chat.title ?? "Group");
  const avatar = chat.type === "dm" ? peer?.avatarUrl : chat.avatarUrl;
  const presence = chat.type === "dm" ? peer?.presence : undefined;

  const last = chat.lastMessage;
  const isYou = last?.senderId === viewerId;
  const previewText = previewMessage(last, isYou);

  const unread = chat.unreadCount ?? 0;
  const muted = chat.members?.[0]?.mutedUntil ? new Date(chat.members[0]!.mutedUntil!) > new Date() : false;
  const pinned = chat.members?.[0]?.pinned;

  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: t.colors.elevated }}
      style={({ pressed }) => [
        s.row,
        { backgroundColor: pressed ? t.colors.elevated : "transparent" },
      ]}
    >
      <Avatar url={avatar} name={title} presence={presence} size={52} />

      <View style={{ flex: 1, marginLeft: 14, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", flex: 1, minWidth: 0 }}>
            <Text
              style={[s.name, { color: t.colors.fg }]}
              numberOfLines={1}
            >{title}</Text>
            {muted  && <BellOff size={13} color={t.colors.muted} style={{ marginLeft: 6 }} />}
            {pinned && <Pin     size={13} color={t.colors.muted} style={{ marginLeft: 4 }} />}
          </View>
          {last && (
            <Text style={[s.time, { color: unread > 0 ? t.colors.primary : t.colors.muted }]}>
              {formatRelativeTime(last.createdAt)}
            </Text>
          )}
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
          <Text
            style={[
              s.preview,
              {
                color: unread > 0 && !muted ? t.colors.fg : t.colors.muted,
                fontWeight: unread > 0 && !muted ? "500" : "400",
              },
            ]}
            numberOfLines={1}
          >{previewText}</Text>
          {unread > 0 && (
            <View style={[s.badge, { backgroundColor: muted ? t.colors.muted : t.colors.primary }]}>
              <Text style={s.badgeText}>{unread > 99 ? "99+" : unread}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function previewMessage(m: Message | null | undefined, isYou: boolean): string {
  if (!m) return "Tap to start chatting";
  if (m.deletedAt) return isYou ? "You deleted a message" : "This message was deleted";
  const prefix = isYou ? "You: " : "";
  if (m.kind === "text") return prefix + (previewBody(m.body) || "(empty)");
  return prefix + kindLabel(m.kind);
}

// =====================================================
// Styles
// =====================================================

const s = StyleSheet.create({
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title:    { fontSize: 28, fontWeight: "700", letterSpacing: -0.5 },
  subtitle: { fontSize: 13, marginTop: 2 },
  newBtn:   {
    width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  row:     { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 12 },
  name:    { fontSize: 16, fontWeight: "600", letterSpacing: -0.1 },
  time:    { fontSize: 12, marginLeft: 8 },
  preview: { flex: 1, fontSize: 14, lineHeight: 18 },
  badge:   { marginLeft: 10, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, minWidth: 24, alignItems: "center" },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
});
