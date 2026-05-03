import { Global, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { PushService } from "./push.service";

/**
 * Global so MessagesService / FriendsService / etc can inject PushService
 * without re-importing.
 */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, PushService],
  exports: [NotificationsService, PushService],
})
export class NotificationsModule {}
