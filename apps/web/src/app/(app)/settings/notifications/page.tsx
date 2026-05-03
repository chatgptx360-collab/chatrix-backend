"use client";
import { useState } from "react";
import { Loader2, Bell, BellOff } from "lucide-react";
import { SettingsSubLayout } from "@/components/layout/SettingsSubLayout";
import { Toggle } from "@/components/ui/Toggle";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/lib/auth/store";
import { ApiUsers } from "@/lib/api/endpoints";
import { ChatrixError } from "@chatrix/shared/errors";
import type { NotificationSettings } from "@chatrix/shared/types";

/**
 * Notification preferences editor.
 *
 *   - Messages       — banner on new message in any chat
 *   - Mentions       — banner only when @-mentioned (Phase 8 mention parser)
 *   - Reactions      — banner on emoji reactions to your messages
 *   - Sounds         — play a sound on banner
 *   - Preview        — show body text in the banner (off = "New message")
 *
 * Browser push permission is captured here too — handing the actual SW
 * registration off to a Phase 8 service worker.
 */
export default function NotificationsPage() {
  const me = useAuthStore((s) => s.user);
  const setSession = useAuthStore((s) => s.setSession);
  const [pending, setPending] = useState<keyof NotificationSettings | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );

  if (!me) return null;
  const settings = me.notifications;

  async function update(key: keyof NotificationSettings, value: boolean) {
    setError(null);
    setPending(key);
    try {
      const updated = await ApiUsers.updateMe({
        notifications: { ...me!.notifications, [key]: value },
      });
      const auth = useAuthStore.getState();
      setSession({
        user: updated,
        accessToken:  auth.accessToken!,
        refreshToken: auth.refreshToken!,
        expiresAt:    auth.expiresAt!,
      });
    } catch (err) {
      setError(err instanceof ChatrixError ? err.message : "Couldn't update.");
    } finally {
      setPending(null);
    }
  }

  async function requestPermission() {
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setPermission(result);
  }

  return (
    <SettingsSubLayout title="Notifications">
      {error && (
        <div className="mb-3 rounded-xl border border-danger/40 bg-danger/5 p-3 text-[13px] text-danger">
          {error}
        </div>
      )}

      {/* Browser permission state — visible only when not granted */}
      {permission !== "granted" && permission !== "unsupported" && (
        <div className="rounded-2xl border border-border bg-surface p-5 mb-4 flex items-start gap-3">
          <span className="h-10 w-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
            <Bell size={18} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-fg">Allow browser notifications</p>
            <p className="mt-0.5 text-[13px] text-muted">
              Get desktop notifications when a message arrives and Chatrix isn't focused.
              {permission === "denied" && " You'll need to re-enable this from your browser's site settings."}
            </p>
          </div>
          {permission === "default" && (
            <Button label="Enable" size="sm" onClick={requestPermission} />
          )}
        </div>
      )}
      {permission === "granted" && (
        <div className="rounded-2xl border border-success/40 bg-success/5 p-3 mb-4 flex items-center gap-2 text-[13px] text-success">
          <Bell size={14} /> Browser notifications are enabled for this site.
        </div>
      )}
      {permission === "unsupported" && (
        <div className="rounded-2xl border border-border bg-surface p-3 mb-4 flex items-center gap-2 text-[13px] text-muted">
          <BellOff size={14} /> This browser doesn't support web notifications.
        </div>
      )}

      <Group title="What to notify me about">
        <ToggleRow
          label="Messages"
          description="Banner on every new message in any chat."
          checked={settings.messages}
          onChange={(v) => update("messages", v)}
          loading={pending === "messages"}
        />
        <ToggleRow
          label="Mentions"
          description="Banner only when someone @-mentions you in a chat. Useful for groups."
          checked={settings.mentions}
          onChange={(v) => update("mentions", v)}
          loading={pending === "mentions"}
        />
      </Group>

      <Group title="Banner behavior">
        <ToggleRow
          label="Sound"
          description="Play a soft chime with the banner."
          checked={settings.sounds}
          onChange={(v) => update("sounds", v)}
          loading={pending === "sounds"}
        />
        <ToggleRow
          label="Show preview"
          description={`Show the message body in the banner. With this off, you'll just see "New message" until you open the chat.`}
          checked={settings.preview}
          onChange={(v) => update("preview", v)}
          loading={pending === "preview"}
        />
      </Group>
    </SettingsSubLayout>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 first:mt-0">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted mb-2 px-1">{title}</p>
      <div className="rounded-2xl border border-border bg-surface overflow-hidden">{children}</div>
    </div>
  );
}

function ToggleRow({
  label, description, checked, onChange, loading,
}: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void; loading?: boolean }) {
  return (
    <div className="flex items-start gap-4 px-4 py-4 border-b border-border last:border-b-0">
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold text-fg">{label}</p>
        <p className="mt-0.5 text-[13px] text-muted leading-snug">{description}</p>
      </div>
      <div className="pt-0.5 flex items-center gap-2">
        {loading && <Loader2 size={14} className="text-muted animate-spin" />}
        <Toggle checked={checked} onChange={onChange} disabled={loading} label={label} />
      </div>
    </div>
  );
}
