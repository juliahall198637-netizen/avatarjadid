import { db } from "@/lib/server/db";

export const dynamic = "force-dynamic";

/**
 * Liveness + database check for the host's health probe. On failure it gives
 * only an error code (e.g. ENOTFOUND, ECONNREFUSED, 28P01) to help diagnose a
 * deploy; never the connection string or message.
 */
export async function GET() {
  if (!process.env.DATABASE_URL) return Response.json({ ok: false, error: "DATABASE_URL_missing" }, { status: 503 });
  try {
    await db()`select 1`;
    return Response.json({ ok: true });
  } catch (error) {
    const code = String((error as { code?: unknown }).code ?? "unknown").replace(/[^\w.-]/g, "").slice(0, 40);
    return Response.json({ ok: false, error: code }, { status: 503 });
  }
}
