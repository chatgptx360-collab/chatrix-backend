"use client";
import { useState } from "react";
import { CheckCircle2, MailCheck } from "lucide-react";
import { SettingsSubLayout } from "@/components/layout/SettingsSubLayout";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/lib/auth/store";
import { ApiAuth } from "@/lib/api/endpoints";

/**
 * Resend the verification email. Verification itself happens on
 * `/verify-email?token=…`, hit by the link from the email.
 */
export default function VerifyEmailSettingsPage() {
  const me = useAuthStore((s) => s.user);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function resend() {
    setBusy(true);
    try {
      await ApiAuth.resendVerifyEmail();
      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  if (me?.emailVerifiedAt) {
    return (
      <SettingsSubLayout title="Email verification">
        <div className="rounded-2xl border border-success/40 bg-success/5 p-5 flex items-start gap-3">
          <CheckCircle2 className="text-success shrink-0 mt-0.5" size={20} />
          <div>
            <p className="text-[14px] font-semibold text-fg">Email verified</p>
            <p className="text-[13px] text-muted mt-1">Your email <span className="text-fg font-medium">{me.email}</span> is confirmed. Nothing more to do.</p>
          </div>
        </div>
      </SettingsSubLayout>
    );
  }

  return (
    <SettingsSubLayout title="Verify your email">
      <div className="rounded-2xl border border-border bg-surface p-6">
        <div className="flex items-center gap-3 mb-3">
          <span className="h-10 w-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center"><MailCheck size={20} /></span>
          <p className="text-[15px] text-fg">
            Your email <span className="font-semibold">{me?.email}</span> isn't verified yet.
          </p>
        </div>
        <p className="text-[14px] text-muted leading-relaxed mb-5">
          We'll send a fresh link. Click it from the same browser to confirm. The link expires in 24 hours.
        </p>
        {sent ? (
          <p className="text-success font-semibold flex items-center gap-2">
            <CheckCircle2 size={16} /> Sent. Check your inbox.
          </p>
        ) : (
          <Button label="Send verification link" loading={busy} onClick={resend} fullWidth />
        )}
      </div>
    </SettingsSubLayout>
  );
}
