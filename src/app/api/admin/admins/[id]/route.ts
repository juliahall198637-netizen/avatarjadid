import { ApiError, json, route } from "@/lib/server/api";
import { audit, requireAdmin } from "@/lib/server/auth";
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
