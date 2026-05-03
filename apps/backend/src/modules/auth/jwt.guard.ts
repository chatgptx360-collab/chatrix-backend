import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { ChatrixError, ErrorCode } from "@chatrix/shared/errors";
import { TokenService } from "./token.service";
import { AuthService } from "./auth.service";

/**
 * Validates Bearer access tokens, hydrates `req.user` with the SelfUser
 * projection so controllers can `@CurrentUser() user: SelfUser`.
 *
 * Hydration adds one read per request; cache the SelfUser in Redis if
 * this becomes a hot path (it usually doesn't — most requests are messages).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly auth: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string>; user?: unknown }>();
    const authz = req.headers["authorization"] ?? "";
    const [scheme, token] = authz.split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token) {
      throw new ChatrixError(ErrorCode.UNAUTHORIZED, "Missing access token.", 401);
    }
    let claims;
    try {
      claims = this.tokens.verifyAccess(token);
    } catch {
      throw new ChatrixError(ErrorCode.AUTH_TOKEN_INVALID, "Invalid or expired access token.", 401);
    }
    req.user = await this.auth.loadSelf(claims.sub);
    return true;
  }
}
