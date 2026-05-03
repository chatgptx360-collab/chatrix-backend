import { useState, useEffect } from "react";
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, TextInput, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, X, Sparkles, Check, Clock } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { useTheme } from "@/lib/ui/theme";
import { ApiUsers, ApiChats, ApiFriends } from "@/lib/api/client";
import { ChatrixError } from "@chatrix/shared/errors";
import type { PublicUser, Friendship } from "@chatrix/shared/types";

/**
 * Friends + discover (mobile).
 *   - Pending requests inbox at top (incoming = actionable, outgoing = informational)
 *   - Search bar with debounced trigram lookup
 *   - Friends list at the bottom
 *
 * Tap a result → open (or get-or-create) DM and route to chat.
 */
export default function FriendsScreen() {
  const t = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [query, setQuery]       = useState("");
  const [results, setResults]   = useState<PublicUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [opening, setOpening]   = useState<string | null>(null);

  const friendsQuery = useQuery({ queryKey: ["friends"],         queryFn: () => ApiFriends.list() });
  const pendingQuery = useQuery({ queryKey: ["friends-pending"], queryFn: () => ApiFriends.pending() });

  // Debounced search
  useEffect(() => {
    const trimmed = query.trim().replace(/^@/, "");
    if (trimmed.length < 2) { setResults([]); return; }
    setSearching(true);
    const timer = setTimeout(() => {
      ApiUsers.search(trimmed)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  async function openDm(peer: PublicUser) {
    setOpening(peer.id);
    try {
      const chat = await ApiChats.openDm(peer.id);
      router.push(`/chat/${chat.id}`);
    } catch (err) {
      // Block-aware path; surfaces in Phase 8 toast.
      if (!(err instanceof ChatrixError)) throw err;
    } finally {
      setOpening(null);
    }
  }

  async function accept(userId: string)  {
    await ApiFriends.accept(userId).catch(() => undefined);
    queryClient.invalidateQueries({ queryKey: ["friends-pending"] });
    queryClient.invalidateQueries({ queryKey: ["friends"] });
  }
  async function decline(userId: string) {
    await ApiFriends.decline(userId).catch(() => undefined);
    queryClient.invalidateQueries({ queryKey: ["friends-pending"] });
  }

  const incoming = pendingQuery.data?.incoming ?? [];
  const outgoing = pendingQuery.data?.outgoing ?? [];
  const friends  = friendsQuery.data ?? [];
  const isSearching = query.trim().length >= 2;

  return (
    <Screen edges={["top"]}>
      <View style={[s.header, { borderBottomColor: t.colors.border }]}>
        <Text style={[s.title, { color: t.colors.fg }]}>Friends</Text>
      </View>

      <View style={s.searchWrap}>
        <View style={[s.search, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
          <Search size={18} color={t.colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Find by @username or name"
            placeholderTextColor={t.colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            style={[s.searchInput, { color: t.colors.fg }]}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")} hitSlop={8}>
              <X size={18} color={t.colors.muted} />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Search results take precedence when typing */}
        {isSearching && (
          <Section title="Results" theme={t}>
            {searching && results.length === 0 ? (
              <ActivityIndicator color={t.colors.primary} style={{ marginVertical: 18 }} />
            ) : results.length === 0 ? (
              <Text style={{ color: t.colors.muted, paddingHorizontal: 8, paddingVertical: 12 }}>
                No matches for &ldquo;{query}&rdquo;.
              </Text>
            ) : (
              results.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  theme={t}
                  loading={opening === u.id}
                  actionLabel="Message"
                  onAction={() => openDm(u)}
                />
              ))
            )}
          </Section>
        )}

        {!isSearching && (incoming.length > 0 || outgoing.length > 0) && (
          <Section
            title="Pending requests"
            badge={incoming.length || undefined}
            theme={t}
          >
            {incoming.map((f) => f.user && (
              <FriendRow
                key={f.id} friendship={f} theme={t}
                right={
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Pressable
                      onPress={() => accept(f.requesterId)}
                      style={[s.smallBtnPrimary, { backgroundColor: t.colors.primary }]}
                    >
                      <Check size={14} color="#fff" />
                      <Text style={{ color: "#fff", fontWeight: "600", fontSize: 12, marginLeft: 4 }}>Accept</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => decline(f.requesterId)}
                      hitSlop={6}
                      style={[s.smallBtnGhost, { borderColor: t.colors.border }]}
                    >
                      <Text style={{ color: t.colors.muted, fontWeight: "600", fontSize: 12 }}>Decline</Text>
                    </Pressable>
                  </View>
                }
              />
            ))}
            {outgoing.length > 0 && (
              <>
                <Text style={[s.subhead, { color: t.colors.muted }]}>Sent</Text>
                {outgoing.map((f) => f.user && (
                  <FriendRow
                    key={f.id} friendship={f} theme={t} muted
                    right={
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Clock size={11} color={t.colors.muted} />
                        <Text style={{ color: t.colors.muted, fontSize: 12 }}>Awaiting reply</Text>
                      </View>
                    }
                  />
                ))}
              </>
            )}
          </Section>
        )}

        {!isSearching && (
          <Section title="Friends" badge={friends.length || undefined} theme={t}>
            {friendsQuery.isLoading ? (
              <ActivityIndicator color={t.colors.primary} style={{ marginVertical: 18 }} />
            ) : friends.length === 0 ? (
              <EmptyState
                icon={<Sparkles size={28} color={t.colors.primary} />}
                title="Find people on Chatrix"
                description="Search by their @username and start a conversation. No phone numbers required."
              />
            ) : (
              friends.map((f) => f.user && (
                <UserRow
                  key={f.id} user={f.user} theme={t}
                  loading={opening === f.user.id}
                  actionLabel="Message"
                  onAction={() => openDm(f.user!)}
                />
              ))
            )}
          </Section>
        )}
      </ScrollView>
    </Screen>
  );
}

// ---------- Sub-components ----------

function Section({
  title, badge, theme, children,
}: { title: string; badge?: number; theme: ReturnType<typeof useTheme>; children: React.ReactNode }) {
  return (
    <View style={{ paddingHorizontal: 16, marginTop: 18 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4, marginBottom: 8 }}>
        <Text style={{ color: theme.colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" }}>
          {title}
        </Text>
        {badge !== undefined && (
          <View style={{ minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: theme.colors.primary + "25", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: theme.colors.primary, fontSize: 11, fontWeight: "700" }}>{badge}</Text>
          </View>
        )}
      </View>
      <View style={{ borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, padding: 6 }}>
        {children}
      </View>
    </View>
  );
}

function UserRow({
  user, theme, actionLabel, loading, onAction,
}: { user: PublicUser; theme: ReturnType<typeof useTheme>; actionLabel: string; loading?: boolean; onAction: () => void }) {
  const display = user.displayName || `@${user.username}`;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 6, gap: 12 }}>
      <Avatar url={user.avatarUrl} name={display} presence={user.presence} size={40} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: theme.colors.fg, fontSize: 14, fontWeight: "600" }}>{display}</Text>
        <Text numberOfLines={1} style={{ color: theme.colors.muted, fontSize: 12 }}>@{user.username}</Text>
      </View>
      <View style={{ width: 100 }}>
        <Button label={actionLabel} variant="secondary" loading={loading} onPress={onAction} />
      </View>
    </View>
  );
}

function FriendRow({
  friendship, theme, right, muted,
}: { friendship: Friendship; theme: ReturnType<typeof useTheme>; right?: React.ReactNode; muted?: boolean }) {
  const u = friendship.user!;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 6, gap: 12, opacity: muted ? 0.7 : 1 }}>
      <Avatar url={u.avatarUrl} name={u.displayName ?? u.username} presence={u.presence} size={40} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: theme.colors.fg, fontSize: 14, fontWeight: "600" }}>
          {u.displayName ?? `@${u.username}`}
        </Text>
        <Text numberOfLines={1} style={{ color: theme.colors.muted, fontSize: 12 }}>@{u.username}</Text>
      </View>
      {right}
    </View>
  );
}

const s = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  title:  { fontSize: 28, fontWeight: "700", letterSpacing: -0.5 },

  searchWrap: { paddingHorizontal: 20, paddingVertical: 12 },
  search: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, height: 46, borderRadius: 14, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 15 },

  subhead: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", marginTop: 8, marginBottom: 4, paddingHorizontal: 6 },

  smallBtnPrimary: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  smallBtnGhost:   { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
