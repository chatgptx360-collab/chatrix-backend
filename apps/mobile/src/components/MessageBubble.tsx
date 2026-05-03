import { View, Text, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { Check, CheckCheck } from "lucide-react-native";
import { useTheme } from "@/lib/ui/theme";
import { LinearGradient } from "@/lib/ui/gradient";
import { formatRelativeTime } from "@/lib/format";
import type { Message } from "@chatrix/shared/types";

interface Props {
  message: Message;
  /** True when the viewer sent this — flips alignment + colors. */
  mine: boolean;
  /** True when previous message in the list is from the same sender (no avatar/timestamp). */
  groupedWithPrev: boolean;
  /** True when next message in the list is from the same sender (round bottom corner). */
  groupedWithNext: boolean;
  onLongPress?: () => void;
}

/**
 * Message bubble. Three visual states:
 *   - text         — gradient or surface bubble with body
 *   - image / gif  — bordered image, optional caption below
 *   - other media  — generic chip with icon + filename (Phase 4.5 expansion)
 *
 * "Mine" bubbles get the brand gradient; "theirs" use the surface color
 * with a subtle border. Bubble corners flatten when grouped with neighbors,
 * which is the visual cue iMessage / Telegram both use to show grouping.
 */
export function MessageBubble({ message, mine, groupedWithPrev, groupedWithNext, onLongPress }: Props) {
  const t = useTheme();
  const showTimestamp = !groupedWithPrev;

  const radius = {
    topLeft:    mine ? 18 : (groupedWithPrev ? 6 : 18),
    topRight:   mine ? (groupedWithPrev ? 6 : 18) : 18,
    bottomLeft: mine ? 18 : (groupedWithNext ? 6 : 18),
    bottomRight: mine ? (groupedWithNext ? 6 : 18) : 18,
  };

  const bubbleStyle = {
    borderTopLeftRadius:     radius.topLeft,
    borderTopRightRadius:    radius.topRight,
    borderBottomLeftRadius:  radius.bottomLeft,
    borderBottomRightRadius: radius.bottomRight,
  };

  const isImage = message.kind === "image" || message.kind === "gif";
  const isDeleted = !!message.deletedAt;
  const firstAttachment = message.attachments[0];

  return (
    <View style={[s.row, mine ? s.rowMine : s.rowTheirs, { marginTop: groupedWithPrev ? 2 : 10 }]}>
      <Pressable
        onLongPress={onLongPress}
        delayLongPress={250}
        style={[s.wrap, isImage && firstAttachment && !isDeleted ? { padding: 0, overflow: "hidden" } : null]}
      >
        {isDeleted ? (
          <View style={[
            s.bubble, bubbleStyle,
            { backgroundColor: "transparent", borderWidth: 1, borderColor: t.colors.border, borderStyle: "dashed" },
          ]}>
            <Text style={[s.deletedText, { color: t.colors.muted }]}>
              {mine ? "You deleted this message" : "Message deleted"}
            </Text>
          </View>
        ) : isImage && firstAttachment ? (
          <ImageBubble att={firstAttachment} caption={message.body} bubbleStyle={bubbleStyle} mine={mine} />
        ) : mine ? (
          <LinearGradient
            colors={t.gradient as unknown as [string, string]}
            start={[0, 0]} end={[1, 1]}
            style={[s.bubble, bubbleStyle]}
          >
            <BodyText body={message.body} mine />
          </LinearGradient>
        ) : (
          <View style={[
            s.bubble,
            bubbleStyle,
            { backgroundColor: t.colors.elevated, borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border },
          ]}>
            <BodyText body={message.body} mine={false} />
          </View>
        )}
      </Pressable>

      {showTimestamp && (
        <View style={[s.metaRow, mine ? { justifyContent: "flex-end" } : null]}>
          <Text style={[s.meta, { color: t.colors.muted }]}>
            {formatRelativeTime(message.createdAt)}
          </Text>
          {message.editedAt && (
            <Text style={[s.meta, { color: t.colors.muted, marginLeft: 6 }]}>· edited</Text>
          )}
          {mine && !isDeleted && (
            <ReceiptIcon state={message.state} color={t.colors.muted} accent={t.colors.primary} />
          )}
        </View>
      )}

      {message.reactions.length > 0 && !isDeleted && (
        <View style={[s.reactionsRow, mine ? { justifyContent: "flex-end" } : null]}>
          {message.reactions.map((r) => (
            <View key={r.emoji} style={[s.reactionChip, { backgroundColor: t.colors.elevated, borderColor: t.colors.border }]}>
              <Text style={s.reactionEmoji}>{r.emoji}</Text>
              {r.count > 1 && (
                <Text style={[s.reactionCount, { color: t.colors.muted }]}>{r.count}</Text>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function BodyText({ body, mine }: { body: string | null; mine: boolean }) {
  const t = useTheme();
  return (
    <Text style={[
      s.body,
      { color: mine ? "#fff" : t.colors.fg },
    ]}>{body ?? ""}</Text>
  );
}

function ImageBubble({
  att, caption, bubbleStyle, mine,
}: {
  att: NonNullable<Message["attachments"][number]>;
  caption: string | null;
  bubbleStyle: any;
  mine: boolean;
}) {
  const t = useTheme();
  const aspect = att.width && att.height ? att.width / att.height : 1;
  const targetWidth = 240;
  return (
    <View style={[bubbleStyle, { overflow: "hidden", maxWidth: targetWidth + 24 }]}>
      <Image
        source={{ uri: att.url }}
        style={{ width: targetWidth, height: targetWidth / Math.max(0.4, Math.min(2, aspect)) }}
        contentFit="cover"
        transition={120}
        placeholder={att.blurhash ?? undefined}
      />
      {!!caption && (
        <View style={[s.captionPad, mine ? { backgroundColor: "rgba(99,74,246,0.95)" } : { backgroundColor: t.colors.elevated }]}>
          <BodyText body={caption} mine={mine} />
        </View>
      )}
    </View>
  );
}

function ReceiptIcon({ state, color, accent }: { state?: Message["state"]; color: string; accent: string }) {
  if (state === "read")      return <CheckCheck size={14} color={accent} style={{ marginLeft: 6 }} />;
  if (state === "delivered") return <CheckCheck size={14} color={color}  style={{ marginLeft: 6 }} />;
  return <Check size={14} color={color} style={{ marginLeft: 6 }} />;
}

const s = StyleSheet.create({
  row:        { paddingHorizontal: 14, marginVertical: 1 },
  rowMine:    { alignItems: "flex-end" },
  rowTheirs:  { alignItems: "flex-start" },

  wrap:       { maxWidth: "82%" },
  bubble:     { paddingHorizontal: 14, paddingVertical: 10 },
  body:       { fontSize: 16, lineHeight: 22 },
  deletedText: { fontSize: 14, fontStyle: "italic" },

  captionPad: { paddingHorizontal: 12, paddingVertical: 8 },

  metaRow:    { flexDirection: "row", marginTop: 4, alignItems: "center", paddingHorizontal: 4 },
  meta:       { fontSize: 11 },

  reactionsRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 4, gap: 4, paddingHorizontal: 4 },
  reactionChip: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { fontSize: 11, fontWeight: "600", marginLeft: 4 },
});
