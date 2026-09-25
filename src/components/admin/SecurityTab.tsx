"use client";

import { Trash2, UserPlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { api, attempt, Button, Card, Field, formatDate, Input } from "./ui";

interface Admin {
  id: string;
  email: string;
  created_at: string;
  last_login_at: string | null;
}

export function SecurityTab() {
  return (
    <div className="space-y-5">
      <ProxyCard />
      <AdminsCard />
      <PasswordCard />
    </div>
  );
}

function ProxyCard() {
  const [state, setState] = useState<{ configured: boolean; masked: string | null } | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string> | null>(null);

  const load = useCallback(async () => {
    await attempt(async () => setState(await api("/api/admin/network")));
  }, []);
  useEffect(() => void load(), [load]);

  async function save(proxyUrl: string | null) {
    setBusy("save");
    await attempt(() => api("/api/admin/network", { method: "PUT", json: { proxyUrl } }), proxyUrl ? "پروکسی ذخیره شد." : "پروکسی حذف شد.");
    setBusy(null);
    setUrl("");
    await load();
  }

  async function test() {
    setBusy("test");
    const result = await attempt(() => api<{ results: Record<string, string> }>("/api/admin/network", { method: "PUT", json: { test: true } }));
    setResults(result?.results ?? null);
    setBusy(null);
  }

  return (
    <Card
      title="پروکسی خروجی"
      description="سرورهای داخل ایران (مثل لیارا) به بیشتر سرویس‌های خارجی دسترسی ندارند. آدرس یک پروکسی HTTP در خارج از کشور را اینجا ثبت کنید و در هر سرویس خارجی گزینهٔ «استفاده از پروکسی» را روشن کنید. درگاه‌های ایرانی سازگار با OpenAI به پروکسی نیاز ندارند."
    >
      <div className="space-y-3">
        <p className="text-sm">
          وضعیت:{" "}
          {state?.configured ? (
            <span dir="ltr" className="text-accent">
              {state.masked}
            </span>
          ) : (
            <span className="text-muted">ثبت نشده</span>
          )}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input dir="ltr" type="password" autoComplete="off" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://user:pass@host:port" />
          <Button busy={busy === "save"} disabled={!url} onClick={() => save(url)}>
            ذخیره
          </Button>
          {state?.configured && (
            <Button variant="danger" onClick={() => save(null)}>
              حذف
            </Button>
          )}
        </div>
        <Button variant="outline" busy={busy === "test"} onClick={test}>
          آزمون دسترسی به OpenAI (مستقیم و از پروکسی)
        </Button>
        {results && (
          <ul className="space-y-1 text-xs" dir="auto">
            <li>مستقیم: {results.direct}</li>
            <li>از پروکسی: {results.proxy}</li>
          </ul>
        )}
      </div>
    </Card>
  );
}

function AdminsCard() {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    await attempt(async () => setAdmins(await api<Admin[]>("/api/admin/admins")));
  }, []);
  useEffect(() => void load(), [load]);

  async function add() {
    setBusy(true);
    const ok = await attempt(() => api("/api/admin/admins", { method: "POST", json: { email, password } }), "مدیر اضافه شد.");
    setBusy(false);
    if (ok) {
      setEmail("");
      setPassword("");
      await load();
    }
  }

  async function remove(admin: Admin) {
    if (!confirm(`دسترسی ${admin.email} حذف شود؟`)) return;
    await attempt(() => api(`/api/admin/admins/${admin.id}`, { method: "DELETE" }), "حذف شد.");
    await load();
  }

  return (
    <Card title="مدیران">
      <ul className="mb-4 divide-y divide-line">
        {admins.map((a) => (
          <li key={a.id} className="flex items-center justify-between py-2 text-sm">
            <span dir="ltr">{a.email}</span>
            <span className="flex items-center gap-3 text-xs text-muted">
              آخرین ورود: {formatDate(a.last_login_at)}
              <Button variant="ghost" onClick={() => remove(a)} aria-label="حذف">
                <Trash2 className="size-4" />
              </Button>
            </span>
          </li>
        ))}
      </ul>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="ایمیل مدیر جدید">
          <Input dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="گذرواژه (حداقل ۱۰ نویسه)">
          <Input dir="ltr" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button busy={busy} disabled={!email || password.length < 10} onClick={add}>
          <UserPlus className="size-4" /> افزودن
        </Button>
      </div>
    </Card>
  );
}

function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);

  async function change() {
    setBusy(true);
    const ok = await attempt(() => api("/api/admin/password", { method: "POST", json: { current, next } }), "گذرواژه تغییر کرد.");
    setBusy(false);
    if (ok) {
      setCurrent("");
      setNext("");
    }
  }

  return (
    <Card title="تغییر گذرواژهٔ من">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="گذرواژهٔ فعلی">
          <Input dir="ltr" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="گذرواژهٔ جدید">
          <Input dir="ltr" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Button busy={busy} disabled={!current || next.length < 10} onClick={change}>
          تغییر
        </Button>
      </div>
    </Card>
  );
}
