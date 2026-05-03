import { Logger } from "@nestjs/common";
import type { Env } from "../../../config/env";
import type { PresignedUpload, StorageDriver } from "./storage.interface";

/**
 * Supabase Storage driver. Uses the REST API directly so we don't pull in
 * `@supabase/supabase-js` for two endpoints.
 *
 * Signed-upload URL docs:
 *   POST /storage/v1/object/upload/sign/{bucket}/{path}
 *
 * Returns a single-use token; client uploads with:
 *   PUT  <SUPABASE_URL>/storage/v1/object/upload/sign/<bucket>/<path>?token=...
 */
export class SupabaseStorageDriver implements StorageDriver {
  readonly name = "supabase" as const;
  private readonly logger = new Logger(SupabaseStorageDriver.name);
  private readonly base: string;
  private readonly bucket: string;
  private readonly serviceKey: string;

  constructor(env: Env) {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("STORAGE_DRIVER=supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    }
    this.base = env.SUPABASE_URL.replace(/\/$/, "");
    this.bucket = env.SUPABASE_BUCKET;
    this.serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  }

  async signUploadUrl(args: { key: string; mimeType: string; sizeBytes: number }): Promise<PresignedUpload> {
    const res = await fetch(
      `${this.base}/storage/v1/object/upload/sign/${this.bucket}/${encodeURI(args.key)}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.serviceKey}`,
          apikey: this.serviceKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      },
    );
    if (!res.ok) {
      throw new Error(`Supabase signUploadUrl failed: ${res.status} ${await res.text()}`);
    }
    const { url, token } = (await res.json()) as { url?: string; token?: string };
    if (!token) throw new Error("Supabase did not return an upload token.");

    return {
      uploadUrl: `${this.base}/storage/v1/object/upload/sign/${this.bucket}/${encodeURI(args.key)}?token=${encodeURIComponent(token)}`,
      headers: { "content-type": args.mimeType },
      // Supabase signed-upload tokens expire after 2 hours by default.
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    };
  }

  publicUrl(key: string): string {
    return `${this.base}/storage/v1/object/public/${this.bucket}/${encodeURI(key)}`;
  }

  async exists(key: string): Promise<boolean> {
    const res = await fetch(
      `${this.base}/storage/v1/object/info/${this.bucket}/${encodeURI(key)}`,
      { headers: { authorization: `Bearer ${this.serviceKey}`, apikey: this.serviceKey } },
    );
    return res.ok;
  }

  async delete(key: string): Promise<void> {
    const res = await fetch(
      `${this.base}/storage/v1/object/${this.bucket}/${encodeURI(key)}`,
      { method: "DELETE", headers: { authorization: `Bearer ${this.serviceKey}`, apikey: this.serviceKey } },
    );
    if (!res.ok) {
      this.logger.warn(`supabase delete failed for ${key}: ${res.status}`);
    }
  }
}
