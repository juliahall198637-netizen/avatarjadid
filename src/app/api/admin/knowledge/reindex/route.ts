import { json, route } from "@/lib/server/api";
import { audit, requireAdmin } from "@/lib/server/auth";
import { reindexAll } from "@/lib/server/knowledge";

export const maxDuration = 300;

export const POST = route(async (request: Request) => {
  const admin = await requireAdmin(request, "operator");
  const chunks = await reindexAll();
  await audit(admin, "بازسازی بردارهای دانش", `${chunks} قطعه`);
  return json({ chunks });
});
