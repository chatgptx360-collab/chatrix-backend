/**
 * Pluggable storage backend.
 *
 * Concrete drivers live next to this file:
 *   - supabase.driver.ts  — Supabase Storage signed URLs
 *   - s3.driver.ts        — AWS S3 / R2 / any S3-compatible
 *   - local.driver.ts     — filesystem driver for offline dev
 *
 * The whole app talks to storage through this interface. Switching providers
 * is a one-line change in `media.module.ts`.
 */
export interface PresignedUpload {
  /** PUT this URL with the file bytes. */
  uploadUrl: string;
  /** Required HTTP headers for the upload (content-type, etc). */
  headers: Record<string, string>;
  /** When the URL stops working. */
  expiresAt: Date;
}

export interface StorageDriver {
  /** Driver identifier persisted to media_files.storage_driver. */
  readonly name: "supabase" | "s3" | "local";

  /**
   * Generate a presigned PUT URL the client can upload directly to.
   * Server never proxies the bytes.
   */
  signUploadUrl(args: {
    key: string;
    mimeType: string;
    sizeBytes: number;
  }): Promise<PresignedUpload>;

  /**
   * Public/CDN URL for completed uploads. May be the same as the storage URL
   * (Supabase) or a CloudFront/Cloudflare distribution in front of S3.
   */
  publicUrl(key: string): string;

  /**
   * Confirm the object actually exists at `key` (used by /finalize before we
   * mark the row 'ready'). Drivers that can't cheaply check this should return
   * `true` — the caller will fall back to size validation client-side.
   */
  exists(key: string): Promise<boolean>;

  /** Best-effort delete; failures are logged but don't throw. */
  delete(key: string): Promise<void>;
}
