/**
 * Two-phase media upload helper. Same contract as the mobile counterpart.
 *
 *   1. POST /v1/media/init   — server allocates the row + presigns a PUT URL
 *   2. PUT  <presigned URL>  — client streams bytes directly to storage
 *   3. POST /v1/media/:id/finalize — server marks 'ready' and returns the
 *      canonical MediaFile (with public_url)
 *
 * The browser fetch keeps memory pressure low — we never buffer the file
 * through our backend.
 */
import { api } from "./api/client";
import type { MediaFile } from "@chatrix/shared/types";

interface InitResponse {
  mediaId: string;
  uploadUrl: string;
  uploadHeaders: Record<string, string>;
  expiresAt: string;
  storageDriver: string;
}

export interface UploadOptions {
  kind: MediaFile["kind"];
  /** Optional progress callback (0–1). Fires every ~250 ms. */
  onProgress?: (pct: number) => void;
  /** Optional abort signal. */
  signal?: AbortSignal;
  /** Audio/video duration hint in ms (saves the server a probe). */
  durationMs?: number;
}

/**
 * Upload a file end-to-end. Returns the finalized MediaFile (with public URL).
 * Throws on any step failure — caller decides whether to retry.
 */
export async function uploadFile(file: File, opts: UploadOptions): Promise<MediaFile> {
  // For images we eagerly probe dimensions so the server can render image
  // bubbles with the right aspect ratio without a round-trip.
  const dims = opts.kind === "image" || opts.kind === "gif"
    ? await readImageDimensions(file).catch(() => null)
    : null;

  const init = await api<InitResponse>("/media/init", {
    method: "POST",
    body: {
      kind: opts.kind,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      width:  dims?.width,
      height: dims?.height,
      durationMs: opts.durationMs,
    },
  });

  await putWithProgress(init.uploadUrl, file, init.uploadHeaders, opts);

  // For images, generate a tiny blurhash on the client before finalize so the
  // recipient sees a soft preview while the full asset loads.
  // (Skipped here to avoid pulling in a blurhash lib; the backend column is
  // already nullable. Wire when needed.)

  return api<MediaFile>(`/media/${init.mediaId}/finalize`, {
    method: "POST",
    body: {},
  });
}

// ---------- Internals ----------

function putWithProgress(
  url: string,
  file: File,
  headers: Record<string, string>,
  { onProgress, signal }: UploadOptions,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);

    xhr.upload.onprogress = (e) => {
      if (!onProgress || !e.lengthComputable) return;
      onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed: HTTP ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("Upload network error"));
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    if (signal) {
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.send(file);
  });
}

function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read image")); };
    img.src = url;
  });
}
