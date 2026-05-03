/**
 * Two-phase media upload helper for mobile. Same contract as the web version.
 *
 *   1. POST /v1/media/init   — server allocates the row + presigns a PUT URL
 *   2. PUT  <presigned URL>  — client streams bytes directly to storage
 *   3. POST /v1/media/:id/finalize — returns the finalized MediaFile
 *
 * On native we use FormData/Blob so the platform handles streaming. The
 * picker (expo-image-picker) gives us a local file URI; we fetch it back
 * as a Blob to PUT.
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

export interface AssetLike {
  /** local file URI from expo-image-picker (file://...) or a remote blob URL */
  uri: string;
  /** mime type — picker reports this; fallback to image/jpeg */
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  fileSize?: number | null;
  durationMs?: number | null;
}

export interface UploadOptions {
  kind: MediaFile["kind"];
  onProgress?: (pct: number) => void;
}

export async function uploadAsset(asset: AssetLike, opts: UploadOptions): Promise<MediaFile> {
  // Realize the asset as a Blob so we have its real byte size before /init.
  const blob = await (await fetch(asset.uri)).blob();

  const init = await api<InitResponse>("/media/init", {
    method: "POST",
    body: {
      kind: opts.kind,
      mimeType: asset.mimeType ?? blob.type ?? "application/octet-stream",
      sizeBytes: blob.size,
      width:  asset.width ?? undefined,
      height: asset.height ?? undefined,
      durationMs: asset.durationMs ?? undefined,
    },
  });

  // Plain fetch PUT — RN's fetch doesn't expose upload progress, but the
  // assets we send (avatars + chat images) are small enough that fake
  // progress (start at 10%, jump to 100%) is fine for now.
  opts.onProgress?.(0.1);
  const res = await fetch(init.uploadUrl, {
    method: "PUT",
    headers: init.uploadHeaders,
    body: blob,
  });
  if (!res.ok) throw new Error(`Upload failed: HTTP ${res.status}`);
  opts.onProgress?.(1);

  return api<MediaFile>(`/media/${init.mediaId}/finalize`, {
    method: "POST",
    body: {},
  });
}
