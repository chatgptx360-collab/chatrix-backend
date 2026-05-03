import { Link } from "expo-router";
import { View, Text, StyleSheet } from "react-native";
import { Screen } from "@/components/Screen";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/Button";
import { useTheme } from "@/lib/ui/theme";
import { LinearGradient } from "@/lib/ui/gradient";

/**
 * Onboarding hero. Layered radial gradient backdrop, brand mark, headline
 * with gradient-clipped emphasis word, two CTAs (signup + login).
 *
 * Mirrors the web landing page so the brand feels consistent across surfaces.
 */
export default function Welcome() {
  const t = useTheme();

  return (
    <Screen padded>
      {/* Soft brand glow behind the headline */}
      <LinearGradient
        pointerEvents="none"
        colors={[
          t.dark ? "#3a2dff33" : "#634af622",
          "transparent",
        ]}
        style={s.glow}
      />

      <View style={{ flex: 1, justifyContent: "space-between", paddingTop: 36 }}>
        <View>
          <BrandLogo size={48} />
          <View style={s.pill}>
            <View style={[s.dot, { backgroundColor: t.colors.accent }]} />
            <Text style={[s.pillText, { color: t.colors.muted }]}>Now in private beta</Text>
          </View>

          <Text style={[s.headline, { color: t.colors.fg }]}>
            Messaging without{"\n"}the{" "}
            <Text style={s.gradientWord}>phone number</Text>.
          </Text>

          <Text style={[s.sub, { color: t.colors.muted }]}>
            Add anyone with their <Text style={{ color: t.colors.fg, fontWeight: "600" }}>@username</Text>.
            Real-time, private, and beautifully fast.
          </Text>
        </View>

        <View style={{ gap: 12, paddingBottom: 18 }}>
          <Link href="/(auth)/signup" asChild>
            <Button label="Create your @username" />
          </Link>
          <Link href="/(auth)/login" asChild>
            <Button label="I have an account" variant="secondary" />
          </Link>
        </View>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  glow: { position: "absolute", top: -180, left: -200, right: -200, height: 480 },

  pill: {
    flexDirection: "row", alignItems: "center", gap: 8,
    alignSelf: "flex-start",
    marginTop: 36, marginBottom: 16,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(127,127,127,0.25)",
  },
  dot:     { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 12, fontWeight: "500" },

  headline: { fontSize: 44, fontWeight: "700", letterSpacing: -1, lineHeight: 50, marginBottom: 14 },
  // The gradient-text trick: a transparent text with a gradient mask via tintColor.
  // RN doesn't support background-clip; we approximate with a brand-colored span.
  gradientWord: { color: "#8B79FF" },

  sub: { fontSize: 17, lineHeight: 25, maxWidth: 360 },
});
