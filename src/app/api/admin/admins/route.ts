import { z } from "zod";

import { json, route } from "@/lib/server/api";
import { audit, createAdmin, requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  await requireAdmin(request);
  return json(await db()`select id, email, role, created_at, last_login_at from admin_users order by created_at`);
});

export const POST = route(async (request: Request) => {
  const admin = await requireAdmin(request);
  const { email, password, role } = z
    .object({ email: z.string().trim().email().max(200), password: z.string().max(200), role: z.enum(["owner", "operator"]).default("owner") })
    .parse(await request.json());
  const created = await createAdmin(email, password, role);
  await audit(admin, role === "owner" ? "افزودن مدیر اصلی" : "افزودن اپراتور", created.email);
  return json(created);
});
