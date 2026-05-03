import { Logger } from "@nestjs/common";
import { mkdirSync, existsSync, unlink, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createHmac, randomBytes } from "node:crypto";
import type { PresignedUpload, StorageDriver } from "./storage.interface";

/**
 * Filesystem driver — useful for offline dev and CI tests.
 *
 * The "presigned" URL is just a HMAC over key+expiry that the upload route
 * verifies before writing the file. It deliberately does NOT live in this
 * file (the route is in `media.controller.ts` if/when needed) — for Phase 3
 * we expose the contract; the upload bridge can land when storage tests
 * demand it.
 *
 * Production should never use this driver — it's gated by NODE_ENV !== 'production'
 * in the module factory.
 */
export class LocalStorageDriver implements StorageDriver {
  readonly name = "local" as const;
  private readonly logger = new Logger(LocalStorageDriver.name);
  private readonly root: string;
  private readonly publicBase: string;
  private readonly secret: string;

  constructor() {
    this.root = resolve(process.cwd(), ".storage");
    this.publicBase = process.env.BACKEND_PUBLIC_URL ?? "http://localhost:4000";
    // A per-process secret is enough for dev — every restart invalidates URLs.
    this.secret = randomBytes(32).toString("hex");
    if (!existsSync(this.root)) mkdirSync(this.root, { recursive: true });
  }

  async signUploadUrl(args: { key: string; mimeType: string; sizeBytes: number }): Promise<PresignedUpload> {
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const sig = createHmac("sha256", this.secret)
      .update(`${args.key}|${expiresAt.toISOString()}`)
      .digest("hex");
    return {
      uploadUrl: `${this.publicBase}/v1/media/_local-upload?key=${encodeURIComponent(args.key)}&exp=${expiresAt.toISOString()}&sig=${sig}`,
      headers: { "content-type": args.mimeType },
      expiresAt,
    };
  }

  publicUrl(key: string): string {
    return `${this.publicBase}/v1/media/_local-public/${encodeURI(key)}`;
  }

  async exists(key: string): Promise<boolean> {
    try {
      statSync(resolve(this.root, key));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const path = resolve(this.root, key);
      if (!path.startsWith(this.root)) return; // path-traversal guard
      unlink(path, () => undefined);
    } catch (err) {
      this.logger.warn(`local delete failed for ${key}: ${(err as Error).message}`);
    }
  }

  // Used by the upload bridge if it's wired in dev:
  ensureDir(key: string) {
    mkdirSync(dirname(resolve(this.root, key)), { recursive: true });
  }
  rootDir() {
    return this.root;
  }
  validateSignature(key: string, exp: string, sig: string): boolean {
    if (new Date(exp) < new Date()) return false;
    const expected = createHmac("sha256", this.secret).update(`${key}|${exp}`).digest("hex");
    return expected === sig;
  }
}
