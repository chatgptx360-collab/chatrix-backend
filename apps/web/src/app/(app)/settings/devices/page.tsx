"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Smartphone, Monitor, Loader2 } from "lucide-react";
import { SettingsSubLayout } from "@/components/layout/SettingsSubLayout";
import { ApiSessions } from "@/lib/api/endpoints";
import { useAuthStore } from "@/lib/auth/store";
import { formatRelativeTime } from "@/lib/format";

/**
 * Active devices. Lists every active session, marks the current device, lets
 * the user revoke any other.
 */
export default function DevicesPage() {
  const queryClient = useQueryClient();
  const refreshToken = useAuthStore((s) => s.refreshToken);

  const { data, isLoading } = useQuery({
    queryKey: ["sessions"],
    queryFn: () => ApiSessions.withCurrent(refreshToken!),
    enabled: !!refreshToken,
  });

  async function revoke(id: string) {
    if (!confirm("Sign this device out?")) return;
    await ApiSessions.revoke(id);
    queryClient.invalidateQueries({ queryKey: ["sessions"] });
  }

  return (
    <SettingsSubLayout title="Active devices">
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="text-primary animate-spin" size={20} />
        </div>
      ) : (
        <ul className="space-y-2.5">
          {(data ?? []).map((s) => {
            const isWeb = s.platform === "web" || s.platform === "desktop";
            return (
              <li
                key={s.id}
                className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5"
              >
                <span className="h-10 w-10 rounded-xl bg-elevated flex items-center justify-center text-primary">
                  {isWeb ? <Monitor size={20} /> : <Smartphone size={20} />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-[14px] font-semibold text-fg">
                    {s.deviceName ?? s.platform ?? "Unknown device"}
                    {s.isCurrent && <span className="ml-2 inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/15 text-primary">This device</span>}
                  </p>
                  <p className="truncate text-[12px] text-muted mt-0.5">
                    {s.userAgent ?? "—"} · last used {formatRelativeTime(s.lastUsedAt)}
                  </p>
                </div>
                {!s.isCurrent && (
                  <button
                    onClick={() => revoke(s.id)}
                    aria-label="Sign out this device"
                    className="h-9 w-9 rounded-xl flex items-center justify-center text-danger hover:bg-danger/10 transition"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SettingsSubLayout>
  );
}
