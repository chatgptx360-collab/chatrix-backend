import { Controller, Get, Inject } from "@nestjs/common";
import Redis from "ioredis";
import { DatabaseService } from "../../db/database.service";
import { REDIS } from "../../redis/redis.module";

@Controller("health")
export class HealthController {
  constructor(
    private readonly db: DatabaseService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get()
  async health() {
    const [pg, redis] = await Promise.allSettled([
      this.db.one<{ ok: number }>("SELECT 1::int AS ok"),
      this.redis.ping(),
    ]);
    return {
      status: pg.status === "fulfilled" && redis.status === "fulfilled" ? "ok" : "degraded",
      pg: pg.status === "fulfilled" ? "up" : "down",
      redis: redis.status === "fulfilled" ? "up" : "down",
      time: new Date().toISOString(),
    };
  }
}
