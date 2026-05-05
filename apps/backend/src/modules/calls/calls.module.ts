import { Module } from "@nestjs/common";
import { CallsService } from "./calls.service";
import { CallsController } from "./calls.controller";
import { IceConfigService } from "../../realtime/ice-config.service";

/**
 * Calls module. Owns the call state machine + REST endpoints (history,
 * ICE config). The realtime gateway imports CallsService directly to
 * drive transitions from socket events.
 */
@Module({
  controllers: [CallsController],
  providers: [CallsService, IceConfigService],
  exports: [CallsService, IceConfigService],
})
export class CallsModule {}
