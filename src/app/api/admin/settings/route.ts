import { json, route } from "@/lib/server/api";
import { audit, requireAdmin } from "@/lib/server/auth";
import { getSettings, saveSettings } from "@/lib/server/settings";

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  await requireAdmin(request, "operator");
  return json(await getSettings());
});

export const PUT = route(async (request: Request) => {
  const admin = await requireAdmin(request);
  const saved = await saveSettings(await request.json(), admin.id);
  await audit(admin, "ذخیرهٔ تنظیمات");
  return json(saved);
});
