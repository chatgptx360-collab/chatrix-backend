import { cn } from "@/lib/cn";

interface Props {
  size?: number;
  showWordmark?: boolean;
  className?: string;
}

/**
 * Brand mark — gradient rounded square + optional wordmark. Identical
 * proportions to the mobile mark so the brand feels stitched across surfaces.
 */
export function BrandLogo({ size = 36, showWordmark = false, className }: Props) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        className="bg-brand-gradient"
        style={{
          width: size, height: size,
          borderRadius: size * 0.32,
        }}
      />
      {showWordmark && (
        <span className="font-display font-bold tracking-tight text-fg" style={{ fontSize: size * 0.5 }}>
          Chatrix
        </span>
      )}
    </div>
  );
}
