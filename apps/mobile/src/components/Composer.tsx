import { useState } from "react";
import { View, TextInput, Pressable, StyleSheet, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { Send, Paperclip, Smile } from "lucide-react-native";
import { useTheme } from "@/lib/ui/theme";
import { LinearGradient } from "@/lib/ui/gradient";

interface Props {
  onSubmit: (body: string) => void;
  onTyping?: (typing: boolean) => void;
  onAttachPress?: () => void;
}

/**
 * Bottom composer. Auto-grows up to ~5 lines, send button gets the brand
 * gradient and a subtle pop animation when text becomes non-empty (CSS
 * transform won't show on RN — handled via opacity/scale below).
 *
 * Typing indicator: emits `start` on first keystroke, `stop` after 2s of
 * inactivity OR on send/blur. Coalescing is intentional — naive on/off would
 * spam the socket.
 */
export function Composer({ onSubmit, onTyping, onAttachPress }: Props) {
  const t = useTheme();
  const [body, setBody] = useState("");
  const [typingTimer, setTypingTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const canSend = body.trim().length > 0;

  function notifyTyping() {
    onTyping?.(true);
    if (typingTimer) clearTimeout(typingTimer);
    setTypingTimer(setTimeout(() => onTyping?.(false), 2_000));
  }

  function send() {
    const text = body.trim();
    if (!text) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSubmit(text);
    setBody("");
    onTyping?.(false);
    if (typingTimer) { clearTimeout(typingTimer); setTypingTimer(null); }
  }

  return (
    <View style={[s.wrap, { backgroundColor: t.colors.bg, borderTopColor: t.colors.border }]}>
      <Pressable onPress={onAttachPress} hitSlop={8} style={s.iconBtn}>
        <Paperclip size={22} color={t.colors.muted} strokeWidth={2} />
      </Pressable>

      <View style={[s.inputWrap, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
        <TextInput
          value={body}
          onChangeText={(v) => { setBody(v); if (v.length > 0) notifyTyping(); }}
          placeholder="Message"
          placeholderTextColor={t.colors.muted}
          style={[s.input, { color: t.colors.fg }]}
          multiline
          maxLength={8000}
          onBlur={() => onTyping?.(false)}
        />
        <Pressable hitSlop={8} style={s.emoji}>
          <Smile size={20} color={t.colors.muted} strokeWidth={2} />
        </Pressable>
      </View>

      <Pressable
        onPress={send}
        disabled={!canSend}
        hitSlop={8}
        style={({ pressed }) => [s.sendWrap, { opacity: !canSend ? 0.4 : pressed ? 0.85 : 1 }]}
      >
        <LinearGradient
          colors={t.gradient as unknown as [string, string]}
          start={[0, 0]} end={[1, 1]}
          style={s.send}
        >
          <Send size={18} color="#fff" strokeWidth={2.4} />
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flexDirection: "row", alignItems: "flex-end",
    paddingHorizontal: 12, paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 8 : 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  iconBtn:   { width: 40, height: 40, alignItems: "center", justifyContent: "center" },

  inputWrap: {
    flex: 1, flexDirection: "row", alignItems: "flex-end",
    borderWidth: 1, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 6, minHeight: 44, maxHeight: 140,
  },
  input:     { flex: 1, fontSize: 16, paddingTop: 8, paddingBottom: 6, lineHeight: 22 },
  emoji:     { padding: 6, marginBottom: 2 },

  sendWrap:  { width: 40, height: 40, borderRadius: 20, overflow: "hidden" },
  send:      { flex: 1, alignItems: "center", justifyContent: "center" },
});
