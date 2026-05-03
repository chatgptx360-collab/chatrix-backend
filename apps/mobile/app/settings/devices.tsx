import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Smartphone, Monitor } from "lucide-react-native";
import { SettingsSubScreen } from "@/components/SettingsSubScreen";
import { useTheme } from "@/lib/ui/theme";
import { api } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/store";

interface SessionView {
  id: string;
  platform: "ios" | "android" | "web" | "desktop" | null;
  deviceName: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  lastUsedAt: string;
  createdAt: string;
  isCurrent: boolean;
}

/**
 * Active devices screen. Lists active sessions with platform + last-used,
 * highlights the current one, lets the user revoke any other.
 */
export default function DevicesScreen() {
  const t = useTheme();
  const queryClient = useQueryClient();
  const refreshToken = useAuthStore((s) => s.refreshToken);

  const { data, isLoading } = useQuery({
    queryKey: ["sessions"],
    queryFn: () => api<SessionView[]>("/sessions/with-current", { method: "POST", body: { refreshToken } }),
  });

  async function revoke(id: string) {
    await api(`/sessions/${id}`, { method: "DELETE" });
    queryClient.invalidateQueries({ queryKey: ["sessions"] });
  }

  return (
    <SettingsSubScreen title="Active devices">
      {isLoading ? (
        <ActivityIndicator color={t.colors.primary} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(s) => s.id}
          renderItem={({ item }) => (
            <View style={[s.row, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
              {(item.platform === "web" || item.platform === "desktop")
                ? <Monitor    size={22} color={t.colors.primary} />
                : <Smartphone size={22} color={t.colors.primary} />}
              <View style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
                <Text style={[s.devName, { color: t.colors.fg }]} numberOfLines={1}>
                  {item.deviceName ?? item.platform ?? "Unknown device"}
                </Text>
                <Text style={[s.devMeta, { color: t.colors.muted }]} numberOfLines={1}>
                  {item.isCurrent ? "This device" : `Last used ${new Date(item.lastUsedAt).toLocaleString()}`}
                </Text>
              </View>
              {!item.isCurrent && (
                <Pressable onPress={() => revoke(item.id)} hitSlop={8} style={{ padding: 6 }}>
                  <Trash2 size={18} color={t.colors.danger} />
                </Pressable>
              )}
            </View>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        />
      )}
    </SettingsSubScreen>
  );
}

const s = StyleSheet.create({
  row:     { flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: 1, padding: 14 },
  devName: { fontSize: 15, fontWeight: "600", letterSpacing: -0.1 },
  devMeta: { fontSize: 12, marginTop: 2 },
});
