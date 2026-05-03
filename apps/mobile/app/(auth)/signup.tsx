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
import { signupSchema } from "@chatrix/shared/schemas";
import { ChatrixError } from "@chatrix/shared/errors";

/**
 * Signup. Three fields (username, email, password). Username availability
 * isn't pre-checked — we rely on the conflict response from the API and surface
 * it inline. Same shape as web signup.
 */
export default function Signup() {
  const t = useTheme();
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);

  const [username, setUsername] = useState("");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [show,     setShow]     = useState(false);
  const [busy,     setBusy]     = useState(false);
  const [errors,   setErrors]   = useState<{ field?: string; message: string } | null>(null);

  async function submit() {
    setErrors(null);
    const parsed = signupSchema.safeParse({ username, email, password });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      const first = Object.entries(flat)[0];
      setErrors({ field: first?.[0], message: first?.[1]?.[0] ?? "Please check your details." });
      return;
    }
    setBusy(true);
    try {
      const session = await ApiAuth.signup({ username, email, password });
      setSession(session);
      router.replace("/(tabs)/chats");
    } catch (err) {
      if (err instanceof ChatrixError) {
        const field = err.code.includes("USERNAME") ? "username"
                    : err.code.includes("EMAIL")    ? "email"
                    : undefined;
        setErrors({ field, message: err.message });
      } else {
        setErrors({ message: "Something went wrong. Please try again." });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen padded>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}>
          <View style={{ paddingTop: 12 }}>
            <BrandLogo size={36} />
          </View>

          <View style={{ marginTop: 32, marginBottom: 24 }}>
            <Text style={{ fontSize: 30, fontWeight: "700", color: t.colors.fg, letterSpacing: -0.5 }}>
              Create your @username
            </Text>
            <Text style={{ fontSize: 15, color: t.colors.muted, marginTop: 6, lineHeight: 22 }}>
              Pick something you'll be happy with. You can change your display name later, but your @ stays.
            </Text>
          </View>

          <Input
            label="Username"
            value={username}
            onChangeText={(v) => setUsername(v.replace(/^@/, ""))}
            placeholder="kamsy"
            autoCapitalize="none"
            autoComplete="username-new"
            leading={<Text style={{ color: t.colors.muted, fontSize: 16 }}>@</Text>}
            error={errors?.field === "username" ? errors.message : null}
          />
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoComplete="email"
            error={errors?.field === "email" ? errors.message : null}
          />
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters with letters and numbers"
            secureTextEntry={!show}
            autoComplete="password-new"
            error={errors?.field === "password" ? errors.message : null}
            trailing={
              <Pressable onPress={() => setShow((v) => !v)} hitSlop={10}>
                <Text style={{ color: t.colors.muted, fontSize: 13, fontWeight: "600" }}>
                  {show ? "Hide" : "Show"}
                </Text>
              </Pressable>
            }
          />

          {errors && !errors.field && (
            <Text style={{ color: t.colors.danger, marginTop: 4, marginBottom: 8 }}>{errors.message}</Text>
          )}

          <View style={{ marginTop: 12 }}>
            <Button label="Create account" onPress={submit} loading={busy} />
            <Text style={{ marginTop: 14, fontSize: 12, color: t.colors.muted, textAlign: "center", lineHeight: 18 }}>
              By continuing you agree to the Terms and Privacy Policy.
            </Text>
          </View>

          <Pressable onPress={() => router.replace("/(auth)/login")} style={{ marginTop: 28, alignSelf: "center" }} hitSlop={10}>
            <Text style={{ color: t.colors.muted }}>
              Already have an account?{" "}
              <Text style={{ color: t.colors.primary, fontWeight: "600" }}>Sign in</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
