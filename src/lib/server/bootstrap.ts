import { normalizeEmail, createAdmin, MIN_PASSWORD_LENGTH } from "./auth";
import { db } from "./db";
import { scheduleMaintenance } from "./maintenance";
import { runMigrations } from "./migrate";

/**
 * Runs once when the server starts: applies migrations and, if no admin
 * exists yet, creates one from ADMIN_EMAIL / ADMIN_PASSWORD. There is no
 * default account and no public sign-up.
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
