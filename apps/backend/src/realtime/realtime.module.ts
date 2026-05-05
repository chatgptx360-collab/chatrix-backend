import { Module, forwardRef } from "@nestjs/common";
import { ChatGateway } from "./chat.gateway";
import { CHAT_GATEWAY } from "./chat-gateway.token";
import { PresenceService } from "./presence.service";
import { AuthModule } from "../modules/auth/auth.module";
import { MessagesModule } from "../modules/messages/messages.module";
import { CallsModule } from "../modules/calls/calls.module";

@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => MessagesModule),
    // CallsModule exports CallsService + IceConfigService so the gateway
    // can drive call state transitions and hand out ICE config.
    CallsModule,
  ],
  providers: [
    ChatGateway,
    // Re-expose ChatGateway under a non-class token so consumers (notably
    // MessagesService) can inject it without a runtime import of the class.
    { provide: CHAT_GATEWAY, useExisting: ChatGateway },
    PresenceService,
  ],
  exports: [PresenceService, ChatGateway, CHAT_GATEWAY],
})
export class RealtimeModule {}
