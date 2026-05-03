"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth/store";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

/**
 * Admin shell — separate from the user app. Two gates:
 *
 *   1. Authenticated  — bounce to /login otherwise.
 *   2. Role >= moderator — render a clean "no access" message otherwise
 *      (don't redirect; users may have arrived via a stale URL and we want
 *      them to understand why they bounced).
 *
 * The backend re-checks both gates on every endpoint call — this layer is
 * UX, not security.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const accessToken = useAuthStore((s) => s.accessToken);
  const me = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!accessToken) router.replace(`/login?next=${encodeURIComponent(pathname ?? "/admin")}`);
  }, [accessToken, pathname, router]);

  if (!accessToken) return <div className="min-h-screen bg-bg" />;

  if (me && me.role !== "admin" && me.role !== "moderator") {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-8">
        <div className="max-w-md text-center rounded-3xl border border-border bg-surface p-10">
          <h1 className="font-display text-3xl font-bold text-fg">Admin only</h1>
          <p className="mt-3 text-muted leading-relaxed">
            This area is restricted to moderators and admins. If you think this is wrong,
            ping <code className="font-mono text-fg">support@chatrix.app</code>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-bg">
      <AdminSidebar />
      <main className="flex-1 min-w-0 flex flex-col bg-bg">{children}</main>
    </div>
  );
}
