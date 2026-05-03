"use client";
import { cn } from "@/lib/cn";
import { gradientFor, initialsFor } from "@/lib/format";

interface Props {
  url?: string | null;
  name?: string | null;
  size?: number;
  presence?: "online" | "away" | "offline";
  className?: string;
}

/**
 * Avatar with three states:
 *   - <img> when `url`
 *   - Deterministic gradient + initials fallback otherwise
 *   - Optional presence dot bottom-right
 *
 * Same gradient algorithm as the mobile component — a given user always gets
 * the same color across web and mobile, so identity feels coherent.
 */
export function Avatar({ url, name, size = 44, presence, className }: Props) {
  const initials = initialsFor(name);
  const [from, to] = gradientFor(name ?? "");
  const dotSize = size >= 32 ? Math.max(10, size * 0.26) : 0;

  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          className="rounded-full object-cover w-full h-full bg-elevated"
          width={size}
          height={size}
        />
      ) : (
        <div
          className="rounded-full w-full h-full flex items-center justify-center text-white font-bold"
          style={{
            backgroundImage: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
            fontSize: size * 0.42,
            letterSpacing: "-0.02em",
          }}
        >
          {initials}
        </div>
      )}
      {presence && presence !== "offline" && dotSize > 0 && (
        <span
          className={cn(
            "absolute bottom-0 right-0 rounded-full",
            "border-2 border-bg",
            presence === "online" ? "bg-success" : "bg-amber-400",
          )}
          style={{ width: dotSize, height: dotSize }}
        />
      )}
    </div>
  );
}
