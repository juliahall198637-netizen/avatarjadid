import { json, route } from "@/lib/server/api";
import { audit, requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (request: Request, { params }: Ctx) => {
  await requireAdmin(request, "operator");
  const rows = await db()`
    select role, content, meta, created_at from messages where conversation_id = ${(await params).id} order by id`;
  return json(rows);
});

export const DELETE = route(async (request: Request, { params }: Ctx) => {
  const admin = await requireAdmin(request, "operator");
  const { id } = await params;
  await db()`delete from conversations where id = ${id}`;
  await audit(admin, "حذف گفتگو", id);
  return json({ ok: true });
});
