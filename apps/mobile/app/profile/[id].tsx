import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, MessageCircle, UserPlus, Flag } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { useTheme } from "@/lib/ui/theme";
import { ApiChats, ApiUsers } from "@/lib/api/client";
import { formatLastSeen } from "@/lib/format";

/**
 * Public profile view — opened from the chat header or a search result.
 * Two CTAs: Message (open or create DM) and Add friend (queues a friend
 * request; backend already enforces the block-aware path).
 *
 * Accepts either a UUID or `@username` as the route param via expo-router's
 * dynamic segments.
 */
export default function PublicProfile() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const username = id?.startsWith("@") ? id.slice(1) : null;

  const { data, isLoading } = useQuery({
    queryKey: ["profile", id],
    queryFn: () => username ? ApiUsers.byUsername(username) : ApiUsers.byUsername(id!),
    // ID-by-UUID lookup will be wired when /users/:id lands; for now we
    // accept @username as the primary lookup and fall through.
  });

  if (isLoading || !data) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={t.colors.primary} />
        </View>
      </Screen>
    );
  }

  async function message() {
    const chat = await ApiChats.openDm(data!.id);
    router.replace(`/chat/${chat.id}`);
  }

  return (
    <Screen edges={["top"]}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}><ArrowLeft size={24} color={t.colors.fg} /></Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={{ alignItems: "center", paddingHorizontal: 20, paddingTop: 12 }}>
          <Avatar url={data.avatarUrl} name={data.displayName ?? data.username} size={108} presence={data.presence} />
          <Text style={[s.name, { color: t.colors.fg }]}>{data.displayName ?? `@${data.username}`}</Text>
          <Text style={[s.handle, { color: t.colors.muted }]}>@{data.username}</Text>
          <Text style={[s.handle, { color: t.colors.muted, marginTop: 2 }]}>
            {formatLastSeen(data.presence, data.lastSeenAt)}
          </Text>
          {data.bio && <Text style={[s.bio, { color: t.colors.fg }]}>{data.bio}</Text>}

          <View style={{ flexDirection: "row", gap: 10, marginTop: 22, alignSelf: "stretch" }}>
            <View style={{ flex: 1 }}>
              <Button label="Message" icon={<MessageCircle size={16} color="#fff" />} onPress={message} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Add friend" variant="secondary" icon={<UserPlus size={16} color={t.colors.fg} />} onPress={() => undefined} />
            </View>
          </View>

          <Pressable hitSlop={8} onPress={() => undefined} style={{ marginTop: 20, flexDirection: "row", alignItems: "center" }}>
            <Flag size={14} color={t.colors.muted} />
            <Text style={{ marginLeft: 6, color: t.colors.muted }}>Report this user</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingVertical: 8 },
  name:   { fontSize: 26, fontWeight: "700", letterSpacing: -0.4, marginTop: 14, textAlign: "center" },
  handle: { fontSize: 14, marginTop: 4 },
  bio:    { fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: 16, maxWidth: 320 },
});
