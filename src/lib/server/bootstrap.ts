import { audit, normalizeEmail, createAdmin, hashPassword, MIN_PASSWORD_LENGTH } from "./auth";
import { db } from "./db";
import { scheduleMaintenance } from "./maintenance";
import { runMigrations } from "./migrate";

/**
 * Runs once when the server starts: applies migrations and, if no admin
 * exists yet, creates one from ADMIN_EMAIL / ADMIN_PASSWORD. There is no
 * default account and no public sign-up.
 *
 * Forgotten password: set ADMIN_RESET_PASSWORD=1 together with ADMIN_EMAIL and
 * a new ADMIN_PASSWORD, restart once, sign in, then remove all three.
 */
export async function bootstrap() {
  if (!process.env.DATABASE_URL) {
    console.error("[bootstrap] DATABASE_URL is not set; the app cannot start its database.");
    return;
  }
  try {
    await runMigrations(db());
  } catch (error) {
    console.error("[bootstrap] migration failed", error);
    return;
  }
  scheduleMaintenance();

  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (process.env.ADMIN_RESET_PASSWORD === "1") {
    await resetAdminPassword(email, password);
    return;
  }
  const [{ count }] = (await db()`select count(*)::int as count from admin_users`) as unknown as [{ count: number }];
  if (count > 0) return;
  if (!email || !password) {
    console.warn("[bootstrap] No admin exists. Set ADMIN_EMAIL and ADMIN_PASSWORD, or run `npm run admin:create`.");
    return;
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`[bootstrap] ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters; admin not created.`);
    return;
  }
  await createAdmin(normalizeEmail(email), password);
  console.log(`[bootstrap] Created first admin ${normalizeEmail(email)}. You can now remove ADMIN_PASSWORD.`);
}

async function resetAdminPassword(email: string | undefined, password: string | undefined) {
  if (!email || !password || password.length < MIN_PASSWORD_LENGTH) {
    console.error(`[bootstrap] ADMIN_RESET_PASSWORD needs ADMIN_EMAIL and an ADMIN_PASSWORD of at least ${MIN_PASSWORD_LENGTH} characters.`);
    return;
  }
  const address = normalizeEmail(email);
  const hash = await hashPassword(password);
  // Creates the account as owner if it does not exist; otherwise only the password changes.
  await db()`
    insert into admin_users (email, password_hash, role) values (${address}, ${hash}, 'owner')
    on conflict (email) do update set password_hash = excluded.password_hash`;
  await db()`delete from admin_sessions where user_id = (select id from admin_users where email = ${address})`;
  await audit("system", "بازنشانی گذرواژه از متغیر محیطی", address);
  console.warn(`[bootstrap] Password reset for ${address}. Remove ADMIN_RESET_PASSWORD and ADMIN_PASSWORD now.`);
}
