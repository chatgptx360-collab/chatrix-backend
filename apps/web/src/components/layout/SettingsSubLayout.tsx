import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Shared chrome for settings sub-pages — back-arrow header + max-width body.
 * Lets each sub-page focus on its own form/content.
 */
export function SettingsSubLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto chat-scroll bg-bg">
      <header className="h-[60px] shrink-0 border-b border-border px-6 flex items-center gap-3">
        <Link
          href="/settings"
          aria-label="Back"
          className="h-9 w-9 rounded-xl flex items-center justify-center text-muted hover:text-fg hover:bg-elevated transition"
        >
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-[18px] font-semibold tracking-tight text-fg">{title}</h1>
      </header>
      <div className="max-w-2xl mx-auto px-6 py-8 pb-24">{children}</div>
    </div>
  );
}
