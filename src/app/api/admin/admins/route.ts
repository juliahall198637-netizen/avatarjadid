import { z } from "zod";

import { json, route } from "@/lib/server/api";
import { createAdmin, requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  await requireAdmin(request);
  return json(await db()`select id, email, created_at, last_login_at from admin_users order by created_at`);
});

export const POST = route(async (request: Request) => {
  await requireAdmin(request);
  const { email, password } = z
    .object({ email: z.string().trim().email().max(200), password: z.string().max(200) })
    .parse(await request.json());
  return json(await createAdmin(email, password));
});
