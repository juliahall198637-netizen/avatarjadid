import { z } from "zod";

import { ApiError, json, route } from "@/lib/server/api";
import { audit, requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { saveSettings } from "@/lib/server/settings";

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  await requireAdmin(request);
  return json(await db()`
    select h.id, h.created_at, u.email as created_by
    from settings_history h left join admin_users u on u.id = h.created_by
    order by h.id desc limit 50`);
});

/** Body: { id } — makes that saved version the current settings (itself recorded as a new version). */
export const POST = route(async (request: Request) => {
  const admin = await requireAdmin(request);
  // bigserial ids arrive as strings from the driver.
  const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(await request.json());
  const [row] = await db()`select data, created_at from settings_history where id = ${id}`;
  if (!row) throw new ApiError(404, "not_found", "این نسخه پیدا نشد.");
  const restored = await saveSettings(row.data, admin.id);
  await audit(admin, "بازگردانی تنظیمات", new Date(row.created_at as string).toISOString());
  return json(restored);
});
