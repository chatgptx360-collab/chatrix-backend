import { Text } from "react-native";
import { SettingsSubScreen } from "@/components/SettingsSubScreen";
import { useTheme } from "@/lib/ui/theme";

export default function NotificationsScreen() {
  const t = useTheme();
  return (
    <SettingsSubScreen title="Notifications">
      <Text style={{ color: t.colors.muted, lineHeight: 22 }}>
        Per-category toggles (messages, mentions, reactions), sound, and preview controls.
        The schema fields exist on `profiles.notifications`; UI editor pending Phase 4.5.
      </Text>
    </SettingsSubScreen>
  );
}
