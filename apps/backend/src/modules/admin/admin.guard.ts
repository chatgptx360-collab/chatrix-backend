import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { ChatrixError, ErrorCode } from "@chatrix/shared/errors";
import type { SelfUser } from "@chatrix/shared/types";

/**
 * Stack on top of JwtAuthGuard. Allows `admin` (and optionally `moderator`).
 *   @UseGuards(JwtAuthGuard, AdminGuard)
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const user = ctx.switchToHttp().getRequest<{ user: SelfUser | undefined }>().user;
    if (!user || (user.role !== "admin" && user.role !== "moderator")) {
      throw new ChatrixError(ErrorCode.FORBIDDEN, "Admin access required.", 403);
    }
    return true;
  }
}
