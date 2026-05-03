import { useState } from "react";
import { Text, View, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { useTheme } from "@/lib/ui/theme";
import { api } from "@/lib/api/client";

/**
 * Password reset request. The server always returns ok (enumeration-safe), so
 * we always show the same confirmation regardless of whether the email exists.
 */
export default function Forgot() {
  const t = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy,  setBusy]  = useState(false);
  const [done,  setDone]  = useState(false);

  async function submit() {
    if (!email.includes("@")) return;
    setBusy(true);
    try {
      await api("/auth/password/forgot", { method: "POST", body: { email } });
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen padded>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, paddingTop: 12 }}>
        {done ? (
          <View style={{ flex: 1, justifyContent: "center" }}>
            <Text style={{ fontSize: 28, fontWeight: "700", color: t.colors.fg, letterSpacing: -0.4 }}>
              Check your inbox
            </Text>
            <Text style={{ marginTop: 8, color: t.colors.muted, fontSize: 15, lineHeight: 22 }}>
              If an account exists for <Text style={{ color: t.colors.fg, fontWeight: "600" }}>{email}</Text>,
              we've sent a link to reset your password. The link expires in 1 hour.
            </Text>
            <View style={{ marginTop: 28 }}>
              <Button label="Back to sign in" onPress={() => router.replace("/(auth)/login")} />
            </View>
          </View>
        ) : (
          <View>
            <Text style={{ fontSize: 28, fontWeight: "700", color: t.colors.fg, letterSpacing: -0.4 }}>
              Reset your password
            </Text>
            <Text style={{ marginTop: 8, color: t.colors.muted, fontSize: 15, lineHeight: 22, marginBottom: 24 }}>
              Enter your email and we'll send a reset link.
            </Text>
            <Input
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoComplete="email"
            />
            <Button label="Send reset link" onPress={submit} loading={busy} />
            <Pressable onPress={() => router.back()} style={{ marginTop: 18, alignSelf: "center" }} hitSlop={10}>
              <Text style={{ color: t.colors.muted }}>Back</Text>
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}
