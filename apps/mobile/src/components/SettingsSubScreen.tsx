import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { Screen } from "./Screen";
import { useTheme } from "@/lib/ui/theme";

/**
 * Shared chrome for the placeholder settings sub-screens. Centralized so we
 * can fill them in one at a time without touching layout each time.
 */
export function SettingsSubScreen({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useTheme();
  const router = useRouter();
  return (
    <Screen edges={["top"]}>
      <View style={[s.header, { borderBottomColor: t.colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}><ArrowLeft size={24} color={t.colors.fg} /></Pressable>
        <Text style={[s.title, { color: t.colors.fg }]}>{title}</Text>
        <View style={{ width: 24 }} />
      </View>
      <View style={{ flex: 1, padding: 20 }}>{children}</View>
    </Screen>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  title:  { fontSize: 16, fontWeight: "600" },
});
