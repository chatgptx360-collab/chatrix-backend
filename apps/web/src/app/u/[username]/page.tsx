import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { MessageCircle, UserPlus, BadgeCheck, Flag } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { formatLastSeen } from "@/lib/format";
import { constants } from "@chatrix/shared";

/**
 * Public profile — the page behind `chatrix.app/@username`. Reachable signed
 * out (so external links work). When the visitor isn't signed in we point the
 * Message CTA at /signup with a `next` param so they land on the chat after.
 *
 * Server-component fetch so we get OG tags, fast TTFB, and no auth needed.
 * Anyone can view a public profile (the API already enforces the
 * `searchable` privacy flag — non-searchable profiles 404).
 */
export const dynamic = "force-dynamic";

interface PublicUser {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  presence: "online" | "away" | "offline";
  lastSeenAt: string | null;
}

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function fetchProfile(username: string): Promise<PublicUser | null> {
  const res = await fetch(`${API}/v1/users/@${encodeURIComponent(username)}`, {
    cache: "no-store",
    // No auth header — endpoint allows public reads when `searchable=true`.
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Profile fetch failed: ${res.status}`);
  return (await res.json()) as PublicUser;
}

export async function generateMetadata(
  { params }: { params: Promise<{ username: string }> },
): Promise<Metadata> {
  const { username } = await params;
  const user = await fetchProfile(username).catch(() => null);
  if (!user) return { title: "Not found · Chatrix" };
  const display = user.displayName ?? `@${user.username}`;
  return {
    title: `${display} (@${user.username}) · Chatrix`,
    description: user.bio ?? `Chat with ${display} on Chatrix — no phone number required.`,
    openGraph: {
      title: `${display} on Chatrix`,
      description: user.bio ?? `@${user.username} on Chatrix`,
      images: user.avatarUrl ? [{ url: user.avatarUrl }] : undefined,
      url: constants.profileLink(user.username),
      type: "profile",
    },
  };
}

export default async function PublicProfilePage(
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;
  const user = await fetchProfile(username);
  if (!user) notFound();

  const display = user.displayName ?? `@${user.username}`;

  return (
    <main className="min-h-screen bg-bg flex flex-col">
      {/* Top bar */}
      <header className="px-6 py-5 flex items-center justify-between border-b border-border">
        <Link href="/"><BrandLogo size={32} showWordmark /></Link>
        <div className="flex items-center gap-2">
          <Link href="/login"><Button label="Sign in" variant="ghost" size="sm" /></Link>
          <Link href="/signup"><Button label="Get Chatrix" size="sm" /></Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative flex-1 flex items-center justify-center p-6">
        <div className="absolute -top-32 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-brand-gradient blur-3xl opacity-20 pointer-events-none" />

        <div className="relative w-full max-w-md rounded-3xl border border-border bg-surface p-8 text-center shadow-[0_30px_80px_-30px_rgba(99,74,246,0.25)]">
          <div className="flex justify-center">
            <Avatar url={user.avatarUrl} name={display} presence={user.presence} size={120} />
          </div>

          <div className="mt-5 flex items-center justify-center gap-2">
            <h1 className="font-display text-3xl font-bold tracking-tight text-fg">{display}</h1>
            <BadgeCheck size={22} className="text-primary opacity-80" />
          </div>
          <p className="mt-1 text-muted">@{user.username}</p>
          <p className="mt-1 text-[13px] text-muted">{formatLastSeen(user.presence, user.lastSeenAt)}</p>

          {user.bio && (
            <p className="mt-5 text-[15px] text-fg leading-relaxed">{user.bio}</p>
          )}

          <div className="mt-7 grid grid-cols-2 gap-2.5">
            <Link href={`/login?next=${encodeURIComponent(`/chats?dm=${user.id}`)}`}>
              <Button label="Message" icon={<MessageCircle size={16} />} fullWidth />
            </Link>
            <Link href={`/signup?next=${encodeURIComponent(`/chats?dm=${user.id}`)}`}>
              <Button label="Add friend" icon={<UserPlus size={16} />} variant="secondary" fullWidth />
            </Link>
          </div>

          <Link
            href="#"
            className="mt-5 inline-flex items-center gap-1.5 text-muted hover:text-fg text-[13px]"
          >
            <Flag size={12} /> Report this user
          </Link>
        </div>
      </section>

      <footer className="px-6 py-4 text-center text-xs text-muted border-t border-border">
        Chatrix · {constants.profileLink(user.username)}
      </footer>
    </main>
  );
}
