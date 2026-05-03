/**
 * Formatting helpers — mirror of the mobile helpers so dates/strings render
 * identically on both platforms. Pure, safe to call during render.
 */

export function formatRelativeTime(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  const diff = Date.now() - date.getTime();
  const min = 60_000, hr = 60 * min, day = 24 * hr;

  if (diff < min) return "just now";
  if (diff < hr)  return `${Math.floor(diff / min)}m`;

  const isToday = date.toDateString() === new Date().toDateString();
  if (isToday) return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "yesterday";

  if (diff < 7 * day) return date.toLocaleDateString([], { weekday: "short" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function formatLastSeen(presence: "online" | "away" | "offline", lastSeenAt: string | null): string {
  if (presence === "online") return "Online";
  if (presence === "away")   return "Away";
  if (!lastSeenAt) return "Offline";
  return `Last seen ${formatRelativeTime(lastSeenAt)}`;
}

export function previewBody(body: string | null, limit = 80): string {
  if (!body) return "";
  return body.replace(/\s+/g, " ").trim().slice(0, limit);
}

export function kindLabel(kind: string): string {
  switch (kind) {
    case "image": return "📷 Photo";
    case "video": return "🎥 Video";
    case "audio": return "🎤 Voice note";
    case "file":  return "📎 File";
    case "gif":   return "🎞 GIF";
    default:      return "";
  }
}

/** Initials for the avatar fallback — shared with mobile's logic. */
export function initialsFor(name: string | null | undefined): string {
  const base = name ?? "?";
  return (
    base
      .split(/[\s_@]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || base[0]?.toUpperCase() || "?"
  );
}

/** Deterministic gradient picker for the avatar fallback. */
export function gradientFor(seed: string): readonly [string, string] {
  const palette = [
    ["#8B79FF", "#48E0FF"], ["#FF7AB6", "#FF6B6B"], ["#6BFFC1", "#3CC8FF"],
    ["#FFB86B", "#FF6B6B"], ["#A78BFA", "#F472B6"], ["#22D3EE", "#3B82F6"],
    ["#34D399", "#22D3EE"], ["#F59E0B", "#EF4444"],
  ] as const;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length]!;
}
