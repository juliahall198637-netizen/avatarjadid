"use client";

import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Field, Input } from "@/components/admin/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(body.message ?? "ورود ناموفق بود.");
    router.replace("/admin");
    router.refresh();
  }

  return (
    <main className="stage-bg flex min-h-dvh items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-2xl border border-line bg-panel p-6">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-accent/15 p-2.5 text-accent">
            <Lock className="size-5" />
          </span>
          <div>
            <h1 className="text-lg font-bold">ورود مدیر</h1>
            <p className="text-xs text-muted">فقط برای مدیران سامانه</p>
          </div>
        </div>
        <Field label="ایمیل">
          <Input type="email" dir="ltr" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="گذرواژه">
          <Input type="password" dir="ltr" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <Button type="submit" busy={busy} className="w-full py-2.5">
          ورود
        </Button>
      </form>
    </main>
  );
}
