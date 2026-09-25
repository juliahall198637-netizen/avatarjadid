import { clientIp, json, route } from "@/lib/server/api";
import { db } from "@/lib/server/db";
import { hit } from "@/lib/server/ratelimit";
import { visitorId } from "@/lib/server/visitor";

export const dynamic = "force-dynamic";

/** Starts a conversation owned by the calling visitor. */
export const POST = route(async (request: Request) => {
  const visitor = await visitorId();
  const ip = clientIp(request);
  await hit(`conv:ip:${ip}`, 60, 3600);
  await hit(`conv:v:${visitor}`, 30, 3600);
  const [row] = await db()`
    insert into conversations (visitor_id, ip, user_agent)
    values (${visitor}, ${ip}, ${request.headers.get("user-agent")?.slice(0, 300) ?? null})
    returning id`;
  return json({ id: row!.id });
});
