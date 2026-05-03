import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";
import { initUploadSchema } from "@chatrix/shared/schemas";
import type { SelfUser } from "@chatrix/shared/types";
import { MediaService } from "./media.service";
import { z } from "zod";

const finalizeSchema = z.object({
  blurhash: z.string().max(120).optional(),
  // Captured for voice notes: an array of bar heights (0-1) — typically 60-120 entries.
  waveform: z.array(z.number().min(0).max(1)).max(256).optional(),
});

@Controller("media")
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post("init")
  init(@CurrentUser() me: SelfUser, @Body(new ZodValidationPipe(initUploadSchema)) body: any) {
    return this.media.initUpload(me.id, body);
  }

  @Post(":id/finalize")
  finalize(
    @CurrentUser() me: SelfUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(finalizeSchema)) body: any,
  ) {
    return this.media.finalize(me.id, id, body);
  }
}
