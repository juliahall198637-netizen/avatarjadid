import { assertSameOrigin, json, route } from "@/lib/server/api";
import { endSession } from "@/lib/server/auth";

export const POST = route(async (request: Request) => {
  assertSameOrigin(request);
  await endSession();
  return json({ ok: true });
});
