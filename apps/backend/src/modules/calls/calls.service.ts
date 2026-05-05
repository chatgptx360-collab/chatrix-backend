import { Injectable, Logger } from "@nestjs/common";
import { ChatrixError, ErrorCode } from "@chatrix/shared/errors";
import type { Call, CallKind, CallStatus, UUID, CursorPage, PublicUser } from "@chatrix/shared/types";
import { DatabaseService } from "../../db/database.service";

/**
 * Call state-machine + history.
 *
 * The realtime gateway owns the *transport* (which socket to relay an SDP
 * to); this service owns the durable record and the legal-transition rules.
 *
 * Transition table (anything outside this throws CALL_INVALID_STATE):
 *
 *   ringing  → answered          (accept)
 *   ringing  → declined          (reject)
 *   ringing  → cancelled         (caller hangs up before pickup)
 *   ringing  → missed            (ring timeout)
 *   answered → ended             (normal hangup)
 *   *        → failed            (transport error)
 */

interface CallRow {
  id: UUID;
  chat_id: UUID | null;
  caller_id: UUID;
  callee_id: UUID;
  kind: CallKind;
  status: CallStatus;
  started_at: Date;
  answered_at: Date | null;
  ended_at: Date | null;
  duration_ms: number | null;
}

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  constructor(private readonly db: DatabaseService) {}

  /** Create a 'ringing' call row. */
  async create(args: {
    callerId: UUID;
    calleeId: UUID;
    kind: CallKind;
    chatId?: UUID | null;
  }): Promise<Call> {
    if (args.callerId === args.calleeId) {
      throw new ChatrixError(ErrorCode.CALL_SELF_INVITE, "You can't call yourself.", 400);
    }

    // Fast-path busy check — if either side is already in a live call, we
    // refuse rather than create a doomed second invite.
    const busy = await this.db.oneOrNull<{ id: UUID }>(
      `SELECT id FROM calls
        WHERE status IN ('ringing', 'answered')
          AND (caller_id = $1 OR callee_id = $1 OR caller_id = $2 OR callee_id = $2)
        LIMIT 1`,
      [args.callerId, args.calleeId],
    );
    if (busy) {
      throw new ChatrixError(ErrorCode.CALL_PEER_BUSY, "One of you is already on a call.", 409);
    }

    const row = await this.db.one<CallRow>(
      `INSERT INTO calls (caller_id, callee_id, kind, chat_id, status)
       VALUES ($1, $2, $3, $4, 'ringing')
       RETURNING *`,
      [args.callerId, args.calleeId, args.kind, args.chatId ?? null],
    );
    return rowToWire(row);
  }

  /**
   * Mark a call as answered. Only the callee may accept, and only while
   * the call is still ringing.
   */
  async accept(callId: UUID, byUserId: UUID): Promise<Call> {
    const row = await this.findOrThrow(callId);
    this.assertParticipant(row, byUserId);
    if (byUserId !== row.callee_id) {
      throw new ChatrixError(ErrorCode.CALL_NOT_PARTICIPANT, "Only the callee can accept.", 403);
    }
    if (row.status !== "ringing") {
      throw new ChatrixError(ErrorCode.CALL_INVALID_STATE, `Cannot accept a call in state '${row.status}'.`, 409);
    }
    const updated = await this.db.one<CallRow>(
      `UPDATE calls SET status = 'answered', answered_at = now()
        WHERE id = $1 RETURNING *`,
      [callId],
    );
    return rowToWire(updated);
  }

  /** Decline a ringing invite (callee only). */
  async reject(callId: UUID, byUserId: UUID): Promise<Call> {
    return this.terminateRinging(callId, byUserId, "declined", { mustBeCallee: true });
  }

  /** Caller hangs up before the callee picks up. */
  async cancel(callId: UUID, byUserId: UUID): Promise<Call> {
    return this.terminateRinging(callId, byUserId, "cancelled", { mustBeCaller: true });
  }

  /** Ring-timeout fired without an answer. */
  async miss(callId: UUID): Promise<Call> {
    const row = await this.findOrThrow(callId);
    if (row.status !== "ringing") return rowToWire(row);
    const updated = await this.db.one<CallRow>(
      `UPDATE calls SET status = 'missed', ended_at = now() WHERE id = $1 RETURNING *`,
      [callId],
    );
    return rowToWire(updated);
  }

  /**
   * Normal hangup *after* pickup. Either side can call this.
   * Returns the updated call so the caller can compute duration.
   */
  async end(callId: UUID, byUserId: UUID): Promise<Call> {
    const row = await this.findOrThrow(callId);
    this.assertParticipant(row, byUserId);
    if (row.status === "ended" || row.status === "failed" || row.status === "missed"
       || row.status === "cancelled" || row.status === "declined") {
      return rowToWire(row);
    }
    if (row.status === "ringing") {
      // The "ending" side is actually cancelling/declining depending on role.
      return byUserId === row.caller_id
        ? this.terminateRinging(callId, byUserId, "cancelled", { mustBeCaller: true })
        : this.terminateRinging(callId, byUserId, "declined",  { mustBeCallee: true });
    }
    // status === 'answered'
    const updated = await this.db.one<CallRow>(
      `UPDATE calls
          SET status      = 'ended',
              ended_at    = now(),
              duration_ms = EXTRACT(EPOCH FROM (now() - answered_at))::int * 1000
        WHERE id = $1
        RETURNING *`,
      [callId],
    );
    return rowToWire(updated);
  }

  /** Mark a call as failed (signalling error). */
  async fail(callId: UUID): Promise<Call> {
    const row = await this.findOrThrow(callId);
    if (row.status === "ended" || row.status === "failed") return rowToWire(row);
    const updated = await this.db.one<CallRow>(
      `UPDATE calls
          SET status      = 'failed',
              ended_at    = now(),
              duration_ms = CASE
                              WHEN answered_at IS NOT NULL
                              THEN EXTRACT(EPOCH FROM (now() - answered_at))::int * 1000
                              ELSE NULL
                            END
        WHERE id = $1
        RETURNING *`,
      [callId],
    );
    return rowToWire(updated);
  }

  /** Call history for a user (paginated). Joins both peers as PublicUser. */
  async history(userId: UUID, opts: { cursor?: string | null; limit?: number } = {}): Promise<CursorPage<Call>> {
    const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
    const cursor = opts.cursor ? new Date(opts.cursor) : null;

    const rows = await this.db.many<
      CallRow & {
        caller_username: string; caller_display: string | null; caller_avatar: string | null;
        callee_username: string; callee_display: string | null; callee_avatar: string | null;
      }
    >(
      `SELECT c.*,
              cu.username      AS caller_username,
              cup.display_name AS caller_display,
              cup.avatar_url   AS caller_avatar,
              eu.username      AS callee_username,
              eup.display_name AS callee_display,
              eup.avatar_url   AS callee_avatar
         FROM calls c
         JOIN users cu     ON cu.id  = c.caller_id
         JOIN profiles cup ON cup.user_id = c.caller_id
         JOIN users eu     ON eu.id  = c.callee_id
         JOIN profiles eup ON eup.user_id = c.callee_id
        WHERE (c.caller_id = $1 OR c.callee_id = $1)
          AND ($2::timestamptz IS NULL OR c.started_at < $2)
        ORDER BY c.started_at DESC
        LIMIT $3 + 1`,
      [userId, cursor, limit],
    );

    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;
    const items = sliced.map((r) => ({
      ...rowToWire(r),
      caller: {
        id: r.caller_id, username: r.caller_username, displayName: r.caller_display,
        avatarUrl: r.caller_avatar, bio: null, presence: "offline" as const, lastSeenAt: null,
      } satisfies PublicUser,
      callee: {
        id: r.callee_id, username: r.callee_username, displayName: r.callee_display,
        avatarUrl: r.callee_avatar, bio: null, presence: "offline" as const, lastSeenAt: null,
      } satisfies PublicUser,
    }));
    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]!.startedAt : null,
      hasMore,
    };
  }

  /** Lookup a single call. Used by the gateway to resolve relay targets. */
  async findById(callId: UUID): Promise<Call | null> {
    const row = await this.db.oneOrNull<CallRow>(`SELECT * FROM calls WHERE id = $1`, [callId]);
    return row ? rowToWire(row) : null;
  }

  // ---------- Internals ----------

  private async findOrThrow(callId: UUID): Promise<CallRow> {
    const row = await this.db.oneOrNull<CallRow>(`SELECT * FROM calls WHERE id = $1`, [callId]);
    if (!row) throw new ChatrixError(ErrorCode.CALL_NOT_FOUND, "Call not found.", 404);
    return row;
  }

  private assertParticipant(row: CallRow, userId: UUID) {
    if (row.caller_id !== userId && row.callee_id !== userId) {
      throw new ChatrixError(ErrorCode.CALL_NOT_PARTICIPANT, "Not a participant.", 403);
    }
  }

  private async terminateRinging(
    callId: UUID,
    byUserId: UUID,
    target: "declined" | "cancelled",
    role: { mustBeCallee?: boolean; mustBeCaller?: boolean },
  ): Promise<Call> {
    const row = await this.findOrThrow(callId);
    this.assertParticipant(row, byUserId);
    if (role.mustBeCallee && byUserId !== row.callee_id) {
      throw new ChatrixError(ErrorCode.CALL_NOT_PARTICIPANT, "Only the callee can do this.", 403);
    }
    if (role.mustBeCaller && byUserId !== row.caller_id) {
      throw new ChatrixError(ErrorCode.CALL_NOT_PARTICIPANT, "Only the caller can do this.", 403);
    }
    if (row.status !== "ringing") {
      throw new ChatrixError(ErrorCode.CALL_INVALID_STATE, `Call is in state '${row.status}'.`, 409);
    }
    const updated = await this.db.one<CallRow>(
      `UPDATE calls SET status = $2, ended_at = now() WHERE id = $1 RETURNING *`,
      [callId, target],
    );
    return rowToWire(updated);
  }
}

// ---------- Mappers ----------

function rowToWire(r: CallRow): Call {
  return {
    id: r.id,
    chatId: r.chat_id,
    callerId: r.caller_id,
    calleeId: r.callee_id,
    kind: r.kind,
    status: r.status,
    startedAt: r.started_at.toISOString(),
    answeredAt: r.answered_at?.toISOString() ?? null,
    endedAt: r.ended_at?.toISOString() ?? null,
    durationMs: r.duration_ms,
  };
}
