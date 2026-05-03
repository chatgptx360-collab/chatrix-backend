"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, X, Sparkles, Check, Clock, Loader2 } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ApiUsers, ApiChats, ApiFriends } from "@/lib/api/endpoints";
import { ChatrixError } from "@chatrix/shared/errors";
import type { PublicUser, Friendship } from "@chatrix/shared/types";

/**
 * Friends page — three sections:
 *   1. Search results (when typing)
 *   2. Pending requests inbox (incoming = actionable, outgoing = informational)
 *   3. Existing friends list
 *
 * The whole page reuses one auth gate from `(app)/layout.tsx`. Empty states
 * point the user to whichever section is the next useful step.
 */
export default function FriendsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [query, setQuery]     = useState("");
  const [results, setResults] = useState<PublicUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  const friendsQuery = useQuery({ queryKey: ["friends"],         queryFn: () => ApiFriends.list() });
  const pendingQuery = useQuery({ queryKey: ["friends-pending"], queryFn: () => ApiFriends.pending() });

  // Debounced trigram search.
  useEffect(() => {
    setError(null);
    const trimmed = query.trim().replace(/^@/, "");
    if (trimmed.length < 2) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(() => {
      ApiUsers.search(trimmed)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  async function openDm(peer: PublicUser) {
    setOpening(peer.id);
    setError(null);
    try {
      const chat = await ApiChats.openDm(peer.id);
      router.push(`/chats/${chat.id}`);
    } catch (err) {
      setError(err instanceof ChatrixError ? err.message : "Couldn't open this conversation.");
    } finally {
      setOpening(null);
    }
  }

  async function handleAccept(userId: string) {
    await ApiFriends.accept(userId).catch(() => undefined);
    queryClient.invalidateQueries({ queryKey: ["friends-pending"] });
    queryClient.invalidateQueries({ queryKey: ["friends"] });
  }
  async function handleDecline(userId: string) {
    await ApiFriends.decline(userId).catch(() => undefined);
    queryClient.invalidateQueries({ queryKey: ["friends-pending"] });
  }

  const showSearchHero = query.trim().length === 0 && results.length === 0;
  const tooShort       = !showSearchHero && query.trim().length < 2;

  const incoming = pendingQuery.data?.incoming ?? [];
  const outgoing = pendingQuery.data?.outgoing ?? [];
  const friends  = friendsQuery.data ?? [];

  return (
    <div className="flex-1 flex flex-col bg-bg">
      <header className="h-[60px] shrink-0 border-b border-border px-6 flex items-center">
        <h1 className="text-[18px] font-semibold tracking-tight text-fg">Friends</h1>
      </header>

      {/* Search */}
      <div className="px-6 pt-6 pb-3">
        <label className="flex items-center gap-2 h-12 px-4 rounded-2xl border border-border bg-surface focus-within:border-primary/60 transition max-w-2xl">
          <Search size={18} className="text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find by @username or name"
            className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-muted text-fg"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-muted hover:text-fg" aria-label="Clear">
              <X size={16} />
            </button>
          )}
        </label>
        {error && <p className="mt-3 text-sm text-danger max-w-2xl">{error}</p>}
      </div>

      <div className="flex-1 overflow-y-auto chat-scroll px-6 pb-12">
        {/* Search results */}
        {!showSearchHero && (
          <Section title={tooShort ? "Search" : "Results"}>
            {tooShort ? (
              <p className="px-2 py-2 text-muted text-sm">Type at least 2 characters to search.</p>
            ) : searching && results.length === 0 ? (
              <div className="flex items-center justify-center py-6"><Loader2 size={18} className="text-primary animate-spin" /></div>
            ) : results.length === 0 ? (
              <p className="px-2 py-2 text-muted text-sm">No matches for &ldquo;{query}&rdquo;.</p>
            ) : (
              <ul className="space-y-1">
                {results.map((u) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    actions={
                      <Button
                        label="Message"
                        size="sm"
                        variant="secondary"
                        loading={opening === u.id}
                        onClick={() => openDm(u)}
                      />
                    }
                  />
                ))}
              </ul>
            )}
          </Section>
        )}

        {/* Pending requests */}
        {(pendingQuery.isLoading || incoming.length > 0 || outgoing.length > 0) && (
          <Section title="Pending requests" badge={incoming.length || undefined}>
            {pendingQuery.isLoading ? (
              <div className="py-4"><Loader2 size={18} className="text-primary animate-spin" /></div>
            ) : (
              <>
                {incoming.length > 0 && (
                  <ul className="space-y-1">
                    {incoming.map((f) => f.user && (
                      <FriendRow
                        key={f.id}
                        friendship={f}
                        actions={
                          <div className="flex gap-2">
                            <Button label="Accept" size="sm" icon={<Check size={14} />} onClick={() => handleAccept(f.requesterId)} />
                            <Button label="Decline" size="sm" variant="ghost" onClick={() => handleDecline(f.requesterId)} />
                          </div>
                        }
                      />
                    ))}
                  </ul>
                )}
                {outgoing.length > 0 && (
                  <>
                    <p className="px-2 mt-3 mb-1 text-[11px] font-bold uppercase tracking-wider text-muted">Sent</p>
                    <ul className="space-y-1">
                      {outgoing.map((f) => f.user && (
                        <FriendRow
                          key={f.id}
                          friendship={f}
                          muted
                          actions={
                            <span className="inline-flex items-center gap-1.5 text-[12px] text-muted px-2">
                              <Clock size={12} /> Awaiting reply
                            </span>
                          }
                        />
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </Section>
        )}

        {/* Friends */}
        <Section title="Friends" badge={friends.length || undefined}>
          {friendsQuery.isLoading ? (
            <div className="py-4"><Loader2 size={18} className="text-primary animate-spin" /></div>
          ) : friends.length === 0 ? (
            <EmptyState
              icon={<Sparkles size={28} className="text-primary" />}
              title="No friends yet"
              description="Search for someone above to send a request, or message anyone to start a conversation."
            />
          ) : (
            <ul className="space-y-1">
              {friends.map((f) => f.user && (
                <UserRow
                  key={f.id}
                  user={f.user}
                  actions={
                    <Button
                      label="Message"
                      size="sm"
                      variant="secondary"
                      loading={opening === f.user.id}
                      onClick={() => openDm(f.user!)}
                    />
                  }
                />
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

// =====================================================

function Section({
  title, badge, children,
}: { title: string; badge?: number; children: React.ReactNode }) {
  return (
    <section className="max-w-2xl mt-6 first:mt-0">
      <h2 className="text-[12px] font-bold uppercase tracking-wider text-muted mb-2 flex items-center gap-2 px-1">
        {title}
        {badge !== undefined && (
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary/15 text-primary text-[11px] font-bold">
            {badge}
          </span>
        )}
      </h2>
      <div className="rounded-2xl border border-border bg-surface p-3">{children}</div>
    </section>
  );
}

function UserRow({
  user, actions,
}: { user: PublicUser; actions?: React.ReactNode }) {
  const display = user.displayName || `@${user.username}`;
  return (
    <li className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-elevated transition">
      <Link href={`/u/${user.username}`}>
        <Avatar url={user.avatarUrl} name={display} presence={user.presence} size={40} />
      </Link>
      <Link href={`/u/${user.username}`} className="flex-1 min-w-0">
        <p className="truncate text-[14px] font-semibold text-fg">{display}</p>
        <p className="truncate text-[12px] text-muted">@{user.username}</p>
      </Link>
      {actions}
    </li>
  );
}

function FriendRow({
  friendship, actions, muted,
}: { friendship: Friendship; actions?: React.ReactNode; muted?: boolean }) {
  const u = friendship.user!;
  return (
    <li className={`flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-elevated transition ${muted ? "opacity-70" : ""}`}>
      <Link href={`/u/${u.username}`}>
        <Avatar url={u.avatarUrl} name={u.displayName ?? u.username} presence={u.presence} size={40} />
      </Link>
      <Link href={`/u/${u.username}`} className="flex-1 min-w-0">
        <p className="truncate text-[14px] font-semibold text-fg">{u.displayName ?? `@${u.username}`}</p>
        <p className="truncate text-[12px] text-muted">@{u.username}</p>
      </Link>
      {actions}
    </li>
  );
}
