"use client";
import { useEffect, useRef } from "react";
import { QUICK_REACTIONS } from "@chatrix/shared/reactions";
import { cn } from "@/lib/cn";

interface Props {
  /** Anchor element's bounding-rect from getBoundingClientRect(). */
  anchor: { x: number; y: number; width: number; height: number };
  /** Whether this bubble is the viewer's own (positions popover differently). */
  mine: boolean;
  onPick: (emoji: string) => void;
  onClose: () => void;
}

/**
 * Reaction popover. Renders fixed-positioned above (or below, when not enough
 * room) the anchored bubble. Click-outside + Escape close it.
 *
 * Keyboard: ←/→ navigates, Enter picks. Quick-reaction strip only — full
 * emoji picker is queued for Phase 8.
 */
export function ReactionPicker({ anchor, mine, onPick, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Click-outside + Escape.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown",   onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown",   onKey);
    };
  }, [onClose]);

  // Position above the bubble; flip below if too close to the top.
  const top = anchor.y > 60 ? anchor.y - 56 : anchor.y + anchor.height + 8;
  const left = mine
    ? Math.max(8, anchor.x + anchor.width - 280)
    : Math.min(window.innerWidth - 280 - 8, anchor.x);

  return (
    <div
      ref={ref}
      role="menu"
      style={{ top, left, position: "fixed" }}
      className={cn(
        "z-50 flex items-center gap-1 px-2 py-1.5 rounded-full",
        "bg-surface border border-border",
        "shadow-[0_12px_40px_-8px_rgba(0,0,0,0.18)]",
        "animate-fade-in",
      )}
    >
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => { onPick(emoji); onClose(); }}
          className="h-9 w-9 rounded-full text-xl hover:bg-elevated active:scale-90 transition flex items-center justify-center"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
