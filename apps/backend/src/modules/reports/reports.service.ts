import { Injectable } from "@nestjs/common";
import type { UUID } from "@chatrix/shared/types";
import { DatabaseService } from "../../db/database.service";

@Injectable()
export class ReportsService {
  constructor(private readonly db: DatabaseService) {}

  async create(reporterId: UUID, input: {
    targetKind: "user" | "message" | "chat";
    targetId: UUID;
    reason: string;
    details?: string;
  }) {
    const row = await this.db.one<any>(
      `INSERT INTO reports (reporter_id, target_kind, target_id, reason, details)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, status, created_at`,
      [reporterId, input.targetKind, input.targetId, input.reason, input.details ?? null],
    );
    return { id: row.id, status: row.status, createdAt: row.created_at.toISOString() };
  }
}
