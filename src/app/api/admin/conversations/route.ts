import { json, route } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  await requireAdmin(request);
  const rows = await db()`
    select c.id, c.created_at, c.last_activity_at, c.message_count,
           (select content from messages m where m.conversation_id = c.id and m.role = 'user' order by id limit 1) as first_question
    from conversations c where c.message_count > 0
    order by c.last_activity_at desc limit 200`;
  return json(rows);
});
