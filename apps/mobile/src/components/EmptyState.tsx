import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../lib/ui/theme";
import { Button } from "./Button";

interface Props {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  ctaLabel?: string;
  onPressCta?: () => void;
}

/**
 * Used by every list-style screen (chats, friends, search) when there's
 * nothing to render. Quiet by default — the optional CTA makes it actionable.
 */
export function EmptyState({ icon, title, description, ctaLabel, onPressCta }: Props) {
  const t = useTheme();
  return (
    <View style={s.wrap}>
      {icon && <View style={s.icon}>{icon}</View>}
      <Text style={[s.title, { color: t.colors.fg }]}>{title}</Text>
      {description && (
        <Text style={[s.desc, { color: t.colors.muted }]}>{description}</Text>
      )}
      {ctaLabel && (
        <View style={{ marginTop: 22, alignSelf: "stretch" }}>
          <Button label={ctaLabel} onPress={onPressCta} />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  icon: { marginBottom: 16, opacity: 0.7 },
  title: { fontSize: 20, fontWeight: "600", letterSpacing: -0.2, marginBottom: 6, textAlign: "center" },
  desc: { fontSize: 15, lineHeight: 22, textAlign: "center", maxWidth: 320 },
});
