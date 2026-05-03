import { Tabs } from "expo-router";
import { Platform, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { MessageCircle, Users, Settings } from "lucide-react-native";
import { useTheme } from "@/lib/ui/theme";

/**
 * Tab bar.
 *   - iOS: blurred translucent background, hairline top border
 *   - Android: solid surface, slight elevation
 *
 * Three tabs only — Chats / Friends / Settings — to keep the home shell
 * focused. Search lives inside Friends; Profile lives inside Settings.
 */
export default function TabsLayout() {
  const t = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarStyle: {
          position: Platform.OS === "ios" ? "absolute" : "relative",
          backgroundColor: Platform.OS === "ios" ? "transparent" : t.colors.surface,
          borderTopColor: t.colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: Platform.OS === "ios" ? 88 : 64,
          paddingTop: 8,
        },
        tabBarBackground:
          Platform.OS === "ios"
            ? () => <BlurView tint={t.dark ? "dark" : "light"} intensity={80} style={StyleSheet.absoluteFill} />
            : undefined,
        tabBarActiveTintColor:   t.colors.primary,
        tabBarInactiveTintColor: t.colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600", marginTop: 0 },
        sceneStyle: { backgroundColor: t.colors.bg },
      }}
    >
      <Tabs.Screen
        name="chats"
        options={{
          title: "Chats",
          tabBarIcon: ({ color, focused }) => (
            <View>
              <MessageCircle color={color} size={24} strokeWidth={focused ? 2.4 : 2} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: "Friends",
          tabBarIcon: ({ color, focused }) => (
            <Users color={color} size={24} strokeWidth={focused ? 2.4 : 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, focused }) => (
            <Settings color={color} size={24} strokeWidth={focused ? 2.4 : 2} />
          ),
        }}
      />
    </Tabs>
  );
}
