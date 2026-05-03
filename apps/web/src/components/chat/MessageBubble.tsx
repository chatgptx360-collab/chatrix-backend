"use client";
import { useRef } from "react";
import { Check, CheckCheck, SmilePlus, Reply, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatRelativeTime } from "@/lib/format";
import type { Message } from "@chatrix/shared/types";

interface Props {
  message: Message;
  /** Viewer is the sender — flips alignment + colors. */
  mine: boolean;
  groupedWithPrev: boolean;
  groupedWithNext: boolean;
  /** Open the reactions popover anchored to this bubble. */
  onReact?: (rect: DOMRect, mine: boolean) => void;
  /** Begin replying to this message. */
  onReply?: () => void;
  /** Delete-for-everyone (only enabled for mine). */
  onDelete?: () => void;
  /** Toggle a quick-reaction directly (used when clicking an existing chip). */
  onToggleReaction?: (emoji: string) => void;
}

/**
 * Message bubble. Mirrors the mobile component's grouping + corner-flattening
 * rules so the visual rhythm matches across surfaces.
 *
 *   - text         → gradient (mine) or surface (theirs)
 *   - image / gif  → bordered image with optional caption underneath
 *   - deleted      → dashed-border tombstone
 *   - reactions    → chips floating below the bubble
 *   - receipts     → ✓ / ✓✓ with accent color when read (mine only)
 */
export function MessageBubble({
  message, mine, groupedWithPrev, groupedWithNext,
  onReact, onReply, onDelete, onToggleReaction,
}: Props) {
  const showTimestamp = !groupedWithPrev;
  const isImage = message.kind === "image" || message.kind === "gif";
  const isDeleted = !!message.deletedAt;
  const firstAttachment = message.attachments[0];
  const bubbleRef = useRef<HTMLDivElement>(null);

  // Open the reaction picker — anchored to the bubble's actual position.
  const fireReact = () => {
    if (!bubbleRef.current || !onReact) return;
    onReact(bubbleRef.current.getBoundingClientRect(), mine);
  };

  // Corner radii — flatten the side that touches a same-sender neighbor.
  const cornerClasses = mine
    ? cn(
        groupedWithPrev ? "rounded-tr-md" : "rounded-tr-2xl",
        groupedWithNext ? "rounded-br-md" : "rounded-br-2xl",
        "rounded-tl-2xl rounded-bl-2xl",
      )
    : cn(
        groupedWithPrev ? "rounded-tl-md" : "rounded-tl-2xl",
        groupedWithNext ? "rounded-bl-md" : "rounded-bl-2xl",
        "rounded-tr-2xl rounded-br-2xl",
      );

  return (
    <div className={cn("group/row px-4", groupedWithPrev ? "mt-0.5" : "mt-2.5")}>
      <div className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
        <div
          ref={bubbleRef}
          onContextMenu={(e) => { e.preventDefault(); fireReact(); }}
          className={cn("relative max-w-[68%] min-w-[40px] flex items-center gap-1.5", mine ? "flex-row-reverse" : "flex-row")}
        >
          {isDeleted ? (
            <div className={cn("px-3.5 py-2 border border-dashed border-border italic text-muted text-[13px]", cornerClasses)}>
              {mine ? "You deleted this message" : "Message deleted"}
            </div>
          ) : isImage && firstAttachment ? (
            <ImageBubble att={firstAttachment} caption={message.body} className={cornerClasses} mine={mine} />
          ) : (
            <div
              className={cn(
                "px-3.5 py-2.5 break-words",
                cornerClasses,
                mine
                  ? "bg-brand-gradient text-primary-fg shadow-[0_2px_10px_-4px_rgba(99,74,246,0.45)]"
                  : "bg-elevated text-fg border border-border/70",
              )}
            >
              <p className="text-[15px] leading-snug whitespace-pre-wrap">{message.body}</p>
            </div>
          )}

          {/* Hover toolbar — react / reply / (delete if mine). Stays out of
              the way until the row is hovered, then floats next to the bubble. */}
          {!isDeleted && (
            <div
              className={cn(
                "opacity-0 group-hover/row:opacity-100 transition flex items-center gap-0.5",
                "rounded-full bg-surface border border-border shadow-sm px-1 py-0.5",
              )}
            >
              {onReact && (
                <button onClick={fireReact} title="Add reaction"
                  className="h-7 w-7 rounded-full flex items-center justify-center text-muted hover:text-fg hover:bg-elevated">
                  <SmilePlus size={14} />
                </button>
              )}
              {onReply && (
                <button onClick={onReply} title="Reply"
                  className="h-7 w-7 rounded-full flex items-center justify-center text-muted hover:text-fg hover:bg-elevated">
                  <Reply size={14} />
                </button>
              )}
              {mine && onDelete && (
                <button onClick={onDelete} title="Delete for everyone"
                  className="h-7 w-7 rounded-full flex items-center justify-center text-muted hover:text-danger hover:bg-elevated">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          )}
        </div>

        {showTimestamp && (
          <div className={cn("mt-1 flex items-center gap-1.5 text-[11px] text-muted", mine ? "" : "")}>
            <span>{formatRelativeTime(message.createdAt)}</span>
            {message.editedAt && <span>· edited</span>}
            {mine && !isDeleted && (
              message.state === "read"
                ? <CheckCheck size={13} className="text-primary" />
                : message.state === "delivered"
                  ? <CheckCheck size={13} className="text-muted" />
                  : <Check size={13} className="text-muted" />
            )}
          </div>
        )}

        {message.reactions.length > 0 && !isDeleted && (
          <div className={cn("mt-1 flex flex-wrap gap-1", mine ? "justify-end" : "justify-start")}>
            {message.reactions.map((r) => (
              <button
                key={r.emoji}
                onClick={() => onToggleReaction?.(r.emoji)}
                className="inline-flex items-center gap-1 px-2 h-6 rounded-full bg-elevated border border-border text-[12px] hover:bg-surface transition"
                title={`${r.count} ${r.count === 1 ? "reaction" : "reactions"}`}
              >
                <span>{r.emoji}</span>
                {r.count > 1 && <span className="text-muted font-semibold">{r.count}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ImageBubble({
  att, caption, className, mine,
}: {
  att: NonNullable<Message["attachments"][number]>;
  caption: string | null;
  className?: string;
  mine: boolean;
}) {
  const aspect = att.width && att.height ? att.width / att.height : 1.2;
  const w = 320;
  const h = w / Math.max(0.4, Math.min(2, aspect));
  return (
    <div className={cn("overflow-hidden border border-border/60", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={att.url}
        alt=""
        width={w}
        height={h}
        className="block"
        style={{ width: w, height: h, objectFit: "cover" }}
      />
      {!!caption && (
        <div className={cn("px-3 py-2", mine ? "bg-primary text-primary-fg" : "bg-elevated text-fg")}>
          <p className="text-[15px] leading-snug whitespace-pre-wrap">{caption}</p>
        </div>
      )}
    </div>
  );
}
