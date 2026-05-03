"use client";
import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  error?: string | null;
  leading?: ReactNode;
  trailing?: ReactNode;
  hint?: string;
}

/**
 * Form input matching the mobile primitive. Floating uppercase label,
 * focus glow ring (subtle brand shadow), error slot, leading/trailing icons.
 *
 * Tailwind classes only — no styled-components, keeps the bundle small.
 */
export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { label, error, leading, trailing, hint, className, ...rest }, ref,
) {
  const [focused, setFocused] = useState(false);

  return (
    <div className="mb-3.5">
      {label && (
        <label className="block text-[11px] font-bold uppercase tracking-wider text-muted mb-1.5">
          {label}
        </label>
      )}
      <div
        className={cn(
          "flex items-center gap-2 rounded-[14px] border bg-surface px-3.5 min-h-[52px] transition",
          error
            ? "border-danger/70"
            : focused
              ? "border-primary/70 shadow-[0_4px_18px_-6px_rgba(99,74,246,0.32)]"
              : "border-border",
        )}
      >
        {leading && <span className="shrink-0 text-muted">{leading}</span>}
        <input
          ref={ref}
          autoCapitalize="off"
          autoCorrect="off"
          {...rest}
          onFocus={(e) => { setFocused(true); rest.onFocus?.(e); }}
          onBlur={(e)  => { setFocused(false); rest.onBlur?.(e); }}
          className={cn(
            "flex-1 bg-transparent outline-none text-[15px] text-fg placeholder:text-muted",
            "py-3",
            className,
          )}
        />
        {trailing && <span className="shrink-0">{trailing}</span>}
      </div>
      {!!error && <p className="mt-1.5 text-[13px] text-danger">{error}</p>}
      {!error && hint && <p className="mt-1.5 text-[12px] text-muted">{hint}</p>}
    </div>
  );
});
