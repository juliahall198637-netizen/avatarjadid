import { db } from "@/lib/server/db";

export const dynamic = "force-dynamic";

/** Liveness + database check for the host's health probe. Reveals nothing else. */
export async function GET() {
  try {
    await db()`select 1`;
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
