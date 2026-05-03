import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";
import { createReportSchema } from "@chatrix/shared/schemas";
import type { SelfUser } from "@chatrix/shared/types";
import { ReportsService } from "./reports.service";

@Controller("reports")
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  create(@CurrentUser() me: SelfUser, @Body(new ZodValidationPipe(createReportSchema)) body: any) {
    return this.reports.create(me.id, body);
  }
}
