import { json, route } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  await requireAdmin(request);
  return json(await db()`select actor, action, target, created_at from admin_audit order by id desc limit 150`);
});
