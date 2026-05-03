import { useColorScheme } from "react-native";
import { tokens } from "@chatrix/ui";

/**
 * Single hook every screen calls. Returns the active palette + a `dark` flag
 * for one-off branching (`dark ? '#fff' : '#000'`). Token names match the web
 * Tailwind theme so cross-platform code stays consistent.
 */
export function useTheme() {
  const scheme = useColorScheme();
  const dark = scheme === "dark";
  const c = dark ? tokens.palette.dark : tokens.palette.light;
  return {
    dark,
    colors: c,
    radius: tokens.radius,
    space: tokens.space,
    motion: tokens.motion,
    gradient: dark ? tokens.brandGradient.dark : tokens.brandGradient.light,
  };
}

export type Theme = ReturnType<typeof useTheme>;
