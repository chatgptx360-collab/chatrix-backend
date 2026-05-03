"use client";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  label: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "sm" | "lg";
  loading?: boolean;
  fullWidth?: boolean;
  icon?: ReactNode;
  /** Override `label` rendering — used by Link wrappers that pass JSX children. */
  children?: ReactNode;
}

/**
 * The single button used across the web app. Variants:
 *   primary   — brand gradient, white text. Default CTA.
 *   secondary — surface bg + border. Used alongside primary.
 *   ghost     — transparent. Cancel / dismiss.
 *   danger    — red. Destructive flows.
 *
 * Tailwind handles dark mode automatically via the brand-token CSS variables.
 */
export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { label, variant = "primary", size = "md", loading, fullWidth, icon, className, disabled, children, ...rest },
  ref,
) {
  const sizeClass =
    size === "sm" ? "px-4 py-2 text-sm" :
    size === "lg" ? "px-6 py-3.5 text-base" :
                    "px-5 py-3 text-sm";

  const variantClass =
    variant === "primary"   ? "bg-brand-gradient text-primary-fg shadow-glow hover:opacity-95"
  : variant === "secondary" ? "bg-surface text-fg border border-border hover:bg-elevated"
  : variant === "ghost"     ? "text-fg hover:bg-elevated"
  : /* danger */              "bg-danger text-white hover:opacity-95";

  return (
    <button
      ref={ref}
      disabled={loading || disabled}
      className={cn(
        "inline-flex items-center justify-center gap-2",
        "rounded-full font-semibold tracking-tight",
        "transition active:scale-[0.985] disabled:opacity-50 disabled:pointer-events-none",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        sizeClass, variantClass,
        fullWidth && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Spinner inverted={variant === "primary" || variant === "danger"} />
      ) : (
        <>
          {icon}
          {children ?? label}
        </>
      )}
    </button>
  );
});

function Spinner({ inverted }: { inverted: boolean }) {
  return (
    <svg
      className={cn("animate-spin h-4 w-4", inverted ? "text-white" : "text-fg")}
      fill="none" viewBox="0 0 24 24"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
