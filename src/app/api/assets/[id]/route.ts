import { db } from "@/lib/server/db";

export const dynamic = "force-dynamic";

/** Serves uploaded avatar images. Asset ids are random UUIDs and content never changes. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const rows = await db()`select mime, data from assets where id = ${id}`;
  if (!rows[0]) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(rows[0].data as Buffer), {
    headers: {
      "Content-Type": rows[0].mime as string,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
