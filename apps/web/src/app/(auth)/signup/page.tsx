"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ApiAuth } from "@/lib/api/endpoints";
import { useAuthStore } from "@/lib/auth/store";
import { signupSchema } from "@chatrix/shared/schemas";
import { ChatrixError } from "@chatrix/shared/errors";

export default function SignupPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);

  const [username, setUsername] = useState("");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [show,     setShow]     = useState(false);
  const [busy,     setBusy]     = useState(false);
  const [errors,   setErrors]   = useState<{ field?: string; message: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors(null);
    const parsed = signupSchema.safeParse({ username, email, password });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
      const first = Object.entries(flat)[0];
      setErrors({ field: first?.[0], message: first?.[1]?.[0] ?? "Please check your details." });
      return;
    }
    setBusy(true);
    try {
      const session = await ApiAuth.signup({ username, email, password });
      setSession(session);
      router.replace("/chats");
    } catch (err) {
      if (err instanceof ChatrixError) {
        const field = err.code.includes("USERNAME") ? "username"
                    : err.code.includes("EMAIL")    ? "email" : undefined;
        setErrors({ field, message: err.message });
      } else {
        setErrors({ message: "Something went wrong. Please try again." });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-1">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-fg">
        Create your @username
      </h1>
      <p className="text-[15px] text-muted leading-relaxed pb-5">
        Pick something you'll be happy with. You can change your display name later, but your @ stays.
      </p>

      <Input
        label="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value.replace(/^@/, ""))}
        placeholder="kamsy"
        autoComplete="username"
        leading={<span className="text-base">@</span>}
        error={errors?.field === "username" ? errors.message : null}
      />
      <Input
        label="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        type="email"
        autoComplete="email"
        error={errors?.field === "email" ? errors.message : null}
      />
      <Input
        label="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="At least 8 characters with letters and numbers"
        type={show ? "text" : "password"}
        autoComplete="new-password"
        error={errors?.field === "password" ? errors.message : null}
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

      {errors && !errors.field && (
        <p className="text-danger text-sm pb-2">{errors.message}</p>
      )}

      <Button label="Create account" type="submit" loading={busy} fullWidth />
      <p className="mt-3 text-[12px] text-muted text-center leading-snug">
        By continuing you agree to the Terms and Privacy Policy.
      </p>

      <p className="mt-6 text-center text-muted text-sm">
        Already have an account?{" "}
        <Link href="/login" className="text-primary font-semibold hover:underline">Sign in</Link>
      </p>
    </form>
  );
}
