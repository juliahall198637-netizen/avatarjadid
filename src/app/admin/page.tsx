import { redirect } from "next/navigation";

import { AdminPanel } from "@/components/admin/AdminPanel";
import { currentAdmin } from "@/lib/server/auth";
import { env } from "@/lib/server/env";

export const dynamic = "force-dynamic";
export const metadata = { title: "پنل مدیریت", robots: { index: false } };

export default async function AdminPage() {
  const admin = await currentAdmin();
  if (!admin) redirect("/admin/login");
  return <AdminPanel email={admin.email} mockEnabled={env.mockProvidersEnabled} />;
}
