import { Redirect } from "expo-router";
import { useAuthStore } from "@/lib/auth/store";

/**
 * Cold-start landing — defers to the auth gate in `_layout.tsx`. Signed-in
 * users land on the chat list; everyone else hits the welcome screen.
 */
export default function Index() {
  const accessToken = useAuthStore((s) => s.accessToken);
  return <Redirect href={accessToken ? "/(tabs)/chats" : "/(auth)/welcome"} />;
}
