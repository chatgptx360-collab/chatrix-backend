import { Injectable, Logger } from "@nestjs/common";
import { Env } from "../config/env";
import type { IceServer } from "@chatrix/shared/types";

/**
 * ICE server config emitted to clients before they construct an
 * RTCPeerConnection.
 *
 * Always includes Google's public STUN servers (no auth, free, fine for
 * the ~75% of users on permissive NAT). On top of that we'll mix in
 * TURN config from one of two backends, tried in order:
 *
 *   1. Cloudflare Calls TURN  (RECOMMENDED)
 *      Env: CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_API_TOKEN.
 *      We POST the key's API token to Cloudflare's `credentials/generate`
 *      endpoint to mint short-lived TURN creds, then cache the result
 *      for ~half the TTL so calls don't need a network round-trip just
 *      to learn how to connect. Cloudflare returns a single iceServers
 *      object that we pass through unchanged.
 *
 *   2. Static credentials  (Twilio, Open Relay, self-hosted coturn)
 *      Env: TURN_URL (+ optional TURN_USERNAME / TURN_CREDENTIAL).
 *      Used when Cloudflare isn't configured.
 *
 * If neither is configured we log a warning at boot and emit STUN-only.
 * Calls will work for users on permissive NAT but fail for anyone behind
 * strict NAT (~25%, depending on the population).
 */
@Injectable()
export class IceConfigService {
  private readonly logger = new Logger(IceConfigService.name);

  /** Cache of Cloudflare-minted creds. Refreshed at ~half the TTL. */
  private cfCache: { servers: IceServer[]; expiresAt: number } | null = null;

  /** Length of time we ask Cloudflare to make creds valid for. */
  private static readonly CF_TTL_SECONDS = 24 * 60 * 60; // 24h

  constructor(private readonly env: Env) {
    if (env.CLOUDFLARE_TURN_KEY_ID && env.CLOUDFLARE_TURN_API_TOKEN) {
      this.logger.log("TURN: using Cloudflare Calls (ephemeral credentials).");
    } else if (env.TURN_URL) {
      this.logger.log(`TURN: using static credentials (${env.TURN_URL}).`);
    } else {
      this.logger.warn("No TURN configured — calls behind strict NAT will fail to connect.");
    }
  }

  async getIceServers(): Promise<IceServer[]> {
    const baseStun: IceServer = {
      urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"],
    };

    // 1. Cloudflare Calls API path (preferred).
    if (this.env.CLOUDFLARE_TURN_KEY_ID && this.env.CLOUDFLARE_TURN_API_TOKEN) {
      try {
        const cf = await this.getCloudflareIce();
        return [baseStun, ...cf];
      } catch (err) {
        // Don't fail the call entirely on a Cloudflare hiccup — the call
        // can still go through STUN (and the static fallback below if set).
        this.logger.error(
          `Cloudflare TURN fetch failed: ${(err as Error).message}. Falling back.`,
        );
      }
    }

    // 2. Static creds path (Twilio, Open Relay, self-hosted coturn).
    if (this.env.TURN_URL) {
      const urls = this.env.TURN_URL.split(",").map((s) => s.trim()).filter(Boolean);
      return [
        baseStun,
        {
          urls: urls.length === 1 ? urls[0]! : urls,
          username: this.env.TURN_USERNAME,
          credential: this.env.TURN_CREDENTIAL,
        },
      ];
    }

    // 3. STUN-only.
    return [baseStun];
  }

  private async getCloudflareIce(): Promise<IceServer[]> {
    const now = Date.now();
    if (this.cfCache && this.cfCache.expiresAt > now) {
      return this.cfCache.servers;
    }

    const url = `https://rtc.live.cloudflare.com/v1/turn/keys/${this.env.CLOUDFLARE_TURN_KEY_ID}/credentials/generate`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.env.CLOUDFLARE_TURN_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl: IceConfigService.CF_TTL_SECONDS }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Cloudflare TURN: HTTP ${res.status} ${text.slice(0, 200)}`);
    }

    // Cloudflare returns a *single* iceServers object (urls + username +
    // credential). We pass through the urls list unchanged — RTCIceServer
    // accepts either a single URL or an array.
    const data = await res.json() as {
      iceServers: { urls: string | string[]; username: string; credential: string };
    };

    const servers: IceServer[] = [{
      urls: data.iceServers.urls,
      username: data.iceServers.username,
      credential: data.iceServers.credential,
    }];

    // Cache for half the TTL so callers always see still-valid creds.
    this.cfCache = {
      servers,
      expiresAt: now + (IceConfigService.CF_TTL_SECONDS * 1000) / 2,
    };
    return servers;
  }
}
