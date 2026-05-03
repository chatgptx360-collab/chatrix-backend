import { useState } from "react";
import { Text, View, KeyboardAvoidingView, Platform, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { useTheme } from "@/lib/ui/theme";
import { ApiAuth } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/store";
import { ChatrixError } from "@chatrix/shared/errors";

export default function Login() {
  const t = useTheme();
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);

  const [identifier, setIdentifier] = useState("");
  const [password,   setPassword]   = useState("");
  const [show,       setShow]       = useState(false);
  const [busy,       setBusy]       = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (identifier.length < 3 || password.length < 1) {
      setError("Please fill in both fields.");
      return;
    }
    setBusy(true);
    try {
      const session = await ApiAuth.login({ identifier: identifier.trim().replace(/^@/, ""), password });
      setSession(session);
      router.replace("/(tabs)/chats");
    } catch (err) {
      setError(err instanceof ChatrixError ? err.message : "Login failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen padded>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}>
          <View style={{ paddingTop: 12 }}>
            <BrandLogo size={36} />
          </View>

          <View style={{ marginTop: 32, marginBottom: 24 }}>
            <Text style={{ fontSize: 30, fontWeight: "700", color: t.colors.fg, letterSpacing: -0.5 }}>
              Welcome back
            </Text>
            <Text style={{ fontSize: 15, color: t.colors.muted, marginTop: 6 }}>
              Sign in with your username or email.
            </Text>
          </View>

          <Input
            label="Username or email"
            value={identifier}
            onChangeText={setIdentifier}
            placeholder="@kamsy or you@example.com"
            autoCapitalize="none"
            autoComplete="username"
          />
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            secureTextEntry={!show}
            autoComplete="current-password"
            trailing={
              <Pressable onPress={() => setShow((v) => !v)} hitSlop={10}>
                <Text style={{ color: t.colors.muted, fontSize: 13, fontWeight: "600" }}>
                  {show ? "Hide" : "Show"}
                </Text>
              </Pressable>
            }
          />

          {error && (
            <Text style={{ color: t.colors.danger, marginTop: 4, marginBottom: 8 }}>{error}</Text>
          )}

          <View style={{ marginTop: 12 }}>
            <Button label="Sign in" onPress={submit} loading={busy} />
          </View>

          <Pressable onPress={() => router.push("/(auth)/forgot")} style={{ marginTop: 18, alignSelf: "center" }} hitSlop={10}>
            <Text style={{ color: t.colors.primary, fontWeight: "600" }}>Forgot password?</Text>
          </Pressable>

          <Pressable onPress={() => router.replace("/(auth)/signup")} style={{ marginTop: 24, alignSelf: "center" }} hitSlop={10}>
            <Text style={{ color: t.colors.muted }}>
              New here?{" "}
              <Text style={{ color: t.colors.primary, fontWeight: "600" }}>Create an account</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
