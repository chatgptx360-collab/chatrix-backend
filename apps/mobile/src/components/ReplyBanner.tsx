import { View, Text, Pressable, StyleSheet } from "react-native";
import { Reply, X } from "lucide-react-native";
import { useTheme } from "@/lib/ui/theme";
import { kindLabel } from "@/lib/format";
import { LinearGradient } from "@/lib/ui/gradient";
import type { Message } from "@chatrix/shared/types";

interface Props {
  target: Pick<Message, "id" | "senderId" | "body" | "kind">;
  authorLabel: string;
  onCancel: () => void;
}

/**
 * Reply banner for mobile — sits above the Composer. Same pattern as the
 * web version: gradient strip on the side, author tag + body preview.
 */
export function ReplyBanner({ target, authorLabel, onCancel }: Props) {
  const t = useTheme();
  const preview = target.kind === "text"
    ? (target.body ?? "(empty)")
    : (kindLabel(target.kind) || "Message");

  return (
    <View style={s.wrap}>
      <View
        style={[s.row, { backgroundColor: t.colors.elevated, borderColor: t.colors.border }]}
      >
        <LinearGradient
          colors={t.gradient as unknown as [string, string]}
          start={[0, 0]} end={[1, 1]}
          style={s.bar}
        />
        <View style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Reply size={11} color={t.colors.primary} />
            <Text style={[s.label, { color: t.colors.primary }]}>
              Replying to {authorLabel}
            </Text>
          </View>
          <Text numberOfLines={1} style={[s.preview, { color: t.colors.fg }]}>
            {preview}
          </Text>
        </View>
        <Pressable onPress={onCancel} hitSlop={8} style={[s.close, { backgroundColor: "transparent" }]}>
          <X size={14} color={t.colors.muted} />
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingTop: 8 },
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  bar: { width: 4 },
  label: { fontSize: 11, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
  preview: { fontSize: 13, marginTop: 2 },
  close: {
    width: 36, alignItems: "center", justifyContent: "center",
  },
});
