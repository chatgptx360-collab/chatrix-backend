import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { createHash } from "node:crypto";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { SelfUser } from "@chatrix/shared/types";
import { SessionsService } from "./sessions.service";

/**
 * The client passes its refresh token in the body (POST /sessions:list and
 * POST /sessions/revoke-others) so we can mark the current row and avoid
 * killing the active connection on revoke-others.
 *
 * GET /sessions returns the same list without the current marker — fine for
 * read-only displays where the client doesn't need to know which row is "us".
 */
@Controller("sessions")
@UseGuards(JwtAuthGuard)
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get()
  list(@CurrentUser() me: SelfUser) {
    return this.sessions.list(me.id, null);
  }

  @Post("with-current")
  listWithCurrent(@CurrentUser() me: SelfUser, @Body() body: { refreshToken?: string }) {
    return this.sessions.list(me.id, body.refreshToken ? sha256(body.refreshToken) : null);
  }

  @Delete(":id")
  revoke(@CurrentUser() me: SelfUser, @Param("id") id: string) {
    return this.sessions.revoke(me.id, id).then(() => ({ ok: true }));
  }

  @Post("revoke-others")
  revokeOthers(@CurrentUser() me: SelfUser, @Body() body: { refreshToken: string }) {
    return this.sessions.revokeOthers(me.id, sha256(body.refreshToken))
      .then((revokedCount) => ({ ok: true, revokedCount }));
  }
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
