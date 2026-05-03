import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";
import { createDmSchema } from "@chatrix/shared/schemas";
import type { SelfUser } from "@chatrix/shared/types";
import { ChatsService } from "./chats.service";

@Controller("chats")
@UseGuards(JwtAuthGuard)
export class ChatsController {
  constructor(private readonly chats: ChatsService) {}

  @Get()
  list(
    @CurrentUser() me: SelfUser,
    @Query("archived") archived?: string,
  ) {
    return this.chats.listForUser(me.id, { archived: archived === "true" });
  }

  @Get(":id")
  get(@CurrentUser() me: SelfUser, @Param("id") id: string) {
    return this.chats.loadChat(id, me.id);
  }

  @Post("dm")
  openDm(@CurrentUser() me: SelfUser, @Body(new ZodValidationPipe(createDmSchema)) body: { peerId: string }) {
    return this.chats.openDm(me.id, body.peerId);
  }
}
