"use client";
import { cn } from "@/lib/cn";

interface Props {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Optional accessible label. */
  label?: string;
}

/**
 * Brand toggle (iOS-style). 28×16 track, 12×12 knob, with the brand gradient
 * filling on. Use inside settings rows.
 */
export function Toggle({ checked, onChange, disabled, label }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex shrink-0 h-6 w-11 rounded-full transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        checked ? "bg-brand-gradient" : "bg-elevated border border-border",
        disabled && "opacity-50 pointer-events-none",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
