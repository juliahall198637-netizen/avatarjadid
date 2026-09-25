import { z } from "zod";

import { ApiError, json, route } from "@/lib/server/api";
import { hashPassword, MIN_PASSWORD_LENGTH, requireAdmin, verifyPassword } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

export const POST = route(async (request: Request) => {
  const admin = await requireAdmin(request);
  const { current, next } = z.object({ current: z.string().max(200), next: z.string().max(200) }).parse(await request.json());
  const [row] = await db()`select password_hash from admin_users where id = ${admin.id}`;
  if (!row || !(await verifyPassword(current, row.password_hash as string))) {
    throw new ApiError(400, "bad_password", "گذرواژهٔ فعلی نادرست است.");
  }
  if (next.length < MIN_PASSWORD_LENGTH) {
    throw new ApiError(400, "weak_password", `گذرواژه باید حداقل ${MIN_PASSWORD_LENGTH} نویسه باشد.`);
  }
  await db()`update admin_users set password_hash = ${await hashPassword(next)} where id = ${admin.id}`;
  // Sign out every other device.
  await db()`delete from admin_sessions where user_id = ${admin.id} and created_at < now() - interval '1 second'`;
  return json({ ok: true });
});
