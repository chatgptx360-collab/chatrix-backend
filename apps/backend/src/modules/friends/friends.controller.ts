import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";
import { friendActionSchema } from "@chatrix/shared/schemas";
import type { SelfUser } from "@chatrix/shared/types";
import { FriendsService } from "./friends.service";

@Controller("friends")
@UseGuards(JwtAuthGuard)
export class FriendsController {
  constructor(private readonly friends: FriendsService) {}

  @Get()
  list(@CurrentUser() me: SelfUser) {
    return this.friends.listFriends(me.id);
  }

  @Get("pending")
  listPending(@CurrentUser() me: SelfUser) {
    return this.friends.listPendingRequests(me.id);
  }

  @Post("request")
  request(@CurrentUser() me: SelfUser, @Body(new ZodValidationPipe(friendActionSchema)) body: { userId: string }) {
    return this.friends.sendRequest(me.id, body.userId);
  }

  @Post("accept")
  accept(@CurrentUser() me: SelfUser, @Body(new ZodValidationPipe(friendActionSchema)) body: { userId: string }) {
    return this.friends.respond(me.id, body.userId, true);
  }

  @Post("decline")
  decline(@CurrentUser() me: SelfUser, @Body(new ZodValidationPipe(friendActionSchema)) body: { userId: string }) {
    return this.friends.respond(me.id, body.userId, false);
  }

  @Post("block/:userId")
  block(@CurrentUser() me: SelfUser, @Param("userId") userId: string) {
    return this.friends.block(me.id, userId).then(() => ({ ok: true }));
  }

  @Delete("block/:userId")
  unblock(@CurrentUser() me: SelfUser, @Param("userId") userId: string) {
    return this.friends.unblock(me.id, userId).then(() => ({ ok: true }));
  }
}
