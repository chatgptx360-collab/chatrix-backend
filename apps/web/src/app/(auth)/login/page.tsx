"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ApiAuth } from "@/lib/api/endpoints";
import { useAuthStore } from "@/lib/auth/store";
import { ChatrixError } from "@chatrix/shared/errors";

// Next 14 requires components calling useSearchParams() to be inside a
// Suspense boundary so the static-prerender pass doesn't bail. We expose
// LoginForm as the inner client component and Suspense-wrap it at the
// page boundary — that's the canonical pattern from the Next docs.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/chats";
  const setSession = useAuthStore((s) => s.setSession);

  const [identifier, setIdentifier] = useState("");
  const [password,   setPassword]   = useState("");
  const [show,       setShow]       = useState(false);
  const [busy,       setBusy]       = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (identifier.length < 3 || password.length < 1) {
      setError("Please fill in both fields.");
      return;
    }
    setBusy(true);
    try {
      const session = await ApiAuth.login({
        identifier: identifier.trim().replace(/^@/, ""),
        password,
      });
      setSession(session);
      router.replace(next);
    } catch (err) {
      setError(err instanceof ChatrixError ? err.message : "Login failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-1">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-fg">
        Welcome back
      </h1>
      <p className="text-[15px] text-muted leading-relaxed pb-5">
        Sign in with your username or email.
      </p>

      <Input
        label="Username or email"
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        placeholder="@kamsy or you@example.com"
        autoComplete="username"
      />
      <Input
        label="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Your password"
        type={show ? "text" : "password"}
        autoComplete="current-password"
        trailing={
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="text-muted hover:text-fg p-1.5 -m-1.5"
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        }
      />

      {error && <p className="text-danger text-sm pb-2">{error}</p>}

      <Button label="Sign in" type="submit" loading={busy} fullWidth />

      <div className="mt-4 text-center">
        <Link href="/forgot" className="text-primary font-semibold hover:underline text-sm">
          Forgot password?
        </Link>
      </div>

      <p className="mt-6 text-center text-muted text-sm">
        New here?{" "}
        <Link href="/signup" className="text-primary font-semibold hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}
