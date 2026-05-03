import { cn } from "@/lib/cn";

const COLORS: Record<string, string> = {
  active:    "bg-success/15 text-success",
  suspended: "bg-amber-500/15 text-amber-500",
  banned:    "bg-danger/15 text-danger",
  deleted:   "bg-muted/15 text-muted",

  open:      "bg-danger/15 text-danger",
  reviewing: "bg-amber-500/15 text-amber-500",
  actioned:  "bg-success/15 text-success",
  dismissed: "bg-muted/15 text-muted",

  user:       "bg-elevated text-muted",
  moderator:  "bg-primary/15 text-primary",
  admin:      "bg-brand-gradient text-white",
};

/**
 * Tiny pill for user status / report status / role. Reused everywhere in the
 * admin panel so colors stay consistent.
 */
export function StatusBadge({ value, className }: { value: string; className?: string }) {
  const tone = COLORS[value] ?? "bg-elevated text-muted";
  return (
    <span className={cn(
      "inline-flex items-center px-2 h-5 rounded-full text-[10px] font-bold uppercase tracking-wider",
      tone,
      className,
    )}>
      {value}
    </span>
  );
}
