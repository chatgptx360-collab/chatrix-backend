import { describe, it, expect, beforeEach, vi } from "vitest";
import { JwtService } from "@nestjs/jwt";
import { createHash } from "node:crypto";
import { TokenService } from "./token.service";
import type { DatabaseService } from "../../db/database.service";
import type { Env } from "../../config/env";

/**
 * Token rotation is the single most security-critical bit of code in the
 * service. These tests exercise:
 *
 *   - rotateRefreshToken() returns null for unknown tokens
 *   - it returns null AND revokes-all if a previously-revoked token is replayed
 *   - it returns null for expired tokens
 *   - happy path marks the row revoked exactly once
 *
 * We use a tiny in-memory fake instead of a real DB so the suite runs in
 * milliseconds. The contract surface is small enough that a fake is honest.
 */

const env = {
  JWT_ACCESS_SECRET: "x".repeat(64),
  JWT_REFRESH_SECRET: "y".repeat(64),
  JWT_ACCESS_TTL: "15m",
  JWT_REFRESH_TTL: "30d",
} as unknown as Env;

interface Row {
  id: string;
  user_id: string;
  refresh_token_hash: string;
  revoked_at: Date | null;
  expires_at: Date;
}

function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

function makeFakeDb(rows: Row[]): DatabaseService {
  return {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      // We only need to handle the queries TokenService actually issues.
      if (/UPDATE sessions SET revoked_at = now\(\) WHERE id = \$1/.test(sql)) {
        const r = rows.find((x) => x.id === params[0]);
        if (r && !r.revoked_at) r.revoked_at = new Date();
        return { rows: [], rowCount: r ? 1 : 0 };
      }
      if (/UPDATE sessions SET revoked_at = now\(\) WHERE user_id = \$1$/.test(sql)) {
        let count = 0;
        for (const r of rows) {
          if (r.user_id === params[0] && !r.revoked_at) {
            r.revoked_at = new Date();
            count++;
          }
        }
        return { rows: [], rowCount: count };
      }
      if (/INSERT INTO sessions/.test(sql)) {
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unmocked SQL: ${sql}`);
    }) as unknown as DatabaseService["query"],

    oneOrNull: vi.fn(async (_sql: string, params: unknown[] = []) => {
      const hash = params[0] as string;
      return rows.find((r) => r.refresh_token_hash === hash) ?? null;
    }) as unknown as DatabaseService["oneOrNull"],

    one:    vi.fn() as unknown as DatabaseService["one"],
    many:   vi.fn() as unknown as DatabaseService["many"],
    tx:     vi.fn() as unknown as DatabaseService["tx"],
  } as unknown as DatabaseService;
}

describe("TokenService.rotateRefreshToken", () => {
  let db: DatabaseService;
  let rows: Row[];
  let svc: TokenService;

  beforeEach(() => {
    rows = [];
    db = makeFakeDb(rows);
    svc = new TokenService(new JwtService({ secret: env.JWT_ACCESS_SECRET }), db, env);
  });

  it("returns null for an unknown refresh token", async () => {
    const result = await svc.rotateRefreshToken("never-issued", {});
    expect(result).toBeNull();
  });

  it("returns the session and revokes its row on the happy path", async () => {
    const token = "valid-token-aaaa";
    const row: Row = {
      id: "sess-1", user_id: "user-1",
      refresh_token_hash: sha256(token),
      revoked_at: null,
      expires_at: new Date(Date.now() + 60_000),
    };
    rows.push(row);

    const result = await svc.rotateRefreshToken(token, {});
    expect(result).not.toBeNull();
    expect(result!.user_id).toBe("user-1");
    expect(row.revoked_at).not.toBeNull();
  });

  it("returns null for expired tokens", async () => {
    const token = "valid-but-expired";
    rows.push({
      id: "sess-2", user_id: "user-2",
      refresh_token_hash: sha256(token),
      revoked_at: null,
      expires_at: new Date(Date.now() - 60_000),
    });
    const result = await svc.rotateRefreshToken(token, {});
    expect(result).toBeNull();
  });

  it("revokes ALL of the user's sessions when a revoked token is replayed (reuse detection)", async () => {
    const replayed = "replayed-token";
    rows.push({
      id: "sess-3a", user_id: "user-3",
      refresh_token_hash: sha256(replayed),
      revoked_at: new Date(Date.now() - 10_000),  // already revoked
      expires_at: new Date(Date.now() + 60_000),
    });
    rows.push({
      id: "sess-3b", user_id: "user-3",
      refresh_token_hash: sha256("other-active-token"),
      revoked_at: null,
      expires_at: new Date(Date.now() + 60_000),
    });

    const result = await svc.rotateRefreshToken(replayed, {});
    expect(result).toBeNull();
    expect(rows.find((r) => r.id === "sess-3b")!.revoked_at).not.toBeNull();
  });
});
