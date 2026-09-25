import { json, route } from "@/lib/server/api";
import { audit, requireAdmin } from "@/lib/server/auth";
import { listProviders, providerInput, saveProvider } from "@/lib/server/providers/registry";

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  await requireAdmin(request);
  return json(await listProviders());
});

export const POST = route(async (request: Request) => {
  const admin = await requireAdmin(request);
  const input = providerInput.parse(await request.json());
  const id = await saveProvider(null, input);
  await audit(admin, "افزودن سرویس", input.name);
  return json({ id });
});
