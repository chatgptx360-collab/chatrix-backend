"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ApiAuth } from "@/lib/api/endpoints";

/**
 * Verify-email landing — consumes the `?token=` from the email link.
 * Auto-submits on mount; renders the result. Single-use tokens, so this page
 * only succeeds once.
 *
 * Suspense-wrapped because useSearchParams() bails out of static prerender;
 * see Next 14 missing-suspense-with-csr-bailout docs.
 */
export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailInner />
    </Suspense>
  );
}

function VerifyEmailInner() {
  const params = useSearchParams();
  const token  = params.get("token");
  const [state, setState] = useState<"pending" | "ok" | "error">("pending");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setState("error"); setError("This link is missing a token."); return; }
    ApiAuth.verifyEmail(token)
      .then(() => setState("ok"))
      .catch((err) => { setState("error"); setError(err?.message ?? "This link is invalid or expired."); });
  }, [token]);

  return (
    <div className="text-center">
      {state === "pending" && (
        <>
          <Loader2 className="mx-auto h-10 w-10 text-primary animate-spin" />
          <h1 className="mt-6 font-display text-3xl font-semibold tracking-tight text-fg">
            Verifying your email…
          </h1>
        </>
      )}
      {state === "ok" && (
        <>
          <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
          <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight text-fg">
            Email verified
          </h1>
          <p className="mt-3 text-muted">You're all set. Welcome to Chatrix.</p>
          <div className="mt-6">
            <Link href="/chats"><Button label="Open Chatrix" fullWidth /></Link>
          </div>
        </>
      )}
      {state === "error" && (
        <>
          <AlertCircle className="mx-auto h-12 w-12 text-danger" />
          <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight text-fg">
            Couldn't verify your email
          </h1>
          <p className="mt-3 text-muted">{error}</p>
          <div className="mt-6">
            <Link href="/login"><Button label="Sign in" fullWidth variant="secondary" /></Link>
          </div>
        </>
      )}
    </div>
  );
}
