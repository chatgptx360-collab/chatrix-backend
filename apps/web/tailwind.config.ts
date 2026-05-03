import type { Config } from "tailwindcss";

/**
 * Brand tokens are defined as CSS variables in globals.css so we can swap
 * themes (light/dark/marketplace) without recompiling.
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg:        "rgb(var(--bg) / <alpha-value>)",
        surface:   "rgb(var(--surface) / <alpha-value>)",
        elevated:  "rgb(var(--elevated) / <alpha-value>)",
        border:    "rgb(var(--border) / <alpha-value>)",
        fg:        "rgb(var(--fg) / <alpha-value>)",
        muted:     "rgb(var(--muted) / <alpha-value>)",
        primary: {
          DEFAULT: "rgb(var(--primary) / <alpha-value>)",
          fg:      "rgb(var(--primary-fg) / <alpha-value>)",
        },
        accent:    "rgb(var(--accent) / <alpha-value>)",
        success:   "rgb(var(--success) / <alpha-value>)",
        danger:    "rgb(var(--danger) / <alpha-value>)",
      },
      borderRadius: {
        sm: "0.5rem",
        DEFAULT: "0.875rem",
        lg: "1.25rem",
        xl: "1.75rem",
        full: "9999px",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, rgb(var(--primary)) 0%, rgb(var(--accent)) 100%)",
      },
      boxShadow: {
        glow: "0 0 0 1px rgb(var(--primary) / 0.3), 0 8px 32px -4px rgb(var(--primary) / 0.45)",
        chip: "0 1px 2px rgb(0 0 0 / 0.06), 0 4px 16px -4px rgb(0 0 0 / 0.08)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "ui-sans-serif", "system-ui"],
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%":   { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-in":  "fade-in 200ms ease-out",
        "slide-up": "slide-up 280ms cubic-bezier(0.2, 0.7, 0.1, 1)",
        shimmer:    "shimmer 2.4s linear infinite",
      },
    },
  },
  plugins: [],
};
export default config;
