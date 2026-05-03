import { Body, Controller, Headers, Ip, Post, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";
import {
  signupSchema, loginSchema, refreshSchema,
  requestPasswordResetSchema, resetPasswordSchema, verifyEmailSchema,
} from "@chatrix/shared/schemas";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./current-user.decorator";
import { JwtAuthGuard } from "./jwt.guard";
import type { SelfUser } from "@chatrix/shared/types";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("signup")
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  signup(
    @Body(new ZodValidationPipe(signupSchema)) body: any,
    @Headers("user-agent") ua: string,
    @Ip() ip: string,
  ) {
    return this.auth.signup(body, { userAgent: ua, ip });
  }

  @Post("login")
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  login(
    @Body(new ZodValidationPipe(loginSchema)) body: any,
    @Headers("user-agent") ua: string,
    @Ip() ip: string,
  ) {
    return this.auth.login(body, { userAgent: ua, ip });
  }

  @Post("refresh")
  refresh(
    @Body(new ZodValidationPipe(refreshSchema)) body: { refreshToken: string },
    @Headers("user-agent") ua: string,
    @Ip() ip: string,
  ) {
    return this.auth.refresh(body.refreshToken, { userAgent: ua, ip });
  }

  @Post("logout")
  @UseGuards(JwtAuthGuard)
  logout(@Body(new ZodValidationPipe(refreshSchema)) body: { refreshToken: string }) {
    return this.auth.logout(body.refreshToken).then(() => ({ ok: true }));
  }

  @Post("verify-email")
  verifyEmail(@Body(new ZodValidationPipe(verifyEmailSchema)) body: { token: string }) {
    return this.auth.consumeEmailVerificationToken(body.token).then(() => ({ ok: true }));
  }

  @Post("password/forgot")
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  async forgot(@Body(new ZodValidationPipe(requestPasswordResetSchema)) body: { email: string }) {
    // Always return ok to avoid email enumeration. The service short-circuits
    // silently when the address doesn't match an account.
    await this.auth.requestPasswordReset(body.email);
    return { ok: true };
  }

  @Post("password/reset")
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  async reset(@Body(new ZodValidationPipe(resetPasswordSchema)) body: { token: string; password: string }) {
    await this.auth.resetPassword(body.token, body.password);
    return { ok: true };
  }

  /** Resend the verification email — useful when the original was lost. */
  @Post("verify-email/resend")
  @Throttle({ auth: { limit: 3, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  async resendVerify(@CurrentUser() user: SelfUser) {
    if (user.emailVerifiedAt) return { ok: true, alreadyVerified: true };
    await this.auth.queueVerificationEmail(user.id, user.email, user.username);
    return { ok: true };
  }

  @Post("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: SelfUser) {
    return user;
  }
}
