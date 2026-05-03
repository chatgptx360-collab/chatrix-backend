"use client";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { SettingsSubLayout } from "@/components/layout/SettingsSubLayout";
import { Toggle } from "@/components/ui/Toggle";
import { useAuthStore } from "@/lib/auth/store";
import { ApiUsers } from "@/lib/api/endpoints";
import { ChatrixError } from "@chatrix/shared/errors";
import type { PrivacySettings } from "@chatrix/shared/types";

/**
 * Privacy editor.
 *
 *   - Last seen / Profile picture: who can see them (everyone | contacts | nobody)
 *   - Read receipts: ✓✓ flips to "read" color for the other party (mirrored in groups)
 *   - Searchable: appear in @username search results / public-profile lookups
 *
 * Each toggle / radio commits IMMEDIATELY (no Save button) — these are
 * single-decision fields, not a multi-field form.
 */
const VISIBILITY_OPTIONS: { value: PrivacySettings["lastSeen"]; label: string; hint: string }[] = [
  { value: "everyone", label: "Everyone", hint: "Anyone on Chatrix can see this." },
  { value: "contacts", label: "Friends",  hint: "Only accepted friends." },
  { value: "nobody",   label: "Nobody",   hint: "Hidden from everyone, including friends." },
];

export default function PrivacyPage() {
  const me = useAuthStore((s) => s.user);
  const setSession = useAuthStore((s) => s.setSession);
  const [pending, setPending] = useState<keyof PrivacySettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!me) return null;
  const privacy = me.privacy;

  async function update(key: keyof PrivacySettings, value: PrivacySettings[keyof PrivacySettings]) {
    setError(null);
    setPending(key);
    try {
      const updated = await ApiUsers.updateMe({
        privacy: { ...me!.privacy, [key]: value },
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

  return (
    <SettingsSubLayout title="Privacy & security">
      {error && (
        <div className="mb-3 rounded-xl border border-danger/40 bg-danger/5 p-3 text-[13px] text-danger">
          {error}
        </div>
      )}

      <Group title="Visibility">
        <RadioRow
          label="Last seen"
          description="When others can see you were last online."
          value={privacy.lastSeen}
          options={VISIBILITY_OPTIONS}
          onChange={(v) => update("lastSeen", v)}
          loading={pending === "lastSeen"}
        />
        <RadioRow
          label="Profile picture"
          description="Who can see your avatar."
          value={privacy.profilePicture}
          options={VISIBILITY_OPTIONS}
          onChange={(v) => update("profilePicture", v)}
          loading={pending === "profilePicture"}
        />
      </Group>

      <Group title="Receipts + Discovery">
        <ToggleRow
          label="Read receipts"
          description="Show ✓✓ when you've read a message. If you turn this off, you also stop seeing read receipts from others."
          checked={privacy.readReceipts}
          onChange={(v) => update("readReceipts", v)}
          loading={pending === "readReceipts"}
        />
        <ToggleRow
          label="Searchable"
          description="Allow others to find you by your @username or display name. Your profile link still works either way."
          checked={privacy.searchable}
          onChange={(v) => update("searchable", v)}
          loading={pending === "searchable"}
        />
      </Group>
    </SettingsSubLayout>
  );
}

// =====================================================

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

function RadioRow<T extends string>({
  label, description, value, options, onChange, loading,
}: {
  label: string; description: string;
  value: T; options: { value: T; label: string; hint: string }[];
  onChange: (next: T) => void; loading?: boolean;
}) {
  return (
    <div className="px-4 py-4 border-b border-border last:border-b-0">
      <div className="flex items-center gap-2">
        <p className="text-[14px] font-semibold text-fg">{label}</p>
        {loading && <Loader2 size={14} className="text-muted animate-spin" />}
      </div>
      <p className="mt-0.5 text-[13px] text-muted">{description}</p>
      <div className="mt-3 flex items-center gap-1.5 p-1 rounded-xl bg-elevated border border-border w-fit">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => value !== opt.value && onChange(opt.value)}
            title={opt.hint}
            disabled={loading}
            className={`px-3 h-8 rounded-lg text-[12px] font-semibold transition ${
              value === opt.value ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
