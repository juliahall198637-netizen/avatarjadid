import { json, route } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  await requireAdmin(request, "operator");
  const sql = db();
  const [counts] = await sql`
    select
      (select count(*)::int from conversations where message_count > 0 and created_at > now() - interval '1 day') as conversations_today,
      (select count(*)::int from messages where role = 'user' and created_at > now() - interval '1 day') as questions_today,
      (select count(*)::int from knowledge_documents) as documents,
      (select count(*)::int from providers) as providers`;
  const stats = await sql`
    select capability, count(*)::int as total, count(*) filter (where not ok)::int as failed,
           round(avg(latency_ms) filter (where ok))::int as avg_ms
    from provider_events where created_at > now() - interval '1 day' group by capability`;
  const errors = await sql`
    select e.capability, e.error, e.created_at, p.name as provider
    from provider_events e left join providers p on p.id = e.provider_id
    where not e.ok order by e.id desc limit 15`;
  return json({ counts, stats, errors });
});
