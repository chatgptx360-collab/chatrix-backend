import { View, StyleSheet, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../lib/ui/theme";

interface Props {
  children: React.ReactNode;
  /** Off when the screen sets its own background (e.g. a hero with a gradient). */
  bg?: boolean;
  /** Edges to apply safe-area insets to. Defaults to top + bottom. */
  edges?: ("top" | "bottom" | "left" | "right")[];
  padded?: boolean;
  style?: ViewStyle;
}

/**
 * Every screen wraps its content in <Screen>. Centralises:
 *   - safe-area insets
 *   - the brand background color (so dark/light feels coherent)
 *   - default 20px horizontal padding (opt out for full-bleed)
 */
export function Screen({ children, bg = true, edges = ["top", "bottom"], padded, style }: Props) {
  const t = useTheme();
  const Wrapper: any = SafeAreaView;
  return (
    <Wrapper
      edges={edges}
      style={[
        s.base,
        bg ? { backgroundColor: t.colors.bg } : null,
        padded ? { paddingHorizontal: 20 } : null,
        style,
      ]}
    >
      {children}
    </Wrapper>
  );
}

const s = StyleSheet.create({ base: { flex: 1 } });
