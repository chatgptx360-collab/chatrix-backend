import { useState, forwardRef } from "react";
import { TextInput, View, Text, StyleSheet, type TextInputProps } from "react-native";
import { useTheme } from "../lib/ui/theme";

interface Props extends Omit<TextInputProps, "style"> {
  label?: string;
  error?: string | null;
  /** Render an icon or '@' prefix inside the field. */
  leading?: React.ReactNode;
  /** Right-side icon — useful for password show/hide buttons. */
  trailing?: React.ReactNode;
}

/**
 * Form input with floating-style label, focus ring, and error message slot.
 * Uses brand colors via the theme hook so dark mode is automatic.
 */
export const Input = forwardRef<TextInput, Props>(function Input(
  { label, error, leading, trailing, ...rest }, ref,
) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  const ringColor = error ? t.colors.danger : focused ? t.colors.primary : t.colors.border;

  return (
    <View style={{ marginBottom: 14 }}>
      {label && (
        <Text style={[s.label, { color: t.colors.muted }]}>
          {label}
        </Text>
      )}
      <View style={[
        s.field,
        { backgroundColor: t.colors.surface, borderColor: ringColor },
        focused && !error ? { shadowColor: t.colors.primary, shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } } : null,
      ]}>
        {leading && <View style={s.adornLeading}>{leading}</View>}
        <TextInput
          ref={ref}
          placeholderTextColor={t.colors.muted}
          selectionColor={t.colors.primary}
          autoCapitalize="none"
          autoCorrect={false}
          {...rest}
          onFocus={(e) => { setFocused(true); rest.onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); rest.onBlur?.(e); }}
          style={[s.input, { color: t.colors.fg }]}
        />
        {trailing && <View style={s.adornTrailing}>{trailing}</View>}
      </View>
      {!!error && <Text style={[s.error, { color: t.colors.danger }]}>{error}</Text>}
    </View>
  );
});

const s = StyleSheet.create({
  label: { fontSize: 12, fontWeight: "600", marginBottom: 6, letterSpacing: 0.2, textTransform: "uppercase" },
  field: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  input: { flex: 1, fontSize: 16, paddingVertical: 12 },
  adornLeading:  { marginRight: 8 },
  adornTrailing: { marginLeft: 8 },
  error: { marginTop: 6, fontSize: 13 },
});
