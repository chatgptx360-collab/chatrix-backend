import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { Env } from "../../config/env";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { TokenService } from "./token.service";
import { PasswordService } from "./password.service";
import { JwtAuthGuard } from "./jwt.guard";

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [Env],
      useFactory: (env: Env) => ({
        secret: env.JWT_ACCESS_SECRET,
        signOptions: { expiresIn: env.JWT_ACCESS_TTL },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService, PasswordService, JwtAuthGuard],
  exports: [JwtAuthGuard, TokenService, AuthService],
})
export class AuthModule {}
