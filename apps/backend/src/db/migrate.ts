/**
 * Migration runner — executes db/migrations/*.sql in order, tracking applied
 * versions in a `_migrations` table. Idempotent: re-running is a no-op.
 *
 * Run with: pnpm --filter @chatrix/backend db:migrate
 */
import { Client } from "pg";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const MIGRATIONS_DIR = resolve(__dirname, "../../../../db/migrations");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");

  const client = new Client({ connectionString: url });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version    TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const { rows: applied } = await client.query<{ version: string }>(
    "SELECT version FROM _migrations",
  );
  const appliedSet = new Set(applied.map((r) => r.version));

  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`= skip   ${file}`);
      continue;
    }
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    console.log(`+ apply  ${file}`);
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO _migrations (version) VALUES ($1)", [file]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`✗ failed ${file}:`, err);
      process.exit(1);
    }
  }

  await client.end();
  console.log("✓ migrations up to date");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
