import { Modal, Pressable, View, Text, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { Reply, Trash2 } from "lucide-react-native";
import { QUICK_REACTIONS } from "@chatrix/shared/reactions";
import { useTheme } from "@/lib/ui/theme";

interface Props {
  visible: boolean;
  /** Show the "Delete for everyone" action — mine messages only. */
  canDelete?: boolean;
  onPick: (emoji: string) => void;
  onReply?: () => void;
  onDelete?: () => void;
  onClose: () => void;
}

/**
 * Bottom-sheet message-context menu. Quick reactions on top, then secondary
 * actions (Reply, Delete) underneath. Tapping anywhere outside dismisses.
 *
 * The full emoji picker is queued for Phase 8 — covers ~10% of usage.
 */
export function ReactionsSheet({ visible, canDelete, onPick, onReply, onDelete, onClose }: Props) {
  const t = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable onPress={onClose} style={s.backdrop}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[s.sheet, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}
        >
          <View style={[s.handle, { backgroundColor: t.colors.border }]} />
          <Text style={[s.title, { color: t.colors.muted }]}>Quick reactions</Text>
          <View style={s.row}>
            {QUICK_REACTIONS.map((emoji) => (
              <Pressable
                key={emoji}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onPick(emoji);
                }}
                style={({ pressed }) => [
                  s.cell,
                  { backgroundColor: pressed ? t.colors.elevated : "transparent" },
                ]}
              >
                <Text style={s.emoji}>{emoji}</Text>
              </Pressable>
            ))}
          </View>

          {(onReply || (canDelete && onDelete)) && (
            <View style={[s.actions, { borderTopColor: t.colors.border }]}>
              {onReply && (
                <Pressable
                  onPress={() => { Haptics.selectionAsync(); onReply(); }}
                  style={({ pressed }) => [
                    s.action,
                    { backgroundColor: pressed ? t.colors.elevated : "transparent" },
                  ]}
                >
                  <Reply size={18} color={t.colors.fg} />
                  <Text style={[s.actionLabel, { color: t.colors.fg }]}>Reply</Text>
                </Pressable>
              )}
              {canDelete && onDelete && (
                <Pressable
                  onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); onDelete(); }}
                  style={({ pressed }) => [
                    s.action,
                    { backgroundColor: pressed ? t.colors.elevated : "transparent" },
                  ]}
                >
                  <Trash2 size={18} color={t.colors.danger} />
                  <Text style={[s.actionLabel, { color: t.colors.danger }]}>Delete for everyone</Text>
                </Pressable>
              )}
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1, justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    paddingTop: 8,
    paddingBottom: 28,
    paddingHorizontal: 16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  handle:  { alignSelf: "center", width: 44, height: 4, borderRadius: 2, marginBottom: 12 },
  title:   { fontSize: 12, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 },
  row:     { flexDirection: "row", justifyContent: "space-around" },
  cell:    { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  emoji:   { fontSize: 30 },
  actions: { marginTop: 14, paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth },
  action:  { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 12 },
  actionLabel: { fontSize: 15, fontWeight: "600" },
});
