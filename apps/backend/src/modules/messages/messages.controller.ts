import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";
import {
  sendMessageSchema, editMessageSchema, deleteMessageSchema, reactionSchema,
} from "@chatrix/shared/schemas";
import type { SelfUser } from "@chatrix/shared/types";
import { MessagesService } from "./messages.service";
import { z } from "zod";

const markReadSchema = z.object({
  chatId: z.string().uuid(),
  lastReadMessageId: z.string().uuid(),
});

@Controller("messages")
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get("chat/:chatId")
  list(
    @CurrentUser() me: SelfUser,
    @Param("chatId") chatId: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.messages.listForChat(me.id, chatId, cursor, limit ? parseInt(limit, 10) : 50);
  }

  @Post()
  send(@CurrentUser() me: SelfUser, @Body(new ZodValidationPipe(sendMessageSchema)) body: any) {
    return this.messages.send(me.id, body);
  }

  @Patch(":id")
  edit(
    @CurrentUser() me: SelfUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(editMessageSchema)) body: any,
  ) {
    return this.messages.edit(me.id, id, body.body);
  }

  @Delete(":id")
  async deleteMessage(
    @CurrentUser() me: SelfUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(deleteMessageSchema.partial({ messageId: true }).extend({
      scope: deleteMessageSchema.shape.scope,
    }))) body: { scope: "me" | "everyone" },
  ) {
    if (body.scope === "everyone") {
      await this.messages.deleteForEveryone(me.id, id);
    }
    // "me" scope is handled client-side — server keeps the row.
    return { ok: true };
  }

  @Post(":id/reactions")
  addReaction(
    @CurrentUser() me: SelfUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(reactionSchema.omit({ messageId: true }))) body: { emoji: string },
  ) {
    return this.messages.toggleReaction(me.id, id, body.emoji, "add").then(() => ({ ok: true }));
  }

  @Delete(":id/reactions")
  removeReaction(
    @CurrentUser() me: SelfUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(reactionSchema.omit({ messageId: true }))) body: { emoji: string },
  ) {
    return this.messages.toggleReaction(me.id, id, body.emoji, "remove").then(() => ({ ok: true }));
  }

  @Post("mark-read")
  markRead(
    @CurrentUser() me: SelfUser,
    @Body(new ZodValidationPipe(markReadSchema)) body: { chatId: string; lastReadMessageId: string },
  ) {
    return this.messages.markRead(me.id, body.chatId, body.lastReadMessageId).then(() => ({ ok: true }));
  }
}
