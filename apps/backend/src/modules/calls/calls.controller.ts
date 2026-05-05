import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { SelfUser } from "@chatrix/shared/types";
import { CallsService } from "./calls.service";
import { IceConfigService } from "../../realtime/ice-config.service";

/**
 * REST surface for calls — call history + ICE server config.
 *
 * The actual signalling (invite/accept/offer/answer/ICE) flows through the
 * realtime gateway. This controller is read-only.
 */
@Controller("calls")
@UseGuards(JwtAuthGuard)
export class CallsController {
  constructor(
    private readonly calls: CallsService,
    private readonly ice: IceConfigService,
  ) {}

  /**
   * GET /v1/calls — paginated history. Most recent first.
   * Cursor is an ISO timestamp; pass the previous response's nextCursor.
   */
  @Get()
  history(
    @CurrentUser() user: SelfUser,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    const parsedLimit = limit ? Math.min(Math.max(parseInt(limit, 10) || 30, 1), 100) : 30;
    return this.calls.history(user.id, { cursor: cursor ?? null, limit: parsedLimit });
  }

  /**
   * GET /v1/calls/ice-servers — RTCIceServer[] for the client to feed
   * directly into `new RTCPeerConnection({ iceServers })`. No request body.
   *
   * Async because the Cloudflare-backed config path mints short-lived
   * credentials over the network on the first request after a cache miss
   * (~once every 12h).
   */
  @Get("ice-servers")
  async iceServers() {
    return { iceServers: await this.ice.getIceServers() };
  }
}
