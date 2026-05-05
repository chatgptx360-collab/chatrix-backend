import { useEffect, useRef, useState, useCallback } from "react";
import {
  View, TextInput, Pressable, StyleSheet, Platform, Text,
  Image as RNImage, ActivityIndicator, ScrollView, Modal,
} from "react-native";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { Audio } from "expo-av";
import { Send, Paperclip, Smile, Mic, Square, X, FileText, ImageIcon } from "lucide-react-native";
import { useTheme } from "@/lib/ui/theme";
import { LinearGradient } from "@/lib/ui/gradient";
import { uploadAsset } from "@/lib/upload";
import {
  MEDIA_MAX_BYTES,
  VOICE_NOTE_MAX_DURATION_MS,
} from "@chatrix/shared/constants";
import type { MediaKind } from "@chatrix/shared/types";

interface Props {
  onSubmit: (
    body: string,
    attachmentIds?: string[],
    kind?: "text" | "audio" | "image" | "video" | "file" | "gif",
  ) => void;
  onTyping?: (typing: boolean) => void;
  /** Kept for back-compat — opens the same picker the paperclip does. */
  onAttachPress?: () => void;
}

/**
 * Bottom composer (mobile).
 *
 * Mirrors the web Composer feature-for-feature:
 *   - Paperclip → modal sheet with "Photos & videos" / "Document"
 *   - Mic → tap-to-toggle voice recording (expo-av Audio.Recording)
 *   - Pending attachment rail above the input with kind-specific previews
 *   - Send button only enabled when text OR every attachment finished uploading
 *
 * Voice notes are recorded as m4a (AAC) via expo-av's HIGH_QUALITY preset —
 * matches the server's audio allow-list. We hard-cap recordings at
 * VOICE_NOTE_MAX_DURATION_MS so a forgotten recorder doesn't generate
 * a multi-minute file.
 */

interface PendingAttachment {
  id: string;
  uri: string;
  name: string;
  mimeType: string;
  size: number;
  kind: MediaKind;
  pct: number;
  status: "uploading" | "ready" | "error";
  mediaId?: string;
  error?: string;
  width?: number;
  height?: number;
  durationMs?: number;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function Composer({ onSubmit, onTyping }: Props) {
  const t = useTheme();
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [typingTimer, setTypingTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  // Voice recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordSec, setRecordSec] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordStart = useRef<number>(0);
  const recordTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasPending = attachments.some((a) => a.status === "uploading");
  const canSend =
    !hasPending &&
    (body.trim().length > 0 || attachments.some((a) => a.status === "ready"));

  function notifyTyping() {
    onTyping?.(true);
    if (typingTimer) clearTimeout(typingTimer);
    setTypingTimer(setTimeout(() => onTyping?.(false), 2_000));
  }

  function send() {
    const text = body.trim();
    if (!canSend) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const ready = attachments.filter((a) => a.status === "ready" && a.mediaId);
    const ids = ready.map((a) => a.mediaId!);
    let kind: Parameters<typeof onSubmit>[2] = undefined;
    if (ready.length > 0) {
      const first = ready[0]!.kind;
      const allSame = ready.every((a) => a.kind === first);
      kind = (allSame ? first : "file") as Parameters<typeof onSubmit>[2];
    }
    onSubmit(text, ids.length ? ids : undefined, kind);
    setBody("");
    setAttachments([]);
    onTyping?.(false);
    if (typingTimer) { clearTimeout(typingTimer); setTypingTimer(null); }
  }

  // ---------- Pickers ----------

  const startUpload = useCallback(async (asset: {
    uri: string; name: string; mimeType: string; size: number;
    kind: MediaKind; width?: number; height?: number; durationMs?: number;
  }) => {
    if (asset.size > MEDIA_MAX_BYTES[asset.kind]) {
      const localId = `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      setAttachments((list) => [...list, {
        id: localId, ...asset,
        pct: 0, status: "error",
        error: `Too large for ${asset.kind} (max ${Math.round(MEDIA_MAX_BYTES[asset.kind] / 1024 / 1024)} MB)`,
      }]);
      return;
    }
    const localId = `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setAttachments((list) => [...list, { id: localId, ...asset, pct: 0, status: "uploading" }]);
    try {
      const media = await uploadAsset(
        {
          uri: asset.uri,
          mimeType: asset.mimeType,
          width: asset.width,
          height: asset.height,
          fileSize: asset.size,
          durationMs: asset.durationMs,
        },
        {
          kind: asset.kind,
          onProgress: (pct) => setAttachments((list) =>
            list.map((a) => a.id === localId ? { ...a, pct } : a)
          ),
        },
      );
      setAttachments((list) =>
        list.map((a) => a.id === localId ? { ...a, mediaId: media.id, status: "ready", pct: 1 } : a)
      );
    } catch (err) {
      setAttachments((list) =>
        list.map((a) => a.id === localId
          ? { ...a, status: "error", error: (err as Error).message ?? "Upload failed" }
          : a),
      );
    }
  }, []);

  function removeAttachment(id: string) {
    setAttachments((list) => list.filter((a) => a.id !== id));
  }

  async function pickMedia() {
    setPickerOpen(false);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      quality: 0.85,
    });
    if (r.canceled) return;
    for (const a of r.assets) {
      const isVideo = a.type === "video";
      const mime = a.mimeType ?? (isVideo ? "video/mp4" : "image/jpeg");
      const kind: MediaKind = isVideo
        ? "video"
        : (mime === "image/gif" ? "gif" : "image");
      await startUpload({
        uri: a.uri,
        name: a.fileName ?? `attachment.${isVideo ? "mp4" : "jpg"}`,
        mimeType: mime,
        size: a.fileSize ?? 0,
        kind,
        width: a.width ?? undefined,
        height: a.height ?? undefined,
        durationMs: isVideo ? (a.duration ?? undefined) : undefined,
      });
    }
  }

  async function pickDocument() {
    setPickerOpen(false);
    const r = await DocumentPicker.getDocumentAsync({
      type: [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "text/plain",
        "text/csv",
        "text/markdown",
        "application/json",
        "application/zip",
        "application/x-zip-compressed",
        "application/vnd.rar",
        "application/x-rar-compressed",
        "application/x-7z-compressed",
        "application/x-tar",
        "application/gzip",
      ],
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (r.canceled) return;
    for (const a of r.assets) {
      await startUpload({
        uri: a.uri,
        name: a.name,
        mimeType: a.mimeType ?? "application/octet-stream",
        size: a.size ?? 0,
        kind: "file",
      });
    }
  }

  // ---------- Voice recording ----------

  async function startRecording() {
    if (isRecording) return;
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) return;
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const recording = new Audio.Recording();
      // High-quality preset → m4a/AAC on both platforms, which matches the
      // server's audio/mp4 allow-list entry.
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;
      recordStart.current = Date.now();
      setIsRecording(true);
      setRecordSec(0);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      recordTimer.current = setInterval(() => {
        const elapsed = Date.now() - recordStart.current;
        setRecordSec(Math.floor(elapsed / 1000));
        if (elapsed >= VOICE_NOTE_MAX_DURATION_MS) {
          stopRecording();
        }
      }, 250);
    } catch (err) {
      console.warn("startRecording failed", err);
    }
  }

  async function stopRecording() {
    const r = recordingRef.current;
    if (!r) return;
    try {
      await r.stopAndUnloadAsync();
      const elapsed = Date.now() - recordStart.current;
      const uri = r.getURI();
      recordingRef.current = null;
      if (recordTimer.current) clearInterval(recordTimer.current);
      recordTimer.current = null;
      setIsRecording(false);
      setRecordSec(0);
      // Discard ultra-short presses (<300 ms) — accidental.
      if (!uri || elapsed < 300) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      // Determine the file size so /init validation passes.
      const blob = await (await fetch(uri)).blob();
      await startUpload({
        uri,
        name: `voice-${Date.now()}.m4a`,
        mimeType: "audio/mp4",
        size: blob.size,
        kind: "audio",
        durationMs: elapsed,
      });
    } catch (err) {
      console.warn("stopRecording failed", err);
      recordingRef.current = null;
      setIsRecording(false);
      setRecordSec(0);
    }
  }

  async function cancelRecording() {
    const r = recordingRef.current;
    if (!r) return;
    try { await r.stopAndUnloadAsync(); } catch { /* ignore */ }
    recordingRef.current = null;
    if (recordTimer.current) clearInterval(recordTimer.current);
    recordTimer.current = null;
    setIsRecording(false);
    setRecordSec(0);
  }

  // Cleanup
  useEffect(() => () => {
    if (recordingRef.current) {
      recordingRef.current.stopAndUnloadAsync().catch(() => {});
    }
    if (recordTimer.current) clearInterval(recordTimer.current);
  }, []);

  return (
    <View>
      {/* Pending attachments rail */}
      {attachments.length > 0 && (
        <View style={[s.attRail, { backgroundColor: t.colors.bg, borderTopColor: t.colors.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}>
            {attachments.map((a) => (
              <AttachmentChip key={a.id} a={a} onRemove={() => removeAttachment(a.id)} />
            ))}
          </ScrollView>
        </View>
      )}

      {/* Recording bar */}
      {isRecording && (
        <View style={[s.recBar, { backgroundColor: t.colors.elevated, borderTopColor: t.colors.border }]}>
          <View style={[s.recDot, { backgroundColor: t.colors.danger ?? "#ef4444" }]} />
          <Text style={[s.recText, { color: t.colors.fg }]}>
            Recording  ·  {fmtDuration(recordSec * 1000)}
          </Text>
          <View style={{ flex: 1 }} />
          <Pressable onPress={cancelRecording} hitSlop={6} style={s.recBtn}>
            <Text style={{ color: t.colors.muted, fontSize: 13, fontWeight: "500" }}>Cancel</Text>
          </Pressable>
          <Pressable onPress={stopRecording} hitSlop={6} style={s.recBtn}>
            <Text style={{ color: t.colors.primary, fontSize: 13, fontWeight: "600" }}>Stop</Text>
          </Pressable>
        </View>
      )}

      <View style={[s.wrap, { backgroundColor: t.colors.bg, borderTopColor: t.colors.border }]}>
        <Pressable onPress={() => setPickerOpen(true)} hitSlop={8} style={s.iconBtn} disabled={isRecording}>
          <Paperclip size={22} color={isRecording ? t.colors.muted : t.colors.muted} strokeWidth={2} />
        </Pressable>

        <Pressable
          onPress={() => isRecording ? stopRecording() : startRecording()}
          hitSlop={8}
          style={s.iconBtn}
        >
          {isRecording
            ? <Square size={18} color={t.colors.danger ?? "#ef4444"} fill={t.colors.danger ?? "#ef4444"} />
            : <Mic size={22} color={t.colors.muted} strokeWidth={2} />}
        </Pressable>

        <View style={[s.inputWrap, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
          <TextInput
            value={body}
            onChangeText={(v) => { setBody(v); if (v.length > 0) notifyTyping(); }}
            placeholder={
              isRecording ? "Recording…" :
              attachments.length > 0 ? "Add a caption (optional)" :
              "Message"
            }
            placeholderTextColor={t.colors.muted}
            style={[s.input, { color: t.colors.fg }]}
            multiline
            maxLength={8000}
            editable={!isRecording}
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
            {hasPending
              ? <ActivityIndicator color="#fff" size="small" />
              : <Send size={18} color="#fff" strokeWidth={2.4} />}
          </LinearGradient>
        </Pressable>
      </View>

      {/* Picker modal */}
      <Modal
        transparent
        visible={pickerOpen}
        animationType="fade"
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable style={s.modalBackdrop} onPress={() => setPickerOpen(false)}>
          <View style={[s.modalSheet, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
            <Pressable
              onPress={pickMedia}
              style={({ pressed }) => [s.sheetItem, pressed && { backgroundColor: t.colors.elevated }]}
            >
              <ImageIcon size={20} color={t.colors.primary} strokeWidth={2} />
              <Text style={[s.sheetItemText, { color: t.colors.fg }]}>Photos & videos</Text>
            </Pressable>
            <View style={[s.sheetDivider, { backgroundColor: t.colors.border }]} />
            <Pressable
              onPress={pickDocument}
              style={({ pressed }) => [s.sheetItem, pressed && { backgroundColor: t.colors.elevated }]}
            >
              <FileText size={20} color={t.colors.primary} strokeWidth={2} />
              <Text style={[s.sheetItemText, { color: t.colors.fg }]}>Document</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function AttachmentChip({ a, onRemove }: { a: PendingAttachment; onRemove: () => void }) {
  const t = useTheme();
  const isVisual = a.kind === "image" || a.kind === "gif" || a.kind === "video";
  if (isVisual) {
    return (
      <View style={s.thumbWrap}>
        <RNImage source={{ uri: a.uri }} style={[s.thumb, { borderColor: t.colors.border }, a.status === "uploading" && { opacity: 0.6 }]} />
        {a.status === "uploading" && (
          <View style={s.thumbOverlay}>
            <ActivityIndicator color="#fff" />
          </View>
        )}
        <Pressable onPress={onRemove} hitSlop={6} style={[s.removeBtn, { backgroundColor: t.colors.fg }]}>
          <X size={12} color={t.colors.bg} strokeWidth={3} />
        </Pressable>
      </View>
    );
  }
  return (
    <View style={[s.fileChip, { backgroundColor: t.colors.surface, borderColor: a.status === "error" ? (t.colors.danger ?? "#ef4444") : t.colors.border }]}>
      <View style={[s.fileIcon, { backgroundColor: a.kind === "audio" ? t.colors.primary + "26" : t.colors.elevated }]}>
        {a.kind === "audio"
          ? <Mic size={16} color={t.colors.primary} strokeWidth={2} />
          : <FileText size={16} color={t.colors.muted} strokeWidth={2} />}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.fileName, { color: t.colors.fg }]} numberOfLines={1}>
          {a.kind === "audio"
            ? `Voice message${a.durationMs ? ` · ${fmtDuration(a.durationMs)}` : ""}`
            : a.name}
        </Text>
        <Text style={[s.fileMeta, { color: a.status === "error" ? (t.colors.danger ?? "#ef4444") : t.colors.muted }]} numberOfLines={1}>
          {a.status === "uploading" ? `${Math.round(a.pct * 100)}%  ·  ${fmtBytes(a.size)}`
            : a.status === "error" ? a.error
            : fmtBytes(a.size)}
        </Text>
      </View>
      {a.status === "uploading" && <ActivityIndicator size="small" color={t.colors.muted} />}
      <Pressable onPress={onRemove} hitSlop={6} style={[s.removeBtn, { backgroundColor: t.colors.fg, top: -6, right: -6 }]}>
        <X size={12} color={t.colors.bg} strokeWidth={3} />
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
    gap: 4,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },

  inputWrap: {
    flex: 1, flexDirection: "row", alignItems: "flex-end",
    borderWidth: 1, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 6,
    minHeight: 44, maxHeight: 140, marginHorizontal: 4,
  },
  input: { flex: 1, fontSize: 16, paddingTop: 8, paddingBottom: 6, lineHeight: 22 },
  emoji: { padding: 6, marginBottom: 2 },

  sendWrap: { width: 40, height: 40, borderRadius: 20, overflow: "hidden" },
  send:     { flex: 1, alignItems: "center", justifyContent: "center" },

  // Attachment rail
  attRail: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 10 },
  thumbWrap: { width: 72, height: 72 },
  thumb:    { width: 72, height: 72, borderRadius: 12, borderWidth: 1 },
  thumbOverlay: { position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" },
  removeBtn: {
    position: "absolute", top: -4, right: -4, width: 18, height: 18, borderRadius: 9,
    alignItems: "center", justifyContent: "center",
  },
  fileChip: {
    flexDirection: "row", alignItems: "center", gap: 8,
    height: 56, minWidth: 180, maxWidth: 240, paddingHorizontal: 12,
    borderRadius: 12, borderWidth: 1,
  },
  fileIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  fileName: { fontSize: 12.5, fontWeight: "600" },
  fileMeta: { fontSize: 11, marginTop: 1 },

  // Recording bar
  recBar: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  recDot:  { width: 9, height: 9, borderRadius: 5 },
  recText: { fontSize: 13, fontWeight: "500" },
  recBtn:  { paddingHorizontal: 8, paddingVertical: 6 },

  // Picker modal
  modalBackdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center", justifyContent: "flex-end",
    paddingBottom: 90, paddingHorizontal: 16,
  },
  modalSheet: {
    width: "100%", maxWidth: 360,
    borderRadius: 16, borderWidth: 1, overflow: "hidden",
  },
  sheetItem: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  sheetItemText: { fontSize: 15, fontWeight: "500" },
  sheetDivider: { height: StyleSheet.hairlineWidth },
});
