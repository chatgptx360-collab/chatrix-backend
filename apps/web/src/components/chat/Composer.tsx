"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Send, Paperclip, Smile, X, Loader2, ImageIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { uploadFile } from "@/lib/upload";
import { MEDIA_MAX_BYTES } from "@chatrix/shared/constants";
import type { MediaFile } from "@chatrix/shared/types";

interface Props {
  onSubmit: (body: string, attachmentIds?: string[]) => void;
  onTyping?: (typing: boolean) => void;
  disabled?: boolean;
}

/**
 * Composer with media attachments.
 *
 * Three ways to attach:
 *   1. Click paperclip → file picker
 *   2. Drag-drop files onto the composer
 *   3. Paste an image from clipboard (Cmd/Ctrl+V with an image on the clipboard)
 *
 * Pending attachments render as thumbnails with progress + remove. Send only
 * fires when every attachment has uploaded — text-only sends bypass.
 *
 * Keyboard: Enter sends; Shift+Enter newline. Cmd/Ctrl+Enter also sends
 * (familiar muscle memory).
 */
interface PendingAttachment {
  id: string;            // local id used in keys + remove
  file: File;
  previewUrl: string;
  pct: number;           // 0–1
  mediaId?: string;      // populated once /finalize returns
  status: "uploading" | "ready" | "error";
  error?: string;
}

export function Composer({ onSubmit, onTyping, disabled }: Props) {
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasPending = attachments.some((a) => a.status === "uploading");
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
    const readyIds = attachments
      .filter((a) => a.status === "ready" && a.mediaId)
      .map((a) => a.mediaId!);
    onSubmit(text, readyIds.length ? readyIds : undefined);
    setBody("");
    setAttachments((list) => {
      list.forEach((a) => URL.revokeObjectURL(a.previewUrl));
      return [];
    });
    onTyping?.(false);
    if (typingTimer.current) { clearTimeout(typingTimer.current); typingTimer.current = null; }
  }

  // ---------- Attachment lifecycle ----------

  const startUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) return;
    const kind: MediaFile["kind"] = file.type.startsWith("video/") ? "video"
                  : file.type === "image/gif" ? "gif"
                  : "image";
    if (file.size > MEDIA_MAX_BYTES[kind]) {
      // Don't even start the upload — surface the rejection inline.
      const localId = `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      setAttachments((list) => [...list, {
        id: localId, file, previewUrl: URL.createObjectURL(file),
        pct: 0, status: "error",
        error: `Too large for ${kind} (max ${Math.round(MEDIA_MAX_BYTES[kind] / 1024 / 1024)} MB)`,
      }]);
      return;
    }

    const localId = `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const previewUrl = URL.createObjectURL(file);
    setAttachments((list) => [...list, { id: localId, file, previewUrl, pct: 0, status: "uploading" }]);

    try {
      const media = await uploadFile(file, {
        kind,
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
    Array.from(files).forEach(startUpload);
  }

  function removeAttachment(id: string) {
    setAttachments((list) => {
      const target = list.find((a) => a.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return list.filter((a) => a.id !== id);
    });
  }

  // Cleanup blob URLs on unmount.
  useEffect(() => () => {
    attachments.forEach((a) => URL.revokeObjectURL(a.previewUrl));
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
      files.forEach(startUpload);
    }
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
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        multiple
        onChange={(e) => { onPickFiles(e.target.files); e.target.value = ""; }}
      />

      {/* Attachment thumbnails */}
      {attachments.length > 0 && (
        <div className="mb-2 flex gap-2 overflow-x-auto chat-scroll px-1 py-1">
          {attachments.map((a) => (
            <div key={a.id} className="relative shrink-0 group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.previewUrl}
                alt=""
                className={cn(
                  "h-20 w-20 rounded-xl object-cover border border-border",
                  a.status === "uploading" && "opacity-60",
                  a.status === "error"     && "ring-2 ring-danger/60",
                )}
              />
              {a.status === "uploading" && (
                <span className="absolute inset-0 flex items-center justify-center text-white">
                  <Loader2 className="animate-spin" size={20} />
                </span>
              )}
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
                onClick={() => removeAttachment(a.id)}
                className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-fg text-bg flex items-center justify-center shadow-sm hover:bg-danger hover:text-white transition"
                aria-label="Remove attachment"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className={cn(
        "flex items-end gap-2 px-2.5 py-2 rounded-2xl border border-border bg-surface",
        "focus-within:border-primary/60 focus-within:shadow-[0_4px_20px_-8px_rgba(99,74,246,0.32)] transition",
      )}>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label="Attach"
          title="Attach an image or video — or drag-drop / paste"
          className="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center text-muted hover:text-fg hover:bg-elevated transition"
        >
          <Paperclip size={18} />
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
          placeholder={attachments.length > 0 ? "Add a caption (optional)" : "Message"}
          disabled={disabled}
          className={cn(
            "flex-1 max-h-36 resize-none bg-transparent outline-none text-[15px] leading-snug",
            "placeholder:text-muted text-fg pt-1.5 pb-1",
          )}
        />

        <button
          type="button"
          aria-label="Emoji"
          className="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center text-muted hover:text-fg hover:bg-elevated transition"
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
        <ImageIcon size={11} className="ml-1" />
      </p>
    </div>
  );
}
