import { IoAdapter } from "@nestjs/platform-socket.io";
import { ServerOptions } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
import type { INestApplication } from "@nestjs/common";
import { Env } from "../config/env";

/**
 * Custom Socket.IO adapter wiring the Redis pub/sub adapter so multiple
 * backend instances share one logical socket layer.
 */
export class SocketIoAdapter extends IoAdapter {
  constructor(app: INestApplication, private readonly env: Env) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, {
      ...options,
      cors: { origin: this.env.CORS_ORIGINS, credentials: true },
      transports: ["websocket"],
      pingTimeout: 30_000,
      pingInterval: 25_000,
    });

    const pub = new Redis(this.env.REDIS_URL, { maxRetriesPerRequest: null });
    const sub = pub.duplicate();
    server.adapter(createAdapter(pub, sub));
    return server;
  }
}
