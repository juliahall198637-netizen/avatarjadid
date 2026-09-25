import { ApiError, json, route } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** Uploads an avatar image (portrait or mouth sprite). */
export const POST = route(async (request: Request) => {
  await requireAdmin(request);
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "no_file", "فایلی انتخاب نشده.");
  if (!TYPES[file.type]) throw new ApiError(400, "bad_type", "فقط تصویر PNG، JPG یا WEBP.");
  if (file.size > 5_000_000) throw new ApiError(413, "too_large", "حجم تصویر حداکثر ۵ مگابایت است.");
  const [row] = await db()`
    insert into assets (kind, mime, data) values (${String(form.get("kind") ?? "image")}, ${file.type},
      ${Buffer.from(await file.arrayBuffer())}) returning id`;
  return json({ id: row!.id });
});
