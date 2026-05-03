import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from "@nestjs/common";
import { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import { Env } from "../config/env";

/**
 * Thin Postgres wrapper. We deliberately don't pull in an ORM:
 *   - SQL is the highest-leverage tool for the job
 *   - the chat hot-path needs hand-tuned queries
 *   - migrations are versioned plain SQL files (db/migrations)
 *
 * This service exposes:
 *   - query<T>(sql, params)         — single statement
 *   - tx<T>(fn)                      — transaction wrapper
 *   - one / oneOrNull / many         — typed accessors
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool!: Pool;

  constructor(private readonly env: Env) {}

  async onModuleInit() {
    this.pool = new Pool({
      connectionString: this.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      // Switch to ssl when running against managed Postgres (Supabase, Neon, RDS).
      ssl: this.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
    });

    // Fail fast if Postgres is unreachable.
    const client = await this.pool.connect();
    try {
      const { rows } = await client.query<{ now: Date }>("SELECT now()");
      this.logger.log(`Postgres connected — server time ${rows[0]?.now.toISOString()}`);
    } finally {
      client.release();
    }
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }

  /** Raw query. Prefer the typed helpers below for new code. */
  async query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params: unknown[] = [],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(sql, params);
  }

  /** Returns the first row or throws. */
  async one<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T> {
    const { rows } = await this.query<T>(sql, params);
    if (!rows[0]) throw new Error("Query returned no rows");
    return rows[0];
  }

  /** Returns the first row or null. */
  async oneOrNull<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T | null> {
    const { rows } = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  /** Returns all rows. */
  async many<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
    const { rows } = await this.query<T>(sql, params);
    return rows;
  }

  /**
   * Transaction wrapper. Auto-commits on success, rolls back on throw.
   * The callback receives a single client — pass it through to nested calls.
   */
  async tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
