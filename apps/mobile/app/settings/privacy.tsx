import { Text } from "react-native";
import { SettingsSubScreen } from "@/components/SettingsSubScreen";
import { useTheme } from "@/lib/ui/theme";

export default function PrivacyScreen() {
  const t = useTheme();
  return (
    <SettingsSubScreen title="Privacy & security">
      <Text style={{ color: t.colors.muted, lineHeight: 22 }}>
        Privacy controls (last seen, profile picture, read receipts, searchability) and
        2FA setup land here. The schema and API are ready — UI editor pending Phase 4.5.
      </Text>
    </SettingsSubScreen>
  );
}
