import { json, route } from "@/lib/server/api";
import { audit, requireAdmin } from "@/lib/server/auth";
import { deleteProvider, providerInput, saveProvider } from "@/lib/server/providers/registry";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = route(async (request: Request, { params }: Ctx) => {
  const admin = await requireAdmin(request);
  const { id } = await params;
  const input = providerInput.parse(await request.json());
  await saveProvider(id, input);
  await audit(admin, input.apiKey !== undefined ? "ویرایش سرویس و کلید" : "ویرایش سرویس", input.name);
  return json({ id });
});

export const DELETE = route(async (request: Request, { params }: Ctx) => {
  const admin = await requireAdmin(request);
  const name = await deleteProvider((await params).id);
  await audit(admin, "حذف سرویس", name);
  return json({ ok: true });
});
