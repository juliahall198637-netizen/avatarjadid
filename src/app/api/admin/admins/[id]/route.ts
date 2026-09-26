import { z } from "zod";

import { ApiError, json, route } from "@/lib/server/api";
import { audit, hashPassword, MIN_PASSWORD_LENGTH, requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = route(async (request: Request, { params }: Ctx) => {
  const admin = await requireAdmin(request);
  const { id } = await params;
  if (id === admin.id) throw new ApiError(400, "self", "نمی‌توانید حساب خودتان را حذف کنید.");
  const [removed] = await db()`delete from admin_users where id = ${id} returning email`;
  if (removed) await audit(admin, "حذف مدیر", removed.email as string);
  return json({ ok: true });
});

/** Owner sets a new password for another admin (e.g. one who forgot theirs). */
export const PATCH = route(async (request: Request, { params }: Ctx) => {
  const admin = await requireAdmin(request);
  const { id } = await params;
  const { password } = z.object({ password: z.string().max(200) }).parse(await request.json());
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ApiError(400, "weak_password", `گذرواژه باید حداقل ${MIN_PASSWORD_LENGTH} نویسه باشد.`);
  }
  const [row] = await db()`
    update admin_users set password_hash = ${await hashPassword(password)} where id = ${id} returning email`;
  if (!row) throw new ApiError(404, "not_found", "این مدیر پیدا نشد.");
  // Their existing sessions end; they sign in again with the new password.
  if (id !== admin.id) await db()`delete from admin_sessions where user_id = ${id}`;
  await audit(admin, "بازنشانی گذرواژه", row.email as string);
  return json({ ok: true });
});
