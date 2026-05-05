import { Injectable, Logger } from "@nestjs/common";
import { Env } from "../config/env";
import type { IceServer } from "@chatrix/shared/types";

/**
 * ICE server config emitted to clients before they construct an
 * RTCPeerConnection.
 *
 * Always includes Google's public STUN servers (no auth, free, fine for
 * the ~75% of users on permissive NAT). When TURN_URL/TURN_USERNAME/
 * TURN_CREDENTIAL are set, we also include a TURN entry — required for
 * the rest. Cloudflare Calls TURN is the recommended provider; its REST
 * endpoint can produce ephemeral credentials, but for simplicity we
 * accept long-lived credentials via env.
 *
 * To upgrade to ephemeral credentials later: replace `getIceServers()`
 * with a call to Cloudflare's `/turn` endpoint and cache the result for
 * ~50% of TTL.
 */
@Injectable()
export class IceConfigService {
  private readonly logger = new Logger(IceConfigService.name);

  constructor(private readonly env: Env) {}

  getIceServers(): IceServer[] {
    const servers: IceServer[] = [
      // Public STUN — free, anonymous, gets us NAT-binding for ~75% of peers.
      { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    ];

    if (this.env.TURN_URL) {
      // TURN_URL accepts either a single URL or a comma-separated list.
      const urls = this.env.TURN_URL.split(",").map((s) => s.trim()).filter(Boolean);
      servers.push({
        urls: urls.length === 1 ? urls[0]! : urls,
        username: this.env.TURN_USERNAME,
        credential: this.env.TURN_CREDENTIAL,
      });
    } else {
      this.logger.debug("No TURN_URL configured — calls behind strict NAT will fail to connect.");
    }

    return servers;
  }
}
