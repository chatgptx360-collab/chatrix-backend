/**
 * Formatting helpers used across screens. Kept tiny and pure so screens stay
 * declarative.
 */

export function formatRelativeTime(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  const diff = Date.now() - date.getTime();
  const min = 60_000, hr = 60 * min, day = 24 * hr;

  if (diff < min)        return "just now";
  if (diff < hr)         return `${Math.floor(diff / min)}m`;

  const isToday = date.toDateString() === new Date().toDateString();
  if (isToday) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "yesterday";

  if (diff < 7 * day) {
    return date.toLocaleDateString([], { weekday: "short" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

/** Format the last seen pill — "Online", "Last seen 5m ago", "Last seen yesterday". */
export function formatLastSeen(presence: "online" | "away" | "offline", lastSeenAt: string | null): string {
  if (presence === "online") return "Online";
  if (presence === "away")   return "Away";
  if (!lastSeenAt) return "Offline";
  return `Last seen ${formatRelativeTime(lastSeenAt)}`;
}

/** Compact preview for chat-list rows — strips newlines, trims to N chars. */
export function previewBody(body: string | null, limit = 80): string {
  if (!body) return "";
  return body.replace(/\s+/g, " ").trim().slice(0, limit);
}

/** Pretty label for non-text message kinds in previews. */
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
