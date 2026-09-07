/**
 * Direct database access for end-to-end setup and assertions.
 *
 * Used sparingly and only for what a browser genuinely cannot do: marking an
 * email verified without reading a mailbox, promoting a user to staff, and
 * checking that what the UI claims matches what was actually stored.
 *
 * This talks to PostgreSQL with `pg` rather than the Prisma client, because
 * Playwright transpiles specs to CommonJS and the generated client is ESM
 * (`import.meta`). Raw SQL also keeps the specs from depending on generated
 * code that a schema change would move underneath them.
 */
import { Pool } from 'pg';

/**
 * Created on demand and discarded by `closeDb`.
 *
 * Playwright runs every spec file in one worker process, so a module-level pool
 * is shared between them: if one file's teardown ended it for good, the next
 * file would fail on its first query. Recreating it keeps each file independent.
 */
let pool: Pool | null = null;

function getPool(): Pool {
  pool ??= new Pool({
    connectionString:
      process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/resellsnap',
    max: 4,
  });
  return pool;
}

export async function query<T = Record<string, unknown>>(
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query(text, values);
  return result.rows as T[];
}

async function one<T = Record<string, unknown>>(text: string, values: unknown[] = []): Promise<T> {
  const rows = await query<T>(text, values);
  if (rows.length === 0) throw new Error(`Expected a row from: ${text}`);
  return rows[0] as T;
}

export async function closeDb(): Promise<void> {
  const current = pool;
  pool = null;
  await current?.end();
}

/**
 * Better Auth sends a verification email on sign-up; the console provider just
 * logs it. Flipping the flag is the browser-free equivalent of clicking the
 * link, and keeps the specs about the product rather than about email.
 */
export async function verifyEmail(email: string): Promise<void> {
  await query('UPDATE "user" SET "emailVerified" = true WHERE email = $1', [email]);
}

export async function promoteToRole(
  email: string,
  role: 'SUPPORT' | 'ADMIN' | 'SUPER_ADMIN',
): Promise<void> {
  await query('UPDATE "user" SET role = $2::"Role" WHERE email = $1', [email, role]);
}

export async function workspaceIdFor(email: string): Promise<string> {
  const row = await one<{ workspaceId: string }>(
    `SELECT m."workspaceId"
       FROM "workspace_member" m
       JOIN "user" u ON u.id = m."userId"
      WHERE u.email = $1
      ORDER BY m."createdAt" ASC
      LIMIT 1`,
    [email],
  );
  return row.workspaceId;
}

export async function creditBalance(email: string): Promise<number> {
  const workspaceId = await workspaceIdFor(email);
  const row = await one<{ monthlyCredits: number; purchasedCredits: number }>(
    'SELECT "monthlyCredits", "purchasedCredits" FROM "workspace" WHERE id = $1',
    [workspaceId],
  );
  return Number(row.monthlyCredits) + Number(row.purchasedCredits);
}

export async function countRows(sql: string, values: unknown[] = []): Promise<number> {
  const row = await one<{ count: string }>(sql, values);
  return Number(row.count);
}

/** Removes a test user and everything that cascades from their workspace. */
export async function destroyUser(email: string): Promise<void> {
  await query(
    `DELETE FROM "workspace"
      WHERE id IN (
        SELECT m."workspaceId" FROM "workspace_member" m
        JOIN "user" u ON u.id = m."userId"
        WHERE u.email = $1
      )`,
    [email],
  );
  await query('DELETE FROM "user" WHERE email = $1', [email]);
}

export async function userIdFor(email: string): Promise<string> {
  const [row] = await query<{ id: string }>('SELECT id FROM "user" WHERE email = $1', [email]);
  if (!row) throw new Error(`No user with email ${email}`);
  return row.id;
}

/**
 * Puts a workspace on a paid plan, for the features gated behind one.
 *
 * Goes through the same subscription row Stripe's webhooks write, so the
 * entitlement is resolved by the real code path rather than a test-only flag.
 */
export async function setPlan(email: string, planKey: string): Promise<void> {
  const workspaceId = await workspaceIdFor(email);
  await query(
    `UPDATE "subscription"
        SET "planId" = (SELECT id FROM "plan" WHERE key = $2),
            status = 'ACTIVE'
      WHERE "workspaceId" = $1`,
    [workspaceId, planKey],
  );
}
