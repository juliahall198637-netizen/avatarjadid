"use client";

import { AlertTriangle, CheckCircle2, Circle } from "lucide-react";
import { useEffect, useState } from "react";

import { useAdmin } from "./AdminPanel";
import { api, attempt, Card, formatDate } from "./ui";

interface Overview {
  counts: { conversations_today: number; questions_today: number; documents: number; providers: number };
  stats: { capability: string; total: number; failed: number; avg_ms: number | null }[];
  errors: { capability: string; error: string; created_at: string; provider: string | null }[];
}

const CAP: Record<string, string> = { llm: "مدل پاسخ", stt: "گفتار به متن", tts: "صدای فارسی" };

export function OverviewTab() {
  const { settings, providers, role } = useAdmin();
  const [data, setData] = useState<Overview | null>(null);
  const s = settings!;

  useEffect(() => {
    void attempt(async () => setData(await api<Overview>("/api/admin/overview")));
  }, []);

  const avatarReady =
    s.avatar.type === "builtin" ||
    (s.avatar.type === "simli" && s.avatar.simli.providerId && s.avatar.simli.faceId) ||
    (s.avatar.type === "liveavatar" && s.avatar.liveavatar.providerId && (s.avatar.liveavatar.avatarId || s.avatar.liveavatar.sandbox)) ||
    (s.avatar.type === "did" && s.avatar.did.providerId && (s.avatar.did.sourceUrl || s.avatar.builtin.portraitAssetId)) ||
    (s.avatar.type === "bey" && s.avatar.bey.providerId && s.avatar.bey.livekitProviderId && s.avatar.bey.avatarId);

  const checklist = [
    { done: providers.length > 0, text: "حداقل یک سرویس با کلید در «سرویس‌ها و کلیدها» ثبت شود" },
    { done: providers.some((p) => p.lastTestOk), text: "«آزمون اتصال» سرویس‌ها موفق باشد" },
    { done: Boolean(s.stt.primary), text: "سرویس تبدیل گفتار به متن انتخاب شود" },
    { done: Boolean(s.llm.primary), text: "مدل پاسخ انتخاب شود" },
    { done: Boolean(s.tts.primary), text: "صدای فارسی انتخاب شود" },
    { done: Boolean(avatarReady), text: "آواتار تنظیم شود" },
  ];

  return (
    <div className="space-y-5">
      {role === "owner" && <Card title="راه‌اندازی">
        <ul className="space-y-2">
          {checklist.map((item) => (
            <li key={item.text} className="flex items-center gap-2 text-sm">
              {item.done ? <CheckCircle2 className="size-4 text-accent" /> : <Circle className="size-4 text-muted" />}
              <span className={item.done ? "text-white/60" : ""}>{item.text}</span>
            </li>
          ))}
        </ul>
      </Card>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["گفتگوهای امروز", data.counts.conversations_today],
              ["پرسش‌های امروز", data.counts.questions_today],
              ["اسناد دانش", data.counts.documents],
              ["سرویس‌ها", data.counts.providers],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-line bg-panel p-4">
                <p className="text-2xl font-bold tabular-nums">{Number(value).toLocaleString("fa-IR")}</p>
                <p className="mt-1 text-xs text-muted">{label}</p>
              </div>
            ))}
          </div>

          <Card title="عملکرد سرویس‌ها در ۲۴ ساعت گذشته">
            {data.stats.length === 0 ? (
              <p className="text-sm text-muted">هنوز فراخوانی‌ای ثبت نشده.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="pb-2 text-right font-normal">قابلیت</th>
                    <th className="pb-2 text-right font-normal">تعداد</th>
                    <th className="pb-2 text-right font-normal">ناموفق</th>
                    <th className="pb-2 text-right font-normal">میانگین زمان</th>
                  </tr>
                </thead>
                <tbody>
                  {data.stats.map((row) => (
                    <tr key={row.capability} className="border-t border-line">
                      <td className="py-2">{CAP[row.capability] ?? row.capability}</td>
                      <td className="py-2 tabular-nums">{row.total.toLocaleString("fa-IR")}</td>
                      <td className={`py-2 tabular-nums ${row.failed ? "text-danger" : ""}`}>{row.failed.toLocaleString("fa-IR")}</td>
                      <td className="py-2 tabular-nums">{row.avg_ms !== null ? `${(row.avg_ms / 1000).toLocaleString("fa-IR", { maximumFractionDigits: 2 })} ثانیه` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {data.errors.length > 0 && (
            <Card title="آخرین خطاها">
              <ul className="space-y-2">
                {data.errors.map((e, i) => (
                  <li key={i} className="flex gap-2 text-xs leading-6">
                    <AlertTriangle className="mt-1 size-3.5 shrink-0 text-danger" />
                    <span>
                      <span className="text-muted">
                        {formatDate(e.created_at)} · {CAP[e.capability] ?? e.capability} · {e.provider ?? "—"}:
                      </span>{" "}
                      <span dir="auto">{e.error}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
