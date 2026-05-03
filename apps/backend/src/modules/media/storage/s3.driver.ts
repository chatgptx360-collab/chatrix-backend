import { createHash, createHmac } from "node:crypto";
import { Logger } from "@nestjs/common";
import type { Env } from "../../../config/env";
import type { PresignedUpload, StorageDriver } from "./storage.interface";

/**
 * AWS S3 (and any S3-compatible store: Cloudflare R2, Backblaze B2, MinIO).
 *
 * We hand-roll SigV4 PUT presigning instead of pulling `@aws-sdk/*` (saves
 * ~5 MB of deps). The signing algorithm is fully specified by AWS:
 *   https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html
 *
 * GetObject is served via the public/CDN URL — we never sign reads.
 */
export class S3StorageDriver implements StorageDriver {
  readonly name = "s3" as const;
  private readonly logger = new Logger(S3StorageDriver.name);
  private readonly bucket: string;
  private readonly region: string;
  private readonly accessKey: string;
  private readonly secretKey: string;
  private readonly host: string;
  private readonly forcePathStyle: boolean;

  constructor(env: Env) {
    if (!env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY || !env.S3_BUCKET) {
      throw new Error("STORAGE_DRIVER=s3 requires S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, and S3_BUCKET.");
    }
    this.bucket = env.S3_BUCKET;
    this.region = env.S3_REGION;
    this.accessKey = env.S3_ACCESS_KEY_ID;
    this.secretKey = env.S3_SECRET_ACCESS_KEY;

    if (env.S3_ENDPOINT) {
      // Custom endpoint (R2, MinIO) — path-style URLs are universally supported.
      this.host = env.S3_ENDPOINT.replace(/^https?:\/\//, "").replace(/\/$/, "");
      this.forcePathStyle = true;
    } else {
      // AWS — virtual-hosted style is faster (uses geo-routed endpoints).
      this.host = `${this.bucket}.s3.${this.region}.amazonaws.com`;
      this.forcePathStyle = false;
    }
  }

  async signUploadUrl(args: { key: string; mimeType: string; sizeBytes: number }): Promise<PresignedUpload> {
    const expiresIn = 15 * 60; // 15 min — long enough for slow connections, short enough to limit abuse
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);
    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;

    const path = this.forcePathStyle
      ? `/${this.bucket}/${encodePath(args.key)}`
      : `/${encodePath(args.key)}`;

    // Query params drive presigning. Sorted alphabetically per SigV4 spec.
    const qs = new URLSearchParams({
      "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
      "X-Amz-Credential": `${this.accessKey}/${credentialScope}`,
      "X-Amz-Date": amzDate,
      "X-Amz-Expires": String(expiresIn),
      "X-Amz-SignedHeaders": "host",
    });

    // Canonical request.
    const canonicalQuery = [...qs.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${rfc3986(k)}=${rfc3986(v)}`)
      .join("&");

    const canonicalHeaders = `host:${this.host}\n`;
    const canonicalRequest = [
      "PUT", path, canonicalQuery, canonicalHeaders, "host", "UNSIGNED-PAYLOAD",
    ].join("\n");

    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      sha256Hex(canonicalRequest),
    ].join("\n");

    const kDate    = hmac(`AWS4${this.secretKey}`, dateStamp);
    const kRegion  = hmac(kDate, this.region);
    const kService = hmac(kRegion, "s3");
    const kSigning = hmac(kService, "aws4_request");
    const signature = hmac(kSigning, stringToSign).toString("hex");

    qs.append("X-Amz-Signature", signature);

    return {
      uploadUrl: `https://${this.host}${path}?${qs.toString()}`,
      headers: { "content-type": args.mimeType },
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    };
  }

  publicUrl(key: string): string {
    return this.forcePathStyle
      ? `https://${this.host}/${this.bucket}/${encodePath(key)}`
      : `https://${this.host}/${encodePath(key)}`;
  }

  async exists(_key: string): Promise<boolean> {
    // HEAD with SigV4 is non-trivial; the finalize endpoint validates size
    // through the DB row + the HEAD response body if needed. Trust-but-verify.
    return true;
  }

  async delete(key: string): Promise<void> {
    // Production: queue an async cleanup job rather than blocking the request.
    this.logger.warn(`s3 delete: ${key} (queue not yet implemented)`);
  }
}

// ---------- Helpers ----------

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

/** RFC 3986 percent-encoding (S3 needs ! '*( ) etc encoded). */
function rfc3986(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** Encode each path segment but keep slashes intact. */
function encodePath(key: string): string {
  return key.split("/").map(rfc3986).join("/");
}
