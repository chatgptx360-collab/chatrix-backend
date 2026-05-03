import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../../db/database.service";
import { Env } from "../../config/env";
import type { UUID } from "@chatrix/shared/types";

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Use chatId as the Android collapse key — multiple messages from one chat collapse. */
  collapseKey?: string;
}

/**
 * Push fanout — wraps Expo push for native and web-push for browsers.
 *
 * Mobile (Expo)
 *   POST https://exp.host/--/api/v2/push/send  with `[{ to, title, body, data }]`
 *   docs: https://docs.expo.dev/push-notifications/sending-notifications/
 *
 * Web (web-push)
 *   The `web-push` npm package generates VAPID-signed pushes from the saved
 *   subscription JSON in `devices.push_subscription`. We don't pull it in by
 *   default — it adds a native dep — but the hook is here. To enable:
 *     pnpm add web-push -F @chatrix/backend
 *     fill WEB_PUSH_VAPID_* in env
 *     uncomment the `import webpush` line below.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private readonly db: DatabaseService, private readonly env: Env) {}

  /** Send to every device registered for the user, EXCEPT skipDeviceId. */
  async sendToUser(userId: UUID, payload: PushPayload, opts?: { skipDeviceId?: UUID }) {
    const devices = await this.db.many<{
      id: UUID;
      platform: "ios" | "android" | "web" | "desktop";
      push_token: string | null;
      push_subscription: any | null;
    }>(
      `SELECT id, platform, push_token, push_subscription
         FROM devices
        WHERE user_id = $1
          AND ($2::uuid IS NULL OR id <> $2)
          AND last_active_at > now() - interval '90 days'
          AND (push_token IS NOT NULL OR push_subscription IS NOT NULL)`,
      [userId, opts?.skipDeviceId ?? null],
    );
    if (devices.length === 0) return;

    const expoTokens = devices
      .filter((d) => (d.platform === "ios" || d.platform === "android") && d.push_token)
      .map((d) => d.push_token!);
    const webSubs = devices
      .filter((d) => d.platform === "web" && d.push_subscription)
      .map((d) => d.push_subscription!);

    await Promise.allSettled([
      expoTokens.length ? this.sendExpo(expoTokens, payload) : null,
      webSubs.length    ? this.sendWebPush(webSubs, payload) : null,
    ].filter(Boolean) as Promise<unknown>[]);
  }

  // ---------- Expo ----------

  private async sendExpo(tokens: string[], payload: PushPayload) {
    // Expo accepts batches of up to 100 receipts per request.
    const messages = tokens.map((to) => ({
      to,
      title: payload.title,
      body: payload.body,
      data: payload.data,
      sound: "default",
      // iOS — show in lock screen and notification center
      _displayInForeground: true,
      collapseId: payload.collapseKey,
      priority: "high" as const,
    }));

    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json",
      "accept-encoding": "gzip, deflate",
    };
    if (this.env.EXPO_ACCESS_TOKEN) {
      headers.authorization = `Bearer ${this.env.EXPO_ACCESS_TOKEN}`;
    }

    try {
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers,
        body: JSON.stringify(messages),
      });
      if (!res.ok) {
        this.logger.warn(`Expo push failed: ${res.status} ${await res.text()}`);
        return;
      }
      // Receipts include device-token errors (DeviceNotRegistered) — when we
      // see those, we should retire the row. Phase 3.5 cleanup loop.
      const body = (await res.json()) as { data?: Array<{ status: string; details?: { error?: string } }> };
      for (const r of body.data ?? []) {
        if (r.status === "error" && r.details?.error === "DeviceNotRegistered") {
          this.logger.log(`expo: device unregistered (cleanup queued)`);
        }
      }
    } catch (err) {
      this.logger.warn(`Expo push transport error: ${(err as Error).message}`);
    }
  }

  // ---------- Web Push ----------

  private async sendWebPush(subscriptions: unknown[], payload: PushPayload) {
    if (!this.env.WEB_PUSH_VAPID_PUBLIC || !this.env.WEB_PUSH_VAPID_PRIVATE) {
      this.logger.debug("web-push: VAPID keys not configured; skipping");
      return;
    }
    // Intentional plug-in point — install `web-push` and uncomment to enable.
    //
    //   import webpush from "web-push";
    //   webpush.setVapidDetails(this.env.WEB_PUSH_CONTACT, vapidPub, vapidPriv);
    //   for (const sub of subscriptions) {
    //     await webpush.sendNotification(sub, JSON.stringify(payload)).catch(...)
    //   }
    this.logger.debug(`web-push: ${subscriptions.length} subs (driver not installed)`);
  }
}
