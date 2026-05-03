import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { Image } from "expo-image";
import { useTheme } from "../lib/ui/theme";
import { LinearGradient } from "../lib/ui/gradient";

interface Props {
  url?: string | null;
  /** Used to derive initials AND a stable per-user accent color. */
  name?: string | null;
  size?: number;
  presence?: "online" | "away" | "offline";
  style?: ViewStyle;
}

/**
 * Avatar with three states:
 *   - Image when `url` is provided
 *   - Gradient + initials fallback otherwise
 *   - Optional presence dot (Discord/iMessage style)
 *
 * The fallback gradient is deterministic from `name`, so the same user always
 * has the same color — feels less like a placeholder, more like an identity.
 */
export function Avatar({ url, name, size = 44, presence, style }: Props) {
  const t = useTheme();
  const initials = (name ?? "?")
    .split(/[\s_@]+/).filter(Boolean).slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("") || (name?.[0]?.toUpperCase() ?? "?");

  const grad = pickGradient(name ?? "");
  const dot = size >= 32 ? Math.max(10, size * 0.26) : 0;

  return (
    <View style={[{ width: size, height: size }, style]}>
      {url ? (
        <Image
          source={{ uri: url }}
          style={[styles.img, { width: size, height: size, borderRadius: size / 2 }]}
          contentFit="cover"
          transition={120}
        />
      ) : (
        <LinearGradient
          colors={grad}
          start={[0, 0]} end={[1, 1]}
          style={[styles.img, { width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center" }]}
        >
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: size * 0.42 }}>{initials}</Text>
        </LinearGradient>
      )}
      {presence && presence !== "offline" && dot > 0 && (
        <View
          style={{
            position: "absolute", right: 0, bottom: 0,
            width: dot, height: dot, borderRadius: dot / 2,
            backgroundColor: presence === "online" ? t.colors.success : "#FFB020",
            borderWidth: 2, borderColor: t.colors.bg,
          }}
        />
      )}
    </View>
  );
}

/** Deterministic-by-name gradient picker — no randomness, looks intentional. */
function pickGradient(seed: string): [string, string] {
  const palette: Array<[string, string]> = [
    ["#8B79FF", "#48E0FF"], // brand
    ["#FF7AB6", "#FF6B6B"], // pink → coral
    ["#6BFFC1", "#3CC8FF"], // mint → sky
    ["#FFB86B", "#FF6B6B"], // amber → coral
    ["#A78BFA", "#F472B6"], // violet → pink
    ["#22D3EE", "#3B82F6"], // cyan → blue
    ["#34D399", "#22D3EE"], // emerald → cyan
    ["#F59E0B", "#EF4444"], // amber → red
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length]!;
}

const styles = StyleSheet.create({
  img: { backgroundColor: "#222" },
});
