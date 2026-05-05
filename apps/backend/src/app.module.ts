import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";

import { Env, envFactory } from "./config/env";
import { ChatrixConfigModule } from "./config/config.module";
import { DatabaseModule } from "./db/database.module";
import { RedisModule } from "./redis/redis.module";

import { EmailModule } from "./modules/email/email.module";
import { AuthModule } from "./modules/auth/auth.module";
import { SessionsModule } from "./modules/sessions/sessions.module";
import { UsersModule } from "./modules/users/users.module";
import { FriendsModule } from "./modules/friends/friends.module";
import { ChatsModule } from "./modules/chats/chats.module";
import { MessagesModule } from "./modules/messages/messages.module";
import { MediaModule } from "./modules/media/media.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { AdminModule } from "./modules/admin/admin.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { HealthModule } from "./modules/health/health.module";
import { CallsModule } from "./modules/calls/calls.module";

/**
 * Top-level module composition.
 *
 * Order intentionally mirrors dependency direction:
 *   infra  (Env, DB, Redis)
 *     → identity (Auth, Users, Friends)
 *       → product (Chats, Messages, Media, Notifications)
 *         → operations (Reports, Admin)
 *           → transport (Realtime, Health)
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, load: [envFactory] }),
    ChatrixConfigModule,
    ThrottlerModule.forRootAsync({
      inject: [Env],
      useFactory: (env: Env) => [
        { name: "global", ttl: 60_000, limit: env.RATE_LIMIT_GLOBAL_RPM },
        { name: "auth",   ttl: 60_000, limit: env.RATE_LIMIT_AUTH_RPM },
      ],
    }),

    DatabaseModule,
    RedisModule,
    EmailModule,

    AuthModule,
    SessionsModule,
    UsersModule,
    FriendsModule,
    ChatsModule,
    MessagesModule,
    MediaModule,
    NotificationsModule,
    ReportsModule,
    AdminModule,
    CallsModule,
    RealtimeModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
