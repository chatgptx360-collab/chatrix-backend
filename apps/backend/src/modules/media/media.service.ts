import { Inject, Injectable, Logger } from "@nestjs/common";
import { ChatrixError, ErrorCode } from "@chatrix/shared/errors";
import { MEDIA_ALLOWED_MIME, MEDIA_MAX_BYTES } from "@chatrix/shared/constants";
import type { MediaFile, MessageAttachment, UUID } from "@chatrix/shared/types";
import type { InitUploadInput } from "@chatrix/shared/schemas";
import { DatabaseService } from "../../db/database.service";
import { Env } from "../../config/env";
import { randomUUID } from "node:crypto";
import { STORAGE_DRIVER } from "./storage/storage.token";
import type { StorageDriver } from "./storage/storage.interface";

/**
 * Two-phase media upload.
 *
 *   1. POST /media/init        → server validates kind+mime+size, returns presigned URL
 *   2. PUT  <presigned URL>    → client uploads bytes directly to storage
 *   3. POST /media/:id/finalize → server marks 'ready' and stores public URL
 *
 * `attachToMessage` and `hydrateForMessages` are used by MessagesService
 * to attach completed media rows to messages and to project the wire-format
 * `attachments` array.
 */
interface MediaRow {
  id: UUID;
  owner_id: UUID;
  kind: MediaFile["kind"];
  status: MediaFile["status"];
  storage_driver: string;
  storage_key: string;
  public_url: string | null;
  thumbnail_key: string | null;
  mime_type: string;
  size_bytes: string;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  blurhash: string | null;
  waveform: number[] | null;
  created_at: Date;
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly env: Env,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
  ) {}

  // ---------- Upload lifecycle ----------

  async initUpload(ownerId: UUID, input: InitUploadInput) {
    this.assertSize(input.kind, input.sizeBytes);
    this.assertMime(input.kind, input.mimeType);

    const id = randomUUID();
    const storageKey = `${ownerId}/${input.kind}/${id}`;

    await this.db.query(
      `INSERT INTO media_files (id, owner_id, kind, status, storage_driver, storage_key,
                                mime_type, size_bytes, width, height, duration_ms)
       VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, $8, $9, $10)`,
      [id, ownerId, input.kind, this.storage.name, storageKey,
       input.mimeType, input.sizeBytes, input.width ?? null, input.height ?? null, input.durationMs ?? null],
    );

    const presigned = await this.storage.signUploadUrl({
      key: storageKey,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
    });

    return {
      mediaId: id,
      uploadUrl: presigned.uploadUrl,
      uploadHeaders: presigned.headers,
      expiresAt: presigned.expiresAt.toISOString(),
      storageDriver: this.storage.name,
    };
  }

  /**
   * Mark a row 'ready' after the client has uploaded. We trust the client's
   * size hint from /init (the DB row was created with it); presence in
   * storage is verified via the driver where cheap, otherwise on first GET.
   */
  async finalize(ownerId: UUID, mediaId: UUID, opts: { blurhash?: string; waveform?: number[] }): Promise<MediaFile> {
    const row = await this.db.oneOrNull<MediaRow>(
      `SELECT * FROM media_files WHERE id = $1 AND owner_id = $2`,
      [mediaId, ownerId],
    );
    if (!row) throw new ChatrixError(ErrorCode.NOT_FOUND, "Media not found.", 404);
    if (row.status === "ready") return rowToWire(row);

    if (!(await this.storage.exists(row.storage_key))) {
      throw new ChatrixError(ErrorCode.MEDIA_UPLOAD_FAILED, "Upload not detected at storage.", 409);
    }

    const publicUrl = this.storage.publicUrl(row.storage_key);
    const updated = await this.db.one<MediaRow>(
      `UPDATE media_files
          SET status = 'ready',
              public_url = $2,
              blurhash = COALESCE($3, blurhash),
              waveform = COALESCE($4, waveform),
              updated_at = now()
        WHERE id = $1
        RETURNING *`,
      [mediaId, publicUrl, opts.blurhash ?? null, opts.waveform ?? null],
    );
    return rowToWire(updated);
  }

  // ---------- Used by MessagesService ----------

  /**
   * Validate that every mediaId belongs to the sender and is 'ready'.
   * Returns the canonical attachments array (in submission order).
   */
  async attachToMessage(senderId: UUID, messageId: UUID, mediaIds: UUID[]): Promise<MessageAttachment[]> {
    if (mediaIds.length === 0) return [];

    const rows = await this.db.many<MediaRow>(
      `SELECT * FROM media_files
        WHERE id = ANY($1::uuid[]) AND owner_id = $2 AND deleted_at IS NULL`,
      [mediaIds, senderId],
    );
    if (rows.length !== mediaIds.length) {
      throw new ChatrixError(ErrorCode.NOT_FOUND, "One or more attachments not found.", 404);
    }
    const notReady = rows.filter((r) => r.status !== "ready");
    if (notReady.length) {
      throw new ChatrixError(ErrorCode.MEDIA_UPLOAD_FAILED, "Some attachments aren't ready yet.", 409);
    }

    // Persist the join rows in submitted order.
    const values: string[] = [];
    const params: unknown[] = [messageId];
    mediaIds.forEach((id, i) => {
      params.push(id, i);
      values.push(`($1, $${params.length - 1}, $${params.length})`);
    });
    await this.db.query(
      `INSERT INTO message_attachments (message_id, media_id, position) VALUES ${values.join(", ")}`,
      params,
    );

    // Emit in submission order, not DB order.
    const byId = new Map(rows.map((r) => [r.id, r]));
    return mediaIds.map((id, position) => attachmentToWire(byId.get(id)!, position));
  }

  /**
   * Hydrate attachment arrays for a batch of messages — used by chat-room
   * loads. Single round-trip via ANY($::uuid[]).
   */
  async hydrateForMessages(messageIds: UUID[]): Promise<Map<UUID, MessageAttachment[]>> {
    const out = new Map<UUID, MessageAttachment[]>();
    if (messageIds.length === 0) return out;

    const rows = await this.db.many<MediaRow & { message_id: UUID; position: number }>(
      `SELECT m.*, ma.message_id, ma.position
         FROM message_attachments ma
         JOIN media_files m ON m.id = ma.media_id
        WHERE ma.message_id = ANY($1::uuid[])
        ORDER BY ma.message_id, ma.position`,
      [messageIds],
    );

    for (const r of rows) {
      const list = out.get(r.message_id) ?? [];
      list.push(attachmentToWire(r, r.position));
      out.set(r.message_id, list);
    }
    return out;
  }

  // ---------- Validation helpers ----------

  private assertSize(kind: keyof typeof MEDIA_MAX_BYTES, size: number) {
    if (size > MEDIA_MAX_BYTES[kind]) {
      throw new ChatrixError(ErrorCode.MEDIA_TOO_LARGE, "File exceeds the maximum size for its type.", 413);
    }
  }

  private assertMime(kind: keyof typeof MEDIA_ALLOWED_MIME, mime: string) {
    const allowed = MEDIA_ALLOWED_MIME[kind] as readonly string[];
    if (!allowed.includes("*/*") && !allowed.includes(mime)) {
      throw new ChatrixError(ErrorCode.MEDIA_BAD_MIME, `Mime type ${mime} not allowed for ${kind}.`, 415);
    }
  }
}

// ---------- Mappers ----------

function rowToWire(r: MediaRow): MediaFile {
  return {
    id: r.id,
    kind: r.kind,
    status: r.status,
    url: r.public_url,
    thumbnailUrl: null, // populated when thumbnail pipeline lands
    mimeType: r.mime_type,
    sizeBytes: parseInt(r.size_bytes, 10),
    width: r.width,
    height: r.height,
    durationMs: r.duration_ms,
    blurhash: r.blurhash,
    waveform: r.waveform,
    createdAt: r.created_at.toISOString(),
  };
}

function attachmentToWire(r: MediaRow, position: number): MessageAttachment {
  return {
    mediaId: r.id,
    position,
    url: r.public_url ?? "",
    thumbnailUrl: null,
    mimeType: r.mime_type,
    sizeBytes: parseInt(r.size_bytes, 10),
    width: r.width,
    height: r.height,
    durationMs: r.duration_ms,
    blurhash: r.blurhash,
    waveform: r.waveform,
  };
}
