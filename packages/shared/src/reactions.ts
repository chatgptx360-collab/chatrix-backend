/**
 * Curated reaction set. Mirrors what iMessage/Slack/Discord settled on as the
 * "default frequent" — these account for >90% of reaction usage in real chats.
 *
 * Power users get any emoji via the full-picker entry (👀 More) — the API
 * itself accepts any single emoji string up to 16 chars.
 */
export const QUICK_REACTIONS: readonly string[] = ["👍", "❤️", "😂", "😮", "😢", "🔥"];
