import { Body, Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";
import { updateProfileSchema } from "@chatrix/shared/schemas";
import type { SelfUser } from "@chatrix/shared/types";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { UsersService } from "./users.service";
import { AuthService } from "../auth/auth.service";

@Controller("users")
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly auth: AuthService,
  ) {}

  @Get("search")
  search(@Query("q") q: string) {
    return this.users.search(q ?? "");
  }

  @Get("@:username")
  byUsername(@Param("username") username: string, @CurrentUser() me: SelfUser) {
    return this.users.getByUsername(username, me?.id);
  }

  @Patch("me")
  async updateMe(
    @CurrentUser() me: SelfUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) patch: any,
  ) {
    await this.users.updateProfile(me.id, patch);
    return this.auth.loadSelf(me.id);
  }
}
