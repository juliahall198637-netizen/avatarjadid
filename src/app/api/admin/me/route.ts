import { json, route } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { env } from "@/lib/server/env";

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  const admin = await requireAdmin(request);
  return json({ ...admin, mockProvidersEnabled: env.mockProvidersEnabled });
});
