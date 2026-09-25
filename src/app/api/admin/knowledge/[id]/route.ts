import { json, route } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (request: Request, { params }: Ctx) => {
  await requireAdmin(request);
  const rows = await db()`select idx, content from knowledge_chunks where document_id = ${(await params).id} order by idx`;
  return json(rows);
});

export const DELETE = route(async (request: Request, { params }: Ctx) => {
  await requireAdmin(request);
  await db()`delete from knowledge_documents where id = ${(await params).id}`;
  return json({ ok: true });
});
