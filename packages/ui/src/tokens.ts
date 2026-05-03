/**
 * Design tokens shared by web (Tailwind theme) and mobile (StyleSheet).
 * The web theme aliases these via CSS variables; mobile imports them directly.
 *
 * Single source of truth — change a hex here and it propagates everywhere.
 */

export const palette = {
  light: {
    bg:        "#FAFAFC",
    surface:   "#FFFFFF",
    elevated:  "#FFFFFF",
    border:    "#E4E6EC",
    fg:        "#11131F",
    muted:     "#6D7184",
    primary:   "#634AF6",
    primaryFg: "#FFFFFF",
    accent:    "#0ED3FF",
    success:   "#22C55E",
    danger:    "#EF4444",
  },
  dark: {
    bg:        "#09090F",
    surface:   "#10121E",
    elevated:  "#16192A",
    border:    "#22263A",
    fg:        "#F0F2FC",
    muted:     "#94A0AE",
    primary:   "#8B79FF",
    primaryFg: "#FFFFFF",
    accent:    "#48E0FF",
    success:   "#22C55E",
    danger:    "#EF4444",
  },
} as const;

export type ColorScheme = keyof typeof palette;
export type SemanticColor = keyof (typeof palette)["light"];

export const radius = {
  sm: 8, md: 14, lg: 20, xl: 28, full: 9999,
} as const;

export const space = {
  px:  1, "0.5": 2, "1": 4, "2": 8, "3": 12, "4": 16, "5": 20, "6": 24, "8": 32, "10": 40, "12": 48,
} as const;

export const motion = {
  // Animation curves matched to iMessage / Telegram feel.
  bubble: { stiffness: 380, damping: 32, mass: 0.7 },
  fade:   { duration: 200 },
  slide:  { duration: 280 },
} as const;

export const brandGradient = {
  light: ["#634AF6", "#0ED3FF"] as const,
  dark:  ["#8B79FF", "#48E0FF"] as const,
};
