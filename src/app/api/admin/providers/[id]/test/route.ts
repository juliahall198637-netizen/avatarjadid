import { ApiError, json, route } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { getProvider, recordTest } from "@/lib/server/providers/registry";
import { testProvider } from "@/lib/server/providers/test";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (request: Request, { params }: Ctx) => {
  await requireAdmin(request);
  const provider = await getProvider((await params).id);
  if (!provider) throw new ApiError(404, "not_found", "سرویس پیدا نشد.");
  const result = await testProvider(provider);
  await recordTest(provider.id, result.ok, result.message);
  return json(result);
});
