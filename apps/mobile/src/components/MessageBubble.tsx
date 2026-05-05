import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, Linking } from "react-native";
import { Image } from "expo-image";
import { Audio, Video, ResizeMode } from "expo-av";
import { Check, CheckCheck, FileText, Download, Play, Pause } from "lucide-react-native";
import { useTheme } from "@/lib/ui/theme";
import { LinearGradient } from "@/lib/ui/gradient";
import { formatRelativeTime } from "@/lib/format";
import type { Message, MessageAttachment } from "@chatrix/shared/types";

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
  const isVideo = message.kind === "video";
  const isAudio = message.kind === "audio";
  const isFile  = message.kind === "file";
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
        ) : isVideo && firstAttachment ? (
          <VideoBubble att={firstAttachment} caption={message.body} bubbleStyle={bubbleStyle} mine={mine} />
        ) : isAudio && firstAttachment ? (
          <AudioBubble att={firstAttachment} caption={message.body} bubbleStyle={bubbleStyle} mine={mine} />
        ) : isFile && firstAttachment ? (
          <FileBubble att={firstAttachment} caption={message.body} bubbleStyle={bubbleStyle} mine={mine} />
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

/**
 * Video — expo-av <Video> with native controls. We don't autoplay.
 */
function VideoBubble({
  att, caption, bubbleStyle, mine,
}: {
  att: MessageAttachment;
  caption: string | null;
  bubbleStyle: any;
  mine: boolean;
}) {
  const t = useTheme();
  const aspect = att.width && att.height ? att.width / att.height : 16 / 9;
  const w = 240;
  const h = w / Math.max(0.4, Math.min(2.4, aspect));
  return (
    <View style={[bubbleStyle, { overflow: "hidden", maxWidth: w + 24 }]}>
      <Video
        source={{ uri: att.url }}
        style={{ width: w, height: h, backgroundColor: "#000" }}
        useNativeControls
        resizeMode={ResizeMode.CONTAIN}
      />
      {!!caption && (
        <View style={[s.captionPad, mine ? { backgroundColor: "rgba(99,74,246,0.95)" } : { backgroundColor: t.colors.elevated }]}>
          <BodyText body={caption} mine={mine} />
        </View>
      )}
    </View>
  );
}

/**
 * Voice-note bubble — play/pause icon + duration + progress bar. We use
 * expo-av's Audio.Sound directly so the playback runs on the same audio
 * session as recordings, and tearing down is clean (avoids the dreaded
 * "audio focus lost" iOS bug if the user backgrounds the app mid-listen).
 */
function AudioBubble({
  att, caption, bubbleStyle, mine,
}: {
  att: MessageAttachment;
  caption: string | null;
  bubbleStyle: any;
  mine: boolean;
}) {
  const t = useTheme();
  const soundRef = useRef<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(att.durationMs ?? 0);

  useEffect(() => () => {
    soundRef.current?.unloadAsync().catch(() => {});
    soundRef.current = null;
  }, []);

  async function toggle() {
    if (!soundRef.current) {
      try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const { sound } = await Audio.Sound.createAsync(
          { uri: att.url },
          { shouldPlay: true },
          (status) => {
            if (!status.isLoaded) return;
            setPlaying(status.isPlaying);
            setPos(status.positionMillis);
            if (status.durationMillis && !dur) setDur(status.durationMillis);
            if (status.didJustFinish) {
              setPlaying(false);
              setPos(0);
              sound.setPositionAsync(0).catch(() => {});
            }
          },
        );
        soundRef.current = sound;
      } catch (err) {
        console.warn("audio playback failed", err);
      }
      return;
    }
    if (playing) await soundRef.current.pauseAsync();
    else await soundRef.current.playAsync();
  }

  const pct = dur > 0 ? Math.min(1, pos / dur) : 0;
  const remaining = dur > 0 ? Math.max(0, dur - pos) : 0;
  const baseStyle = mine
    ? { backgroundColor: "rgba(99,74,246,0.95)" }
    : { backgroundColor: t.colors.elevated, borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border };

  return (
    <View style={[bubbleStyle, baseStyle, { overflow: "hidden", minWidth: 220 }]}>
      <View style={s.audioRow}>
        <Pressable onPress={toggle} hitSlop={8} style={[
          s.audioBtn,
          { backgroundColor: mine ? "rgba(255,255,255,0.22)" : t.colors.primary + "26" },
        ]}>
          {playing
            ? <Pause size={16} color={mine ? "#fff" : t.colors.primary} fill={mine ? "#fff" : t.colors.primary} />
            : <Play  size={16} color={mine ? "#fff" : t.colors.primary} fill={mine ? "#fff" : t.colors.primary} />}
        </Pressable>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={[s.audioTrack, { backgroundColor: mine ? "rgba(255,255,255,0.25)" : t.colors.border }]}>
            <View style={[s.audioFill, { width: `${pct * 100}%`, backgroundColor: mine ? "#fff" : t.colors.primary }]} />
          </View>
          <Text style={[s.audioMeta, { color: mine ? "rgba(255,255,255,0.8)" : t.colors.muted }]}>
            {fmtSec(Math.round((playing ? remaining : dur) / 1000))}
          </Text>
        </View>
      </View>
      {!!caption && (
        <View style={[s.captionPad, mine ? null : { backgroundColor: t.colors.elevated }]}>
          <BodyText body={caption} mine={mine} />
        </View>
      )}
    </View>
  );
}

/**
 * Generic file — icon + name + size + tap-to-open via OS handler. We let
 * the OS pick the right viewer (PDF in Files, docx in Word/QuickLook, etc).
 */
function FileBubble({
  att, caption, bubbleStyle, mine,
}: {
  att: MessageAttachment;
  caption: string | null;
  bubbleStyle: any;
  mine: boolean;
}) {
  const t = useTheme();
  const baseStyle = mine
    ? { backgroundColor: "rgba(99,74,246,0.95)" }
    : { backgroundColor: t.colors.elevated, borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border };

  const name = (() => {
    try {
      const u = new URL(att.url);
      const last = u.pathname.split("/").filter(Boolean).pop() ?? "file";
      if (/^[0-9a-f-]{36}$/i.test(last)) return mimeLabel(att.mimeType);
      return decodeURIComponent(last);
    } catch {
      return mimeLabel(att.mimeType);
    }
  })();

  return (
    <View style={[bubbleStyle, baseStyle, { overflow: "hidden", minWidth: 220 }]}>
      <Pressable
        onPress={() => Linking.openURL(att.url).catch(() => {})}
        style={s.fileRow}
      >
        <View style={[
          s.fileIcon,
          { backgroundColor: mine ? "rgba(255,255,255,0.22)" : t.colors.primary + "26" },
        ]}>
          <FileText size={18} color={mine ? "#fff" : t.colors.primary} strokeWidth={2} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.fileName, { color: mine ? "#fff" : t.colors.fg }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[s.fileMeta, { color: mine ? "rgba(255,255,255,0.75)" : t.colors.muted }]}>
            {fmtBytes(att.sizeBytes)} · {mimeLabel(att.mimeType)}
          </Text>
        </View>
        <View style={[
          s.dlIcon,
          { backgroundColor: mine ? "rgba(255,255,255,0.18)" : t.colors.surface },
        ]}>
          <Download size={14} color={mine ? "#fff" : t.colors.muted} strokeWidth={2} />
        </View>
      </Pressable>
      {!!caption && (
        <View style={[s.captionPad, mine ? null : { backgroundColor: t.colors.elevated }]}>
          <BodyText body={caption} mine={mine} />
        </View>
      )}
    </View>
  );
}

// ---------- Local helpers ----------

function fmtSec(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function mimeLabel(mime: string): string {
  switch (mime) {
    case "application/pdf": return "PDF";
    case "application/msword":
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return "Word doc";
    case "application/vnd.ms-excel":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return "Spreadsheet";
    case "application/vnd.ms-powerpoint":
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return "Presentation";
    case "text/plain":   return "Text";
    case "text/csv":     return "CSV";
    case "text/markdown":return "Markdown";
    case "application/json": return "JSON";
    case "application/zip":
    case "application/x-zip-compressed": return "ZIP archive";
    case "application/vnd.rar":
    case "application/x-rar-compressed": return "RAR archive";
    case "application/x-7z-compressed":  return "7z archive";
    case "application/x-tar":            return "TAR archive";
    case "application/gzip":             return "gzip archive";
    default: return mime || "File";
  }
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

  // Audio bubble
  audioRow:    { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 10 },
  audioBtn:    { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  audioTrack:  { height: 4, borderRadius: 2, overflow: "hidden" },
  audioFill:   { height: "100%", borderRadius: 2 },
  audioMeta:   { fontSize: 11, fontVariant: ["tabular-nums"] },

  // File bubble
  fileRow:     { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 10 },
  fileIcon:    { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  fileName:    { fontSize: 14, fontWeight: "600" },
  fileMeta:    { fontSize: 11, marginTop: 2 },
  dlIcon:      { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
});
