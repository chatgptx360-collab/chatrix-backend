import { Global, Module } from "@nestjs/common";
import Redis from "ioredis";
import { Env } from "../config/env";

export const REDIS_PUB = Symbol("REDIS_PUB");
export const REDIS_SUB = Symbol("REDIS_SUB");
export const REDIS = Symbol("REDIS");

/**
 * Redis is used for three concerns:
 *   1. Socket.IO adapter (cross-instance fanout)        — REDIS_PUB / REDIS_SUB
 *   2. Cache (presence, rate limits, ephemeral state)   — REDIS
 *   3. Pub/sub for system events (e.g. invalidations)   — shares (1)
 *
 * We allocate three connections so heavy pub/sub traffic doesn't block
 * cache operations.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [Env],
      useFactory: (env: Env) => new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }),
    },
    {
      provide: REDIS_PUB,
      inject: [Env],
      useFactory: (env: Env) => new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }),
    },
    {
      provide: REDIS_SUB,
      inject: [Env],
      useFactory: (env: Env) => new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }),
    },
  ],
  exports: [REDIS, REDIS_PUB, REDIS_SUB],
})
export class RedisModule {}
