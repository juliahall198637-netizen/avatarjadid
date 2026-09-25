import { json, route } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { reindexAll } from "@/lib/server/knowledge";

export const maxDuration = 300;

export const POST = route(async (request: Request) => {
  await requireAdmin(request);
  return json({ chunks: await reindexAll() });
});
