import { Controller, Get, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { SelfUser } from "@chatrix/shared/types";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() me: SelfUser) {
    return this.notifications.listForUser(me.id);
  }

  @Post("read-all")
  readAll(@CurrentUser() me: SelfUser) {
    return this.notifications.markAllRead(me.id).then(() => ({ ok: true }));
  }
}
