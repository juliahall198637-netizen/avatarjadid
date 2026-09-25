import { json, route } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { getSettings, saveSettings } from "@/lib/server/settings";

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  await requireAdmin(request);
  return json(await getSettings());
});

export const PUT = route(async (request: Request) => {
  const admin = await requireAdmin(request);
  return json(await saveSettings(await request.json(), admin.id));
});
