import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useColorScheme } from "react-native";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/lib/auth/store";
import { tokens } from "@chatrix/ui";

/**
 * Root layout. Two responsibilities beyond the providers:
 *
 *   1. Sign-in gate — redirect unauthenticated users to (auth), signed-in
 *      users to (tabs). Implemented via a useEffect on the auth store + the
 *      current route segment.
 *
 *   2. Theme — drive the StatusBar based on color scheme, paint the screen
 *      background so cold loads don't flash white in dark mode.
 */
export default function RootLayout() {
  const scheme = useColorScheme();
  const dark = scheme === "dark";
  const palette = dark ? tokens.palette.dark : tokens.palette.light;

  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
      }),
  );

  const router = useRouter();
  const segments = useSegments();
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    const inAuth = segments[0] === "(auth)";
    const inApp  = segments[0] === "(tabs)";
    if (!accessToken && inApp) router.replace("/(auth)/welcome");
    if (accessToken && (inAuth || segments.length === 0)) router.replace("/(tabs)/chats");
  }, [accessToken, segments, router]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: palette.bg }}>
      <SafeAreaProvider>
        <QueryClientProvider client={client}>
          <StatusBar style={dark ? "light" : "dark"} />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: palette.bg },
              animation: "fade",
            }}
          />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
