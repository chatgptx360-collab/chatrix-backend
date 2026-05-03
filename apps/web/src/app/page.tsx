"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { useAuthStore } from "@/lib/auth/store";

/**
 * Marketing landing — public, but if you're already signed in we send you
 * straight into the app on mount. Anyone signed-out gets the brand hero.
 */
export default function Home() {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (accessToken) router.replace("/chats");
  }, [accessToken, router]);

  return (
    <main className="relative isolate min-h-screen overflow-hidden">
      {/* Backdrop glow */}
      <div className="absolute inset-0 -z-10 opacity-60">
        <div className="absolute -top-40 left-1/2 h-[40rem] w-[40rem] -translate-x-1/2 rounded-full bg-brand-gradient blur-3xl opacity-30" />
      </div>

      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/"><BrandLogo size={28} showWordmark /></Link>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/login" className="text-muted hover:text-fg transition">Sign in</Link>
          <Link href="/signup">
            <Button label="Get Chatrix" size="sm" />
          </Link>
        </div>
      </nav>

      <section className="mx-auto max-w-3xl px-6 pt-16 pb-32 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface/60 px-3 py-1 text-xs font-medium text-muted backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Now in private beta
        </span>
        <h1 className="mt-6 font-display text-5xl font-semibold leading-[1.05] tracking-tight md:text-7xl">
          Messaging without the{" "}
          <span className="bg-brand-gradient bg-clip-text text-transparent">phone number.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-muted">
          Add anyone with their <code className="font-medium text-fg">@username</code>.
          Real-time, private, and beautifully fast — across web, iOS, and Android.
        </p>
        <div className="mt-10 flex items-center justify-center gap-3">
          <Link href="/signup">
            <Button label="Create your @username" size="lg" />
          </Link>
          <Link href="/login">
            <Button label="I have an account" variant="secondary" size="lg" />
          </Link>
        </div>
      </section>
    </main>
  );
}
