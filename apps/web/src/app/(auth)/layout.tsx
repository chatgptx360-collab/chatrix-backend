import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/ui/BrandLogo";

/**
 * Auth shell — split layout. Left pane: brand hero with the gradient backdrop
 * (visible only on lg+ screens, mirroring the marketing page tone). Right
 * pane: the form, centered and scrollable.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg flex">
      {/* Left — brand panel */}
      <aside className="relative hidden lg:flex w-1/2 bg-elevated overflow-hidden border-r border-border">
        <div className="absolute -top-40 -left-40 w-[40rem] h-[40rem] rounded-full bg-brand-gradient opacity-25 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -right-40 w-[40rem] h-[40rem] rounded-full bg-brand-gradient opacity-15 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <Link href="/" className="self-start">
            <BrandLogo size={36} showWordmark />
          </Link>

          <div className="max-w-lg">
            <h2 className="font-display text-4xl xl:text-5xl font-semibold tracking-tight leading-[1.05] text-fg">
              Messaging without{" "}
              <span className="bg-brand-gradient bg-clip-text text-transparent">
                the phone number.
              </span>
            </h2>
            <p className="mt-5 text-lg text-muted leading-relaxed">
              Real-time. Private. Beautifully fast across web, iOS, and Android.
              Connect with <code className="font-mono text-fg">@username</code> — never a number.
            </p>
          </div>

          <p className="text-xs text-muted">© Chatrix · chatrix.app</p>
        </div>
      </aside>

      {/* Right — form pane */}
      <main className="flex-1 flex flex-col">
        <header className="flex items-center justify-between px-6 lg:px-10 py-5 lg:hidden">
          <Link href="/"><BrandLogo size={32} showWordmark /></Link>
        </header>
        <div className="flex-1 flex items-center justify-center p-6 lg:p-10">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </main>
    </div>
  );
}
