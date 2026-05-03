import { Body, Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { AdminGuard } from "./admin.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";
import type { SelfUser } from "@chatrix/shared/types";
import { ChatrixError, ErrorCode } from "@chatrix/shared/errors";
import { AdminService } from "./admin.service";
import { z } from "zod";

const setStatusSchema = z.object({
  status: z.enum(["active", "suspended", "banned"]),
  reason: z.string().max(500).optional(),
});

const setRoleSchema = z.object({
  role: z.enum(["user", "moderator", "admin"]),
});

const reportActionSchema = z.object({
  status: z.enum(["reviewing", "actioned", "dismissed"]),
  resolution: z.string().max(2000).optional(),
});

/**
 * All routes here require role >= moderator (enforced by AdminGuard).
 * Admin-only operations (role changes, hard bans) layer additional checks
 * inside the service.
 */
@Controller("admin")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  // ----- Dashboard stats -----

  @Get("stats")
  stats() {
    return this.admin.stats();
  }

  // ----- Users -----

  @Get("users")
  listUsers(
    @Query("q") q?: string,
    @Query("status") status?: "active" | "suspended" | "banned",
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.admin.listUsers({
      q,
      status,
      cursor,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  @Get("users/:id")
  getUser(@Param("id") id: string) {
    return this.admin.getUser(id);
  }

  @Patch("users/:id/status")
  setStatus(
    @CurrentUser() me: SelfUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(setStatusSchema)) body: any,
  ) {
    return this.admin.setUserStatus(me.id, id, body.status, body.reason)
      .then(() => ({ ok: true }));
  }

  @Patch("users/:id/role")
  setRole(
    @CurrentUser() me: SelfUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(setRoleSchema)) body: any,
  ) {
    if (me.role !== "admin") {
      // Role changes are admin-only — moderators can ban but not promote.
      throw new ChatrixError(ErrorCode.FORBIDDEN, "Admin role required to change roles.", 403);
    }
    return this.admin.setUserRole(me.id, id, body.role).then(() => ({ ok: true }));
  }

  // ----- Reports -----

  @Get("reports")
  listReports(
    @Query("status") status?: "open" | "reviewing" | "actioned" | "dismissed",
    @Query("limit") limit?: string,
  ) {
    return this.admin.listReports({
      status,
      limit: limit ? parseInt(limit, 10) : 100,
    });
  }

  @Patch("reports/:id")
  setReportStatus(
    @CurrentUser() me: SelfUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(reportActionSchema)) body: any,
  ) {
    return this.admin.setReportStatus(me.id, id, body.status, body.resolution);
  }

  // ----- Audit log -----

  @Get("audit")
  listAudit(@Query("cursor") cursor?: string, @Query("limit") limit?: string) {
    return this.admin.listAudit({
      cursor,
      limit: limit ? parseInt(limit, 10) : 100,
    });
  }
}
