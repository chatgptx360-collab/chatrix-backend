import { Module, forwardRef } from "@nestjs/common";
import { ChatGateway } from "./chat.gateway";
import { PresenceService } from "./presence.service";
import { AuthModule } from "../modules/auth/auth.module";
import { MessagesModule } from "../modules/messages/messages.module";

@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => MessagesModule),
  ],
  providers: [ChatGateway, PresenceService],
  exports: [PresenceService, ChatGateway],
})
export class RealtimeModule {}
