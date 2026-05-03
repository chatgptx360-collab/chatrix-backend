import type { ReactNode } from "react";
import { Button } from "./Button";
import { cn } from "@/lib/cn";

interface Props {
  icon?: ReactNode;
  title: string;
  description?: string;
  ctaLabel?: string;
  onPressCta?: () => void;
  className?: string;
}

/**
 * Reusable empty-state. Same shape as mobile's so screens feel identical.
 */
export function EmptyState({ icon, title, description, ctaLabel, onPressCta, className }: Props) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center px-6 py-16", className)}>
      {icon && <div className="mb-4 opacity-80">{icon}</div>}
      <h3 className="text-xl font-semibold tracking-tight text-fg">{title}</h3>
      {description && (
        <p className="mt-2 text-[15px] text-muted leading-relaxed max-w-md">{description}</p>
      )}
      {ctaLabel && (
        <div className="mt-6">
          <Button label={ctaLabel} onClick={onPressCta} />
        </div>
      )}
    </div>
  );
}
