import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ChatsController } from "./chats.controller";
import { ChatsService } from "./chats.service";
import { RealtimeModule } from "../../realtime/realtime.module";

@Module({
  imports: [AuthModule, forwardRef(() => RealtimeModule)],
  controllers: [ChatsController],
  providers: [ChatsService],
  exports: [ChatsService],
})
export class ChatsModule {}
