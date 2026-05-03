import { Pressable, Text, View, ActivityIndicator, StyleSheet, type PressableProps } from "react-native";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "../lib/ui/gradient";
import { useTheme } from "../lib/ui/theme";

interface Props extends Omit<PressableProps, "children"> {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
}

/**
 * The single button primitive used across the app. Variants:
 *   primary   — brand gradient, white text. The default CTA.
 *   secondary — surface bg, border, fg text. Used alongside a primary.
 *   ghost     — no bg, fg text. Cancel / dismiss.
 *   danger    — red bg, used in destructive flows (delete, sign out).
 *
 * Light haptic on every press to make the app feel tactile.
 */
export function Button({
  label, onPress, variant = "primary", loading, fullWidth = true, icon, disabled, ...rest
}: Props) {
  const t = useTheme();
  const isPrimary = variant === "primary";

  const tap = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.();
  };

  const inner = (
    <View style={s.row}>
      {loading
        ? <ActivityIndicator color={isPrimary ? "#fff" : t.colors.fg} size="small" />
        : (
          <>
            {icon}
            <Text style={[
              s.label,
              { color: textColor(variant, t.colors) },
              icon ? { marginLeft: 8 } : null,
            ]}>{label}</Text>
          </>
        )
      }
    </View>
  );

  return (
    <Pressable
      onPress={tap}
      disabled={loading || disabled}
      hitSlop={8}
      style={({ pressed }) => [
        s.base,
        fullWidth && { alignSelf: "stretch" },
        { opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        // Non-gradient backgrounds are applied here; gradient handled below.
        variant === "secondary" && { backgroundColor: t.colors.surface, borderWidth: 1, borderColor: t.colors.border },
        variant === "ghost"     && { backgroundColor: "transparent" },
        variant === "danger"    && { backgroundColor: t.colors.danger },
      ]}
      {...rest}
    >
      {isPrimary ? (
        <LinearGradient colors={t.gradient as unknown as [string, string]} start={[0, 0]} end={[1, 1]} style={s.gradient}>
          {inner}
        </LinearGradient>
      ) : inner}
    </Pressable>
  );
}

function textColor(variant: Props["variant"], c: ReturnType<typeof useTheme>["colors"]) {
  if (variant === "primary" || variant === "danger") return "#fff";
  return c.fg;
}

const s = StyleSheet.create({
  base: { borderRadius: 999, overflow: "hidden" },
  gradient: { paddingVertical: 16, paddingHorizontal: 22, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  label: { fontSize: 16, fontWeight: "600", letterSpacing: -0.1 },
});
