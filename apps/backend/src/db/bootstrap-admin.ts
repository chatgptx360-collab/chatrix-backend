/**
 * Promote ADMIN_BOOTSTRAP_EMAIL to role=admin. Run once after the first user
 * has signed up:
 *
 *   pnpm --filter @chatrix/backend exec tsx src/db/bootstrap-admin.ts
 *
 * Idempotent: rerunning is a no-op. Will not create the user — it must already
 * exist via normal signup so the password is known.
 */
import { Client } from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL;
  if (!url) throw new Error("DATABASE_URL not set");
  if (!email) throw new Error("ADMIN_BOOTSTRAP_EMAIL not set");

  const client = new Client({ connectionString: url });
  await client.connect();

  const { rows } = await client.query<{ id: string; username: string; role: string }>(
    `UPDATE users SET role = 'admin'
       WHERE email = $1 AND deleted_at IS NULL
   RETURNING id, username, role`,
    [email],
  );

  if (rows.length === 0) {
    console.error(`✗ no active user found with email=${email}. Sign up first, then re-run.`);
    process.exit(1);
  }
  console.log(`✓ promoted @${rows[0]!.username} (id=${rows[0]!.id}) to ${rows[0]!.role}`);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
