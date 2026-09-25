import { z } from "zod";

import { json, route } from "@/lib/server/api";
import { audit, requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (request: Request, { params }: Ctx) => {
  await requireAdmin(request, "operator");
  const rows = await db()`select idx, content from knowledge_chunks where document_id = ${(await params).id} order by idx`;
  return json(rows);
});

/** Body: { active: boolean } — hide or show a document in answers without deleting it. */
export const PATCH = route(async (request: Request, { params }: Ctx) => {
  const admin = await requireAdmin(request, "operator");
  const { active } = z.object({ active: z.boolean() }).parse(await request.json());
  const [doc] = await db()`update knowledge_documents set active = ${active} where id = ${(await params).id} returning title`;
  if (doc) await audit(admin, active ? "فعال‌سازی سند" : "غیرفعال‌سازی سند", doc.title as string);
  return json({ ok: true });
});

export const DELETE = route(async (request: Request, { params }: Ctx) => {
  const admin = await requireAdmin(request, "operator");
  const [doc] = await db()`delete from knowledge_documents where id = ${(await params).id} returning title`;
  if (doc) await audit(admin, "حذف سند", doc.title as string);
  return json({ ok: true });
});
