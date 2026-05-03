import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "../lib/ui/gradient";
import { useTheme } from "../lib/ui/theme";

interface Props {
  size?: number;
  showWordmark?: boolean;
}

/**
 * Brand mark — a rounded gradient square. The wordmark variant adds the
 * "Chatrix" name in display weight next to it. Used in the welcome hero,
 * empty-states, and the auth navbar.
 *
 * Real logo asset will replace this in Phase 7 alongside icon/splash export.
 */
export function BrandLogo({ size = 44, showWordmark = false }: Props) {
  const t = useTheme();
  return (
    <View style={s.row}>
      <LinearGradient
        colors={t.gradient as unknown as [string, string]}
        start={[0, 0]} end={[1, 1]}
        style={[s.mark, { width: size, height: size, borderRadius: size * 0.32 }]}
      />
      {showWordmark && (
        <Text style={[s.word, { color: t.colors.fg, fontSize: size * 0.45 }]}>Chatrix</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  mark: { backgroundColor: "#8B79FF" },
  word: { fontWeight: "700", letterSpacing: -0.4 },
});
