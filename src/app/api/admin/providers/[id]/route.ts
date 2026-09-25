import { json, route } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { deleteProvider, providerInput, saveProvider } from "@/lib/server/providers/registry";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = route(async (request: Request, { params }: Ctx) => {
  await requireAdmin(request);
  const { id } = await params;
  await saveProvider(id, providerInput.parse(await request.json()));
  return json({ id });
});

export const DELETE = route(async (request: Request, { params }: Ctx) => {
  await requireAdmin(request);
  await deleteProvider((await params).id);
  return json({ ok: true });
});
