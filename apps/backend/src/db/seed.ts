/**
 * Optional dev seed. Idempotent — safe to re-run.
 *
 * Currently only creates the admin role enum guard; user creation goes through
 * the normal signup flow so password hashes match the live argon2 cost params.
 *
 * Run: pnpm --filter @chatrix/backend db:seed
 */
import { Client } from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const client = new Client({ connectionString: url });
  await client.connect();

  // Reserved system handles. Future: bot accounts (@chatrix-help, @system).
  await client.query(`
    CREATE TABLE IF NOT EXISTS reserved_usernames (
      username CITEXT PRIMARY KEY,
      reason   TEXT
    )
  `);

  const reserved: Array<[string, string]> = [
    ["chatrix",      "brand"],
    ["admin",        "system"],
    ["support",      "system"],
    ["help",         "system"],
    ["system",       "system"],
    ["root",         "system"],
    ["security",     "system"],
    ["abuse",        "system"],
    ["moderator",    "system"],
    ["mod",          "system"],
    ["staff",        "system"],
  ];
  for (const [u, r] of reserved) {
    await client.query(
      `INSERT INTO reserved_usernames (username, reason) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [u, r],
    );
  }
  console.log(`✓ seeded ${reserved.length} reserved usernames`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
