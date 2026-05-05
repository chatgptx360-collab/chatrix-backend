"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Send, Paperclip, Smile, X, Loader2, ImageIcon, Mic, Square, FileText } from "lucide-react";
import { cn } from "@/lib/cn";
import { uploadFile } from "@/lib/upload";
import {
  MEDIA_MAX_BYTES,
  MEDIA_ALLOWED_MIME,
  VOICE_NOTE_MAX_DURATION_MS,
} from "@chatrix/shared/constants";
import type { MediaFile, MediaKind } from "@chatrix/shared/types";

interface Props {
  onSubmit: (body: string, attachmentIds?: string[], kind?: "text" | "audio" | "image" | "video" | "file" | "gif") => void;
  onTyping?: (typing: boolean) => void;
  disabled?: boolean;
}

/**
 * Composer with media attachments + voice notes.
 *
 * Attachments — four ways in:
 *   1. Paperclip → "Photos & videos" / "File" sub-pickers
 *   2. Drag-drop onto the composer
 *   3. Cmd/Ctrl+V paste (image from clipboard)
 *   4. Mic button → tap-to-toggle voice recording
 *
 * Pending attachments render as thumbnails (image/video) or chips (file/audio)
 * with progress + remove. Send only fires when every attachment has uploaded —
 * text-only sends bypass.
 *
 * Voice notes: tapping the mic starts a MediaRecorder against the user's
 * microphone in `audio/webm; codecs=opus` (or whatever the browser settles
 * on — we feed the actual mime to /media/init). Tapping again stops, the
 * blob uploads, and the message kind is forced to "audio" so receivers
 * render an audio bubble instead of a generic file chip.
 *
 * Keyboard: Enter sends; Shift+Enter newline. Cmd/Ctrl+Enter also sends.
 */

interface PendingAttachment {
  id: string;            // local id used in keys + remove
  file: File;
  kind: MediaKind;
  /** Object URL — used as <img src=...> for image/gif/video previews. */
  previewUrl: string;
  pct: number;           // 0–1
  mediaId?: string;      // populated once /finalize returns
  status: "uploading" | "ready" | "error";
  error?: string;
  /** For audio attachments — set after the recorder stops. */
  durationMs?: number;
}

/**
 * Map a File's mime → kind. We're permissive with audio/video and let the
 * server reject unknown types via MEDIA_ALLOWED_MIME.
 */
function inferKind(file: File): MediaKind | null {
  const mt = file.type.toLowerCase();
  if (mt === "image/gif") return "gif";
  if (mt.startsWith("image/")) return "image";
  if (mt.startsWith("video/")) return "video";
  if (mt.startsWith("audio/")) return "audio";
  // Anything in our locked allow-list maps to "file"; the server will
  // reject anything outside the list.
  if ((MEDIA_ALLOWED_MIME.file as readonly string[]).includes(mt)) return "file";
  // Last-resort: filename extension fallback for browsers that report
  // "application/octet-stream".
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext && /^(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv|md|json|zip|rar|7z|tar|gz)$/.test(ext)) {
    return "file";
  }
  return null;
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

export function Composer({ onSubmit, onTyping, disabled }: Props) {
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const mediaFileRef = useRef<HTMLInputElement>(null);  // photos & videos
  const docFileRef = useRef<HTMLInputElement>(null);    // documents
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordSec, setRecordSec] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunks = useRef<Blob[]>([]);
  const recordStart = useRef<number>(0);
  const recordTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordStream = useRef<MediaStream | null>(null);

  const hasPending = attachments.some((a) => a.status === "uploading");
  const hasReadyAudio = attachments.some((a) => a.status === "ready" && a.kind === "audio");
  const canSend =
    !disabled && !hasPending &&
    (body.trim().length > 0 || attachments.some((a) => a.status === "ready"));

  // Auto-grow textarea.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 6 * 22 + 16)}px`;
  }, [body]);

  function notifyTyping() {
    onTyping?.(true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => onTyping?.(false), 2_000);
  }

  function send() {
    const text = body.trim();
    if (!canSend) return;
    const ready = attachments.filter((a) => a.status === "ready" && a.mediaId);
    const ids = ready.map((a) => a.mediaId!);
    // Pick the message-level kind based on the attachments. The bubble
    // renderer keys off this to choose its layout (audio gets a voice-note
    // bubble, file gets a download chip, etc). When attachments are mixed
    // we fall back to "file" — the safest generic that won't try to inline-
    // render the wrong media type.
    let kind: Parameters<typeof onSubmit>[2] = undefined;
    if (ready.length > 0) {
      const first = ready[0]!.kind;
      const allSame = ready.every((a) => a.kind === first);
      kind = (allSame ? first : "file") as Parameters<typeof onSubmit>[2];
    }
    onSubmit(text, ids.length ? ids : undefined, kind);
    setBody("");
    setAttachments((list) => {
      list.forEach((a) => URL.revokeObjectURL(a.previewUrl));
      return [];
    });
    onTyping?.(false);
    if (typingTimer.current) { clearTimeout(typingTimer.current); typingTimer.current = null; }
  }

  // ---------- Attachment lifecycle ----------

  const startUpload = useCallback(async (file: File, opts?: { kindOverride?: MediaKind; durationMs?: number }) => {
    const kind = opts?.kindOverride ?? inferKind(file);
    if (!kind) {
      const localId = `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      setAttachments((list) => [...list, {
        id: localId, file, kind: "file" as MediaKind,
        previewUrl: URL.createObjectURL(file),
        pct: 0, status: "error",
        error: `Unsupported file type: ${file.type || "unknown"}`,
      }]);
      return;
    }

    if (file.size > MEDIA_MAX_BYTES[kind]) {
      const localId = `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      setAttachments((list) => [...list, {
        id: localId, file, kind,
        previewUrl: URL.createObjectURL(file),
        pct: 0, status: "error",
        error: `Too large for ${kind} (max ${Math.round(MEDIA_MAX_BYTES[kind] / 1024 / 1024)} MB)`,
      }]);
      return;
    }

    const localId = `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const previewUrl = URL.createObjectURL(file);
    setAttachments((list) => [...list, {
      id: localId, file, kind, previewUrl, pct: 0, status: "uploading",
      durationMs: opts?.durationMs,
    }]);

    try {
      const media = await uploadFile(file, {
        kind,
        durationMs: opts?.durationMs,
        onProgress: (pct) => setAttachments((list) =>
          list.map((a) => a.id === localId ? { ...a, pct } : a)
        ),
      });
      setAttachments((list) =>
        list.map((a) => a.id === localId ? { ...a, mediaId: media.id, status: "ready", pct: 1 } : a)
      );
    } catch (err) {
      setAttachments((list) =>
        list.map((a) => a.id === localId
          ? { ...a, status: "error", error: (err as Error).message ?? "Upload failed" }
          : a
        ),
      );
    }
  }, []);

  function onPickFiles(files: FileList | null) {
    if (!files) return;
    Array.from(files).forEach((f) => startUpload(f));
  }

  function removeAttachment(id: string) {
    setAttachments((list) => {
      const target = list.find((a) => a.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return list.filter((a) => a.id !== id);
    });
  }

  // Cleanup blob URLs + active recorder on unmount.
  useEffect(() => () => {
    attachments.forEach((a) => URL.revokeObjectURL(a.previewUrl));
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    recordStream.current?.getTracks().forEach((t) => t.stop());
    if (recordTimer.current) clearInterval(recordTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Drag-drop + paste ----------

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer?.files?.length) onPickFiles(e.dataTransfer.files);
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const it of items) {
      if (it.kind === "file") {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length) {
      e.preventDefault();
      files.forEach((f) => startUpload(f));
    }
  }

  // ---------- Voice recording ----------
  //
  // Tap-to-toggle: first tap requests mic permission and starts recording;
  // second tap stops the recorder, packages the chunks into a Blob, and
  // pushes it through the same upload pipeline as any other attachment.
  //
  // We hard-cap at VOICE_NOTE_MAX_DURATION_MS so a forgotten recorder
  // doesn't generate a 25-minute file. The cap fires `stop()` cleanly,
  // which triggers the same `dataavailable → onstop` path.

  async function startRecording() {
    if (isRecording) return;
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      alert("Your browser doesn't support voice recording.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Pick the first supported mime, falling back to the browser default.
      const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
      const mime = candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime })
                            : new MediaRecorder(stream);
      recordChunks.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordChunks.current.push(e.data);
      };
      recorder.onstop = async () => {
        const elapsed = Date.now() - recordStart.current;
        const blobMime = recorder.mimeType || "audio/webm";
        const blob = new Blob(recordChunks.current, { type: blobMime });
        // Wrap as File for the existing upload helper.
        const ext = blobMime.includes("mp4") ? "m4a"
                  : blobMime.includes("ogg") ? "ogg"
                  : "webm";
        const file = new File(
          [blob],
          `voice-${new Date().toISOString().replace(/[:.]/g, "-")}.${ext}`,
          { type: blobMime },
        );
        recordStream.current?.getTracks().forEach((t) => t.stop());
        recordStream.current = null;
        recorderRef.current = null;
        if (recordTimer.current) clearInterval(recordTimer.current);
        recordTimer.current = null;
        setIsRecording(false);
        setRecordSec(0);
        // Discard ultra-short presses (<300 ms) — almost certainly accidental.
        if (elapsed < 300) return;
        await startUpload(file, { kindOverride: "audio", durationMs: elapsed });
      };
      recorder.start(250);
      recorderRef.current = recorder;
      recordStream.current = stream;
      recordStart.current = Date.now();
      setIsRecording(true);
      setRecordSec(0);
      recordTimer.current = setInterval(() => {
        const elapsed = Date.now() - recordStart.current;
        setRecordSec(Math.floor(elapsed / 1000));
        if (elapsed >= VOICE_NOTE_MAX_DURATION_MS) {
          recorder.stop(); // triggers onstop → upload
        }
      }, 250);
    } catch (err) {
      console.error(err);
      alert("Couldn't start voice recording. Check the mic permission.");
    }
  }

  function stopRecording() {
    const r = recorderRef.current;
    if (r && r.state !== "inactive") r.stop(); // onstop handles cleanup
  }

  function cancelRecording() {
    const r = recorderRef.current;
    if (!r) return;
    // Cancel == stop without uploading. We swap onstop to a no-op first.
    r.onstop = () => {
      recordStream.current?.getTracks().forEach((t) => t.stop());
      recordStream.current = null;
      recorderRef.current = null;
      if (recordTimer.current) clearInterval(recordTimer.current);
      recordTimer.current = null;
      setIsRecording(false);
      setRecordSec(0);
    };
    r.stop();
  }

  // ---------- Picker menu ----------

  function openMediaPicker() {
    setPickerOpen(false);
    mediaFileRef.current?.click();
  }
  function openDocPicker() {
    setPickerOpen(false);
    docFileRef.current?.click();
  }

  return (
    <div
      className={cn(
        "border-t border-border bg-bg px-4 py-3",
        dragOver && "ring-2 ring-primary/50",
      )}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {/* Hidden file inputs — one per source. The accept strings keep the
          OS picker honest; the server still validates against the locked
          MIME allow-list. */}
      <input
        ref={mediaFileRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        multiple
        onChange={(e) => { onPickFiles(e.target.files); e.target.value = ""; }}
      />
      <input
        ref={docFileRef}
        type="file"
        accept={(MEDIA_ALLOWED_MIME.file as readonly string[]).join(",")}
        className="hidden"
        multiple
        onChange={(e) => { onPickFiles(e.target.files); e.target.value = ""; }}
      />

      {/* Attachment thumbnails / chips */}
      {attachments.length > 0 && (
        <div className="mb-2 flex gap-2 overflow-x-auto chat-scroll px-1 py-1">
          {attachments.map((a) => (
            <AttachmentPreview key={a.id} a={a} onRemove={() => removeAttachment(a.id)} />
          ))}
        </div>
      )}

      {/* Recording bar */}
      {isRecording && (
        <div className="mb-2 flex items-center gap-3 px-3 py-2 rounded-xl bg-elevated border border-border">
          <span className="h-2.5 w-2.5 rounded-full bg-danger animate-pulse" />
          <span className="text-[13px] text-fg font-medium tabular-nums">
            Recording  ·  {fmtDuration(recordSec * 1000)}
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={cancelRecording}
            className="h-7 px-3 rounded-lg text-[12px] font-medium text-muted hover:text-fg hover:bg-surface transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={stopRecording}
            className="h-7 px-3 rounded-lg text-[12px] font-medium bg-brand-gradient text-white shadow-glow"
          >
            Stop
          </button>
        </div>
      )}

      <div className={cn(
        "flex items-end gap-2 px-2.5 py-2 rounded-2xl border border-border bg-surface",
        "focus-within:border-primary/60 focus-within:shadow-[0_4px_20px_-8px_rgba(99,74,246,0.32)] transition",
      )}>
        {/* Attach button + popover */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            aria-label="Attach"
            title="Attach files"
            className="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center text-muted hover:text-fg hover:bg-elevated transition"
            disabled={isRecording}
          >
            <Paperclip size={18} />
          </button>
          {pickerOpen && (
            <>
              {/* Click-away overlay */}
              <div className="fixed inset-0 z-40" onClick={() => setPickerOpen(false)} />
              <div className="absolute bottom-full left-0 mb-2 z-50 min-w-[200px] rounded-xl border border-border bg-surface shadow-lg overflow-hidden">
                <button
                  type="button"
                  onClick={openMediaPicker}
                  className="w-full px-3 py-2.5 flex items-center gap-2.5 text-[13.5px] text-fg hover:bg-elevated transition"
                >
                  <ImageIcon size={16} className="text-primary" />
                  Photos & videos
                </button>
                <button
                  type="button"
                  onClick={openDocPicker}
                  className="w-full px-3 py-2.5 flex items-center gap-2.5 text-[13.5px] text-fg hover:bg-elevated transition border-t border-border"
                >
                  <FileText size={16} className="text-primary" />
                  Document
                </button>
              </div>
            </>
          )}
        </div>

        {/* Mic button — toggles voice recording */}
        <button
          type="button"
          onClick={() => isRecording ? stopRecording() : startRecording()}
          aria-label={isRecording ? "Stop recording" : "Record voice message"}
          title={isRecording ? "Stop" : "Record voice message"}
          className={cn(
            "h-9 w-9 shrink-0 rounded-xl flex items-center justify-center transition",
            isRecording
              ? "bg-danger/15 text-danger animate-pulse"
              : "text-muted hover:text-fg hover:bg-elevated",
          )}
        >
          {isRecording ? <Square size={16} fill="currentColor" /> : <Mic size={18} />}
        </button>

        <textarea
          ref={taRef}
          rows={1}
          value={body}
          maxLength={8000}
          onChange={(e) => { setBody(e.target.value); if (e.target.value.length > 0) notifyTyping(); }}
          onBlur={() => onTyping?.(false)}
          onPaste={onPaste}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); }
            if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) { e.preventDefault(); send(); }
          }}
          placeholder={
            isRecording ? "Recording…" :
            hasReadyAudio ? "Add a caption (optional)" :
            attachments.length > 0 ? "Add a caption (optional)" :
            "Message"
          }
          disabled={disabled || isRecording}
          className={cn(
            "flex-1 max-h-36 resize-none bg-transparent outline-none text-[15px] leading-snug",
            "placeholder:text-muted text-fg pt-1.5 pb-1",
          )}
        />

        <button
          type="button"
          aria-label="Emoji"
          className="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center text-muted hover:text-fg hover:bg-elevated transition"
          disabled={isRecording}
        >
          <Smile size={18} />
        </button>

        <button
          type="button"
          onClick={send}
          disabled={!canSend}
          aria-label="Send"
          className={cn(
            "h-9 w-9 shrink-0 rounded-xl flex items-center justify-center transition",
            canSend
              ? "bg-brand-gradient text-white shadow-glow hover:opacity-95"
              : "bg-elevated text-muted",
          )}
        >
          {hasPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} strokeWidth={2.4} />}
        </button>
      </div>

      <p className="mt-1.5 px-2 text-[11px] text-muted flex items-center gap-1.5">
        <kbd className="px-1 rounded bg-elevated border border-border text-[10px]">Enter</kbd> to send ·
        <kbd className="px-1 rounded bg-elevated border border-border text-[10px]">Shift</kbd>+<kbd className="px-1 rounded bg-elevated border border-border text-[10px]">Enter</kbd> for newline ·
        drag-drop / <kbd className="px-1 rounded bg-elevated border border-border text-[10px]">Cmd</kbd>+<kbd className="px-1 rounded bg-elevated border border-border text-[10px]">V</kbd> to attach
      </p>
    </div>
  );
}

// =============================================================================
// AttachmentPreview — kind-specific thumb / chip rendering inside the composer.
// =============================================================================

function AttachmentPreview({
  a, onRemove,
}: {
  a: PendingAttachment;
  onRemove: () => void;
}) {
  const isVisual = a.kind === "image" || a.kind === "gif" || a.kind === "video";
  const overlay = (
    <>
      {a.status === "uploading" && (
        <span className="absolute bottom-1 left-1 right-1 h-1 rounded-full bg-black/50 overflow-hidden">
          <span className="block h-full bg-white transition-all" style={{ width: `${Math.round(a.pct * 100)}%` }} />
        </span>
      )}
      {a.status === "error" && (
        <span className="absolute inset-x-1 bottom-1 px-1.5 py-0.5 rounded bg-danger/90 text-white text-[9px] font-bold leading-tight" title={a.error}>
          {a.error?.slice(0, 28) ?? "Failed"}
        </span>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-fg text-bg flex items-center justify-center shadow-sm hover:bg-danger hover:text-white transition"
        aria-label="Remove attachment"
      >
        <X size={12} />
      </button>
    </>
  );

  if (isVisual) {
    return (
      <div className="relative shrink-0 group">
        {a.kind === "video" ? (
          <video
            src={a.previewUrl}
            muted
            className={cn(
              "h-20 w-20 rounded-xl object-cover border border-border",
              a.status === "uploading" && "opacity-60",
              a.status === "error" && "ring-2 ring-danger/60",
            )}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={a.previewUrl}
            alt=""
            className={cn(
              "h-20 w-20 rounded-xl object-cover border border-border",
              a.status === "uploading" && "opacity-60",
              a.status === "error" && "ring-2 ring-danger/60",
            )}
          />
        )}
        {a.status === "uploading" && (
          <span className="absolute inset-0 flex items-center justify-center text-white">
            <Loader2 className="animate-spin" size={20} />
          </span>
        )}
        {overlay}
      </div>
    );
  }

  // Audio + file → chip
  return (
    <div className={cn(
      "relative shrink-0 flex items-center gap-2 h-14 min-w-[160px] max-w-[260px] px-3 rounded-xl border bg-surface",
      a.status === "uploading" && "opacity-70",
      a.status === "error" ? "border-danger/60" : "border-border",
    )}>
      <span className={cn(
        "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
        a.kind === "audio" ? "bg-primary/15 text-primary" : "bg-elevated text-muted",
      )}>
        {a.kind === "audio" ? <Mic size={16} /> : <FileText size={16} />}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[12.5px] font-medium text-fg truncate">
          {a.kind === "audio"
            ? `Voice message${a.durationMs ? ` · ${fmtDuration(a.durationMs)}` : ""}`
            : a.file.name}
        </p>
        <p className="text-[11px] text-muted">
          {a.status === "uploading"
            ? `${Math.round(a.pct * 100)}%  ·  ${fmtBytes(a.file.size)}`
            : a.status === "error"
              ? a.error
              : fmtBytes(a.file.size)}
        </p>
      </div>
      {a.status === "uploading" && (
        <Loader2 size={14} className="text-muted animate-spin shrink-0" />
      )}
      {overlay}
    </div>
  );
}
