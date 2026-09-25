import { route } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

export const dynamic = "force-dynamic";

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  // Leading =,+,-,@ would be executed as a formula by spreadsheet apps.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** All messages as CSV (UTF-8 with BOM so Excel shows Persian correctly). */
export const GET = route(async (request: Request) => {
  await requireAdmin(request, "operator");
  const rows = await db()`
    select m.conversation_id, m.created_at, m.role, m.content, m.meta->>'source' as source
    from messages m order by m.conversation_id, m.id limit 100000`;
  const header = ["conversation", "time", "role", "text", "source"].join(",");
  const lines = rows.map((r) =>
    [r.conversation_id, new Date(r.created_at as string).toISOString(), r.role === "user" ? "بازدیدکننده" : "دستیار", r.content, r.source]
      .map(csvCell)
      .join(","),
  );
  const date = new Date().toISOString().slice(0, 10);
  return new Response("﻿" + [header, ...lines].join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="conversations-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
