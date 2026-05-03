"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronRight, Bell, ShieldCheck, Palette, MonitorSmartphone, Copy, Share2, LogOut, BadgeCheck,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/lib/auth/store";
import { ApiAuth } from "@/lib/api/endpoints";
import { disconnectSocket } from "@/lib/socket";
import { constants } from "@chatrix/shared";

/**
 * Settings hub. Same architecture as the mobile screen — profile card on top,
 * grouped section list, sign-out at the bottom.
 */
export default function SettingsPage() {
  const router = useRouter();
  const me = useAuthStore((s) => s.user);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const clear = useAuthStore((s) => s.clear);
  const [signingOut, setSigningOut] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!me) return <div className="flex-1 bg-bg" />;

  async function copyHandle() {
    if (!me) return;
    await navigator.clipboard.writeText(constants.profileLink(me.username));
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  async function signOut() {
    if (!confirm("Sign out of Chatrix?")) return;
    setSigningOut(true);
    try {
      if (refreshToken) await ApiAuth.logout(refreshToken).catch(() => undefined);
    } finally {
      disconnectSocket();
      clear();
      router.replace("/login");
    }
  }

  return (
    <div className="flex-1 overflow-y-auto chat-scroll bg-bg">
      <header className="h-[60px] shrink-0 border-b border-border px-6 flex items-center">
        <h1 className="text-[18px] font-semibold tracking-tight text-fg">Settings</h1>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8 pb-24">
        {/* Profile card */}
        <div className="rounded-2xl border border-border bg-surface p-6 flex items-center gap-5">
          <Avatar url={me.avatarUrl} name={me.displayName ?? me.username} size={88} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold tracking-tight text-fg truncate">
                {me.displayName ?? `@${me.username}`}
              </h2>
              {me.emailVerifiedAt && <BadgeCheck size={20} className="text-primary shrink-0" />}
            </div>
            <button
              onClick={copyHandle}
              className="mt-1 inline-flex items-center gap-1.5 text-muted hover:text-fg transition"
            >
              <span>@{me.username}</span>
              <Copy size={13} />
              {copied && <span className="text-success text-xs ml-1">Copied!</span>}
            </button>
            {me.bio && <p className="mt-2 text-[14px] text-muted leading-relaxed">{me.bio}</p>}

            <div className="mt-4 flex items-center gap-2">
              <Link href="/settings/profile">
                <Button label="Edit profile" variant="secondary" size="sm" />
              </Link>
              <Button
                label="Share"
                variant="secondary"
                size="sm"
                icon={<Share2 size={14} />}
                onClick={copyHandle}
              />
            </div>
          </div>
        </div>

        {!me.emailVerifiedAt && (
          <Link
            href="/settings/verify-email"
            className="mt-4 flex items-center justify-between rounded-xl border border-danger/40 bg-danger/5 px-4 py-3 hover:bg-danger/10 transition"
          >
            <div>
              <p className="text-[14px] font-semibold text-danger">Verify your email</p>
              <p className="text-[12px] text-muted">Tap to resend the link to <span className="text-fg font-medium">{me.email}</span>.</p>
            </div>
            <ChevronRight size={16} className="text-danger" />
          </Link>
        )}

        <Section title="Account">
          <Row icon={<ShieldCheck size={18} className="text-primary" />}        label="Privacy & security" href="/settings/privacy" />
          <Row icon={<MonitorSmartphone size={18} className="text-primary" />}  label="Active devices"     href="/settings/devices" />
        </Section>

        <Section title="Preferences">
          <Row icon={<Bell size={18} className="text-primary" />}    label="Notifications" href="/settings/notifications" />
          <Row icon={<Palette size={18} className="text-primary" />} label="Appearance"    href="/settings/appearance" />
        </Section>

        {(me.role === "admin" || me.role === "moderator") && (
          <Section title="Staff">
            <Row icon={<ShieldCheck size={18} className="text-primary" />} label="Open admin panel" href="/admin" />
          </Section>
        )}

        <div className="mt-8">
          <Button
            label="Sign out"
            variant="secondary"
            icon={<LogOut size={14} className="text-danger" />}
            loading={signingOut}
            onClick={signOut}
            fullWidth
          />
        </div>

        <p className="text-center text-muted text-xs mt-6">Chatrix · v0.1.0</p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-8">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted mb-2 px-1">{title}</p>
      <div className="rounded-2xl border border-border bg-surface overflow-hidden">{children}</div>
    </div>
  );
}

function Row({
  icon, label, href,
}: { icon?: React.ReactNode; label: string; href: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-4 py-3.5 hover:bg-elevated transition border-b border-border last:border-b-0"
    >
      {icon && <span className="w-7 flex justify-center">{icon}</span>}
      <span className="flex-1 text-[14px] font-medium text-fg">{label}</span>
      <ChevronRight size={16} className="text-muted" />
    </Link>
  );
}
