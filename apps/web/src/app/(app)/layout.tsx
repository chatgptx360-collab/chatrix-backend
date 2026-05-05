"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth/store";
import { Sidebar } from "@/components/layout/Sidebar";
import { CallUI } from "@/components/call/CallUI";

/**
 * Authenticated shell. Two responsibilities:
 *
 *   1. Auth gate — anyone without an access token gets bounced to /login,
 *      preserving the intended destination as `?next=`.
 *
 *   2. Layout — persistent sidebar (chat list + nav) on the left, the active
 *      page in the right pane. The sidebar collapses below md to a strip.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!accessToken) {
      const next = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
      router.replace(`/login${next}`);
    }
  }, [accessToken, pathname, router]);

  if (!accessToken) {
    // Render nothing while the redirect is in flight — avoids a flash of
    // the protected UI for unauthenticated visitors.
    return <div className="min-h-screen bg-bg" />;
  }

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-bg">
      <Sidebar />
      <main className="flex-1 min-w-0 flex flex-col bg-bg">{children}</main>
      {/* Mounted at the shell so a call modal/screen can pop in from any page. */}
      <CallUI />
    </div>
  );
}
