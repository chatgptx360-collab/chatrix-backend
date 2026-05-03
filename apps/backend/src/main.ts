import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { ValidationPipe, Logger } from "@nestjs/common";
import { AppModule } from "./app.module";
import { ChatrixExceptionFilter } from "./common/filters/exception.filter";
import { SocketIoAdapter } from "./realtime/socket-io.adapter";
import { Env } from "./config/env";

/**
 * Bootstrap — Fastify + Nest with Socket.IO swapped in for the WS server.
 * Fastify is chosen over Express for ~2x throughput on JSON workloads.
 */
async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true, logger: false }),
    { bufferLogs: true },
  );

  const env = app.get(Env);

  await app.register(helmet, {
    contentSecurityPolicy: false, // tightened in reverse-proxy
    crossOriginResourcePolicy: { policy: "cross-origin" },
  });
  await app.register(cors, {
    origin: env.CORS_ORIGINS,
    credentials: true,
  });
  await app.register(multipart, {
    limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB hard cap (premium overrides per-route)
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new ChatrixExceptionFilter());

  app.setGlobalPrefix("v1");
  app.useWebSocketAdapter(new SocketIoAdapter(app, env));

  await app.listen(env.PORT, "0.0.0.0");
  Logger.log(`Chatrix API ready → ${await app.getUrl()}`, "Bootstrap");
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal bootstrap error:", err);
  process.exit(1);
});
