import { useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, Alert } from "react-native";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import {
  ChevronRight, Bell, ShieldCheck, Palette, MonitorSmartphone, Copy, Share2, LogOut,
} from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { useTheme } from "@/lib/ui/theme";
import { useAuthStore } from "@/lib/auth/store";
import { ApiAuth } from "@/lib/api/client";
import { disconnectSocket } from "@/lib/socket";
import { constants } from "@chatrix/shared";

/**
 * Settings hub. Section list of grouped rows — feels native (iOS/Android both
 * recognize this pattern). Each row routes to a sub-screen for the actual
 * editor when the action is non-trivial.
 *
 * The profile card at top is intentionally large + interactive — copying the
 * @username is the most common micro-interaction here ("share my handle").
 */
export default function SettingsScreen() {
  const t = useTheme();
  const router = useRouter();
  const me = useAuthStore((s) => s.user);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const clear = useAuthStore((s) => s.clear);
  const [signingOut, setSigningOut] = useState(false);

  if (!me) return <Screen />;

  async function copyHandle() {
    if (!me) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Clipboard.setStringAsync(constants.profileLink(me.username));
  }

  async function signOut() {
    Alert.alert("Sign out?", "You'll need your password to sign back in.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out", style: "destructive",
        onPress: async () => {
          setSigningOut(true);
          try {
            if (refreshToken) await ApiAuth.logout(refreshToken).catch(() => undefined);
          } finally {
            disconnectSocket();
            clear();
            router.replace("/(auth)/welcome");
          }
        },
      },
    ]);
  }

  return (
    <Screen edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>

        {/* ----- Profile card ----- */}
        <View style={s.headerWrap}>
          <View style={[s.profileCard, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
            <Avatar url={me.avatarUrl} name={me.displayName ?? me.username} size={72} />
            <View style={{ marginTop: 14 }}>
              <Text style={[s.name, { color: t.colors.fg }]}>{me.displayName ?? `@${me.username}`}</Text>
              <Pressable onPress={copyHandle} hitSlop={6} style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
                <Text style={[s.handle, { color: t.colors.muted }]}>@{me.username}</Text>
                <Copy size={13} color={t.colors.muted} style={{ marginLeft: 6 }} />
              </Pressable>
            </View>
            {me.bio && <Text style={[s.bio, { color: t.colors.muted }]}>{me.bio}</Text>}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16, alignSelf: "stretch" }}>
              <View style={{ flex: 1 }}>
                <Button label="Edit profile" variant="secondary" onPress={() => router.push("/profile/edit")} />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label="Share"
                  variant="secondary"
                  icon={<Share2 size={16} color={t.colors.fg} />}
                  onPress={copyHandle}
                />
              </View>
            </View>
          </View>
        </View>

        {/* ----- Account ----- */}
        <Section title="Account">
          <Row icon={<ShieldCheck size={20} color={t.colors.primary} />} label="Privacy & security" onPress={() => router.push("/settings/privacy")} />
          <Row icon={<MonitorSmartphone size={20} color={t.colors.primary} />} label="Active devices" onPress={() => router.push("/settings/devices")} />
          {!me.emailVerifiedAt && (
            <Row
              icon={<View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.colors.danger, marginLeft: 6, marginRight: 6 }} />}
              label="Verify your email"
              danger
              onPress={() => router.push("/settings/verify-email")}
            />
          )}
        </Section>

        {/* ----- Preferences ----- */}
        <Section title="Preferences">
          <Row icon={<Bell    size={20} color={t.colors.primary} />} label="Notifications" onPress={() => router.push("/settings/notifications")} />
          <Row icon={<Palette size={20} color={t.colors.primary} />} label="Appearance"    onPress={() => router.push("/settings/appearance")} />
        </Section>

        {/* ----- Sign out ----- */}
        <View style={{ paddingHorizontal: 20, marginTop: 28 }}>
          <Button
            label="Sign out"
            variant="secondary"
            loading={signingOut}
            icon={<LogOut size={16} color={t.colors.danger} />}
            onPress={signOut}
          />
        </View>

        <Text style={{ textAlign: "center", color: t.colors.muted, fontSize: 12, marginTop: 24 }}>
          Chatrix · v0.1.0
        </Text>
      </ScrollView>
    </Screen>
  );
}

// =====================================================
// Section primitives
// =====================================================

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ marginTop: 24 }}>
      <Text style={[s.sectionTitle, { color: t.colors.muted }]}>{title.toUpperCase()}</Text>
      <View style={[s.sectionBody, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
        {children}
      </View>
    </View>
  );
}

function Row({
  icon, label, onPress, danger,
}: { icon?: React.ReactNode; label: string; onPress: () => void; danger?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: t.colors.elevated }}
      style={({ pressed }) => [s.row, { backgroundColor: pressed ? t.colors.elevated : "transparent" }]}
    >
      {icon && <View style={{ width: 28, alignItems: "center" }}>{icon}</View>}
      <Text style={[s.rowLabel, { color: danger ? t.colors.danger : t.colors.fg }]}>{label}</Text>
      <ChevronRight size={18} color={t.colors.muted} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  headerWrap: { paddingHorizontal: 20, paddingTop: 14 },
  profileCard: {
    borderRadius: 22, borderWidth: 1, padding: 20, alignItems: "center",
    shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1,
  },
  name:   { fontSize: 22, fontWeight: "700", letterSpacing: -0.4, textAlign: "center" },
  handle: { fontSize: 14, fontWeight: "500" },
  bio:    { fontSize: 14, marginTop: 10, textAlign: "center", lineHeight: 20 },

  sectionTitle: { paddingHorizontal: 32, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, marginBottom: 8 },
  sectionBody:  { marginHorizontal: 20, borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  row:          { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 14 },
  rowLabel:     { flex: 1, fontSize: 15, fontWeight: "500" },
});
