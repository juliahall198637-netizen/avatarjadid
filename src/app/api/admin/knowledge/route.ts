import { ApiError, json, route } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { addDocument, extractText } from "@/lib/server/knowledge";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const GET = route(async (request: Request) => {
  await requireAdmin(request);
  const rows = await db()`
    select d.id, d.title, d.source, d.chunk_count, d.char_count, d.created_at,
           count(c.embedding)::int as embedded
    from knowledge_documents d left join knowledge_chunks c on c.document_id = d.id
    group by d.id order by d.created_at desc`;
  return json(rows);
});

/** multipart: `file` (PDF/TXT/MD) or `text`, plus optional `title`. */
export const POST = route(async (request: Request) => {
  await requireAdmin(request);
  const form = await request.formData();
  const file = form.get("file");
  const title = String(form.get("title") ?? "").trim();
  if (file instanceof File && file.size) {
    if (file.size > 25_000_000) throw new ApiError(413, "too_large", "حجم فایل حداکثر ۲۵ مگابایت است.");
    const text = await extractText(file);
    return json(await addDocument(title || file.name, file.name, text));
  }
  const text = String(form.get("text") ?? "");
  if (!title) throw new ApiError(400, "no_title", "برای متن یک عنوان وارد کنید.");
  return json(await addDocument(title, "متن دستی", text));
});
