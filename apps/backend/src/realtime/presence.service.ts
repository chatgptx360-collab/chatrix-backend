import { Inject, Injectable, Logger } from "@nestjs/common";
import Redis from "ioredis";
import { REDIS } from "../redis/redis.module";
import { DatabaseService } from "../db/database.service";
import type { UUID, PresenceState } from "@chatrix/shared/types";

/**
 * Presence is fronted by Redis (sub-ms reads) and snapshotted to Postgres
 * on transitions so cold loads see correct last-seen values.
 *
 * Keys:
 *   presence:user:<uuid>      → "online" | "away" | "offline" (TTL 90s, refreshed by heartbeat)
 *   presence:sockets:<uuid>   → SET of socketIds   (cleaned up on disconnect)
 */
@Injectable()
export class PresenceService {
  private static readonly TTL = 90;
  private readonly logger = new Logger(PresenceService.name);

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly db: DatabaseService,
  ) {}

  async addSocket(userId: UUID, socketId: string) {
    await this.redis
      .multi()
      .sadd(`presence:sockets:${userId}`, socketId)
      .expire(`presence:sockets:${userId}`, PresenceService.TTL)
      .set(`presence:user:${userId}`, "online", "EX", PresenceService.TTL)
      .exec();
    // Best-effort DB snapshot. A failure here must NOT break socket
    // connection (and hence the whole signup→connect flow) — Redis already
    // holds the authoritative live state. The previous code propagated the
    // rejection up to the gateway's async handler, where Node's default
    // unhandled-rejection policy terminated the process.
    this.snapshotToDb(userId, "online").catch((err) =>
      this.logger.error(`presence snapshotToDb(online) failed for ${userId}: ${(err as Error).message}`),
    );
  }

  async removeSocket(userId: UUID, socketId: string): Promise<PresenceState> {
    const remaining = await this.redis
      .multi()
      .srem(`presence:sockets:${userId}`, socketId)
      .scard(`presence:sockets:${userId}`)
      .exec();
    const count = (remaining?.[1]?.[1] as number | undefined) ?? 0;
    if (count === 0) {
      await this.redis.set(`presence:user:${userId}`, "offline", "EX", PresenceService.TTL);
      this.snapshotToDb(userId, "offline").catch((err) =>
        this.logger.error(`presence snapshotToDb(offline) failed for ${userId}: ${(err as Error).message}`),
      );
      return "offline";
    }
    return "online";
  }

  async heartbeat(userId: UUID, socketId: string) {
    await this.redis
      .multi()
      .expire(`presence:sockets:${userId}`, PresenceService.TTL)
      .set(`presence:user:${userId}`, "online", "EX", PresenceService.TTL, "XX")
      .exec();
  }

  async setState(userId: UUID, state: Exclude<PresenceState, "offline">) {
    await this.redis.set(`presence:user:${userId}`, state, "EX", PresenceService.TTL);
    await this.snapshotToDb(userId, state);
  }

  async get(userId: UUID): Promise<PresenceState> {
    const v = await this.redis.get(`presence:user:${userId}`);
    return (v as PresenceState) ?? "offline";
  }

  private async snapshotToDb(userId: UUID, state: PresenceState) {
    // $2 is referenced from two sites with different inferred types (the
    // presence_state enum on the LHS, text in the literal comparison),
    // which Postgres rejects with 42P08 "inconsistent types deduced for
    // parameter $2". Casting on the comparison side resolves the conflict.
    await this.db.query(
      `UPDATE profiles
          SET presence     = $2::presence_state,
              last_seen_at = CASE WHEN $2::text = 'offline' THEN now() ELSE last_seen_at END
        WHERE user_id = $1`,
      [userId, state],
    );
  }
}
