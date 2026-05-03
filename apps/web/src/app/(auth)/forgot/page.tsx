"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ApiAuth } from "@/lib/api/endpoints";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [busy,  setBusy]  = useState(false);
  const [done,  setDone]  = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) return;
    setBusy(true);
    try {
      await ApiAuth.forgot(email);
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-fg">
          Check your inbox
        </h1>
        <p className="mt-3 text-[15px] text-muted leading-relaxed">
          If an account exists for <span className="text-fg font-semibold">{email}</span>,
          we've sent a link to reset your password. The link expires in 1 hour.
        </p>
        <div className="mt-6">
          <Link href="/login"><Button label="Back to sign in" fullWidth /></Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-1">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-fg">
        Reset your password
      </h1>
      <p className="text-[15px] text-muted leading-relaxed pb-5">
        Enter your email and we'll send a reset link.
      </p>
      <Input
        label="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        type="email"
        autoComplete="email"
      />
      <Button label="Send reset link" type="submit" loading={busy} fullWidth />
      <p className="mt-6 text-center text-muted text-sm">
        Remembered it?{" "}
        <Link href="/login" className="text-primary font-semibold hover:underline">Back to sign in</Link>
      </p>
    </form>
  );
}
