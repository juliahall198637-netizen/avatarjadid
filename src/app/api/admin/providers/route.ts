import { json, route } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { listProviders, providerInput, saveProvider } from "@/lib/server/providers/registry";

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  await requireAdmin(request);
  return json(await listProviders());
});

export const POST = route(async (request: Request) => {
  await requireAdmin(request);
  const id = await saveProvider(null, providerInput.parse(await request.json()));
  return json({ id });
});
