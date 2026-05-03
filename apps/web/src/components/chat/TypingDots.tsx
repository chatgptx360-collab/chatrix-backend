/**
 * Typing indicator. Pure CSS — three dots phase-shifted via animation-delay.
 * The keyframes live in globals.css (added below).
 */
export function TypingDots() {
  return (
    <div className="flex items-center gap-1.5 px-4 py-2">
      <span className="dot" />
      <span className="dot" style={{ animationDelay: "150ms" }} />
      <span className="dot" style={{ animationDelay: "300ms" }} />
    </div>
  );
}
