import { Text } from "react-native";
import { SettingsSubScreen } from "@/components/SettingsSubScreen";
import { useTheme } from "@/lib/ui/theme";

export default function AppearanceScreen() {
  const t = useTheme();
  return (
    <SettingsSubScreen title="Appearance">
      <Text style={{ color: t.colors.muted, lineHeight: 22 }}>
        Theme picker (System / Light / Dark) + chat themes marketplace preview. Lands in
        Phase 6 alongside the themes catalog.
      </Text>
    </SettingsSubScreen>
  );
}
