import { db } from "./db";
import { getSettings } from "./settings";

/**
 * Hourly housekeeping: enforces the conversation retention period and trims
 * logs that only matter short-term. Safe to run from several instances.
 */
export async function runMaintenance() {
  const sql = db();
  const { privacy } = await getSettings();
  if (privacy.retentionDays > 0) {
    await sql`delete from conversations where last_activity_at < now() - make_interval(days => ${privacy.retentionDays})`;
  }
  await sql`delete from provider_events where created_at < now() - interval '30 days'`;
  await sql`delete from rate_limits where window_start < now() - interval '2 days'`;
  await sql`delete from admin_sessions where expires_at < now()`;
  await sql`delete from admin_audit where created_at < now() - interval '365 days'`;
  // Avatar images no longer referenced by the current settings or any saved version.
  await sql`
    delete from assets a where a.created_at < now() - interval '1 day'
      and not exists (select 1 from app_settings s where s.data::text like '%' || a.id::text || '%')
      and not exists (select 1 from settings_history h where h.data::text like '%' || a.id::text || '%')`;
}

export function scheduleMaintenance() {
  const run = () => runMaintenance().catch((error) => console.error("[maintenance]", error));
  setTimeout(run, 30_000).unref();
  setInterval(run, 3_600_000).unref();
}
