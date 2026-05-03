import { Inject, Injectable } from "@nestjs/common";
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
    await this.snapshotToDb(userId, "online");
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
      await this.snapshotToDb(userId, "offline");
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
    await this.db.query(
      `UPDATE profiles
          SET presence = $2,
              last_seen_at = CASE WHEN $2 = 'offline' THEN now() ELSE last_seen_at END
        WHERE user_id = $1`,
      [userId, state],
    );
  }
}
