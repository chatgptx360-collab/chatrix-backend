import { useState } from "react";
import { View, Text } from "react-native";
import { SettingsSubScreen } from "@/components/SettingsSubScreen";
import { Button } from "@/components/Button";
import { useTheme } from "@/lib/ui/theme";
import { useAuthStore } from "@/lib/auth/store";
import { api } from "@/lib/api/client";

/**
 * Resend verification email. The actual verification consumes a token from
 * the email link via /v1/auth/verify-email — that route is hit by the web
 * app (deep link via universal links). Here we only offer the resend.
 */
export default function VerifyEmailScreen() {
  const t = useTheme();
  const me = useAuthStore((s) => s.user);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function resend() {
    setBusy(true);
    try {
      await api("/auth/verify-email/resend", { method: "POST" });
      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsSubScreen title="Verify your email">
      <View style={{ gap: 14 }}>
        <Text style={{ color: t.colors.fg, fontSize: 16, lineHeight: 22 }}>
          Your email <Text style={{ fontWeight: "700" }}>{me?.email}</Text> isn't verified yet.
        </Text>
        <Text style={{ color: t.colors.muted, lineHeight: 22 }}>
          We'll send a fresh link. Tap it from the same device to confirm. The link expires in 24 hours.
        </Text>
        {sent ? (
          <Text style={{ color: t.colors.success, fontWeight: "600" }}>✓ Sent. Check your inbox.</Text>
        ) : (
          <Button label="Send verification link" loading={busy} onPress={resend} />
        )}
      </View>
    </SettingsSubScreen>
  );
}
