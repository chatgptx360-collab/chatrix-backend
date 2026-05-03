"use client";
import { Reply, X } from "lucide-react";
import { kindLabel } from "@/lib/format";
import type { Message } from "@chatrix/shared/types";

interface Props {
  target: Pick<Message, "id" | "senderId" | "body" | "kind">;
  /** "@kamsy" / "Kamsy" — caller resolves from chat members. */
  authorLabel: string;
  onCancel: () => void;
}

/**
 * Reply banner — sits above the composer when the user is replying to a
 * specific message. Mirrors the Telegram/iMessage pattern.
 *
 * The composer reads the reply target's id from outer state and sends it as
 * `replyToId` in the message payload.
 */
export function ReplyBanner({ target, authorLabel, onCancel }: Props) {
  const preview = target.kind === "text"
    ? (target.body ?? "(empty)")
    : kindLabel(target.kind) || "Message";

  return (
    <div className="px-4 pt-2">
      <div className="flex items-stretch gap-3 rounded-xl bg-elevated border border-border pr-2">
        <span className="w-1 rounded-l-xl bg-brand-gradient" />
        <div className="flex-1 min-w-0 py-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
            <Reply size={11} /> Replying to {authorLabel}
          </p>
          <p className="mt-0.5 text-[13px] text-fg truncate">{preview}</p>
        </div>
        <button
          onClick={onCancel}
          aria-label="Cancel reply"
          className="self-center h-7 w-7 rounded-full flex items-center justify-center text-muted hover:text-fg hover:bg-surface transition"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
