import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { SelfUser } from "@chatrix/shared/types";

/**
 * Pulls the hydrated SelfUser placed on the request by JwtAuthGuard.
 * If the controller forgets to apply the guard, this returns undefined,
 * which is preferable to throwing here (single source of truth = the guard).
 */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): SelfUser =>
    ctx.switchToHttp().getRequest<{ user: SelfUser }>().user,
);
