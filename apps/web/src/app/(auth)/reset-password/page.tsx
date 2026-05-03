"use client";
import { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ApiAuth } from "@/lib/api/endpoints";
import { ChatrixError } from "@chatrix/shared/errors";
import { passwordSchema } from "@chatrix/shared/schemas";

/**
 * Reset-password landing — consumes the `?token=` from the email link, prompts
 * for a new password, then bounces to /login (every active session was
 * revoked server-side, so the user must sign back in fresh).
 *
 * Suspense-wrapped because useSearchParams() bails out of static prerender;
 * see Next 14 missing-suspense-with-csr-bailout docs.
 */
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");

  const [password, setPassword] = useState("");
  const [show, setShow]         = useState(false);
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [done,  setDone]        = useState(false);

  useEffect(() => {
    if (!token) setError("This reset link is missing a token.");
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token) return;
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? "Invalid password.");
      return;
    }
    setBusy(true);
    try {
      await ApiAuth.reset(token, password);
      setDone(true);
      setTimeout(() => router.replace("/login"), 1500);
    } catch (err) {
      setError(err instanceof ChatrixError ? err.message : "Couldn't reset your password.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-fg">
          Password reset
        </h1>
        <p className="mt-3 text-[15px] text-muted leading-relaxed">
          You've been signed out of every device. Redirecting you to sign in…
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-1">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-fg">
        Choose a new password
      </h1>
      <p className="text-[15px] text-muted leading-relaxed pb-5">
        Once you save, every active session is signed out for safety.
      </p>

      <Input
        label="New password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        type={show ? "text" : "password"}
        placeholder="At least 8 characters with letters and numbers"
        autoComplete="new-password"
        trailing={
          <button type="button" onClick={() => setShow((v) => !v)} className="text-muted hover:text-fg p-1.5 -m-1.5">
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        }
      />

      {error && <p className="text-danger text-sm pb-2">{error}</p>}

      <Button label="Save and sign me out" type="submit" loading={busy} disabled={!token} fullWidth />

      <p className="mt-6 text-center text-muted text-sm">
        <Link href="/login" className="text-primary font-semibold hover:underline">Back to sign in</Link>
      </p>
    </form>
  );
}
