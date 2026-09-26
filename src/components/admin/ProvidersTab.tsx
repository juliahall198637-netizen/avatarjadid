"use client";

import { CheckCircle2, Globe, Pencil, Plus, Trash2, XCircle, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { KIND_LABELS, PRESETS, type Capability, type ProviderKind } from "@/lib/providers-catalog";
import type { ProviderSummary } from "@/lib/server/providers/registry";

import { useAdmin } from "./AdminPanel";
import { api, attempt, Badge, Button, Card, Field, formatDate, Input, PasswordInput, Select, Switch } from "./ui";

export const CAPABILITY_LABELS: Record<Capability, string> = {
  llm: "مدل پاسخ",
  stt: "گفتار به متن",
  tts: "متن به گفتار",
  embeddings: "بردارسازی",
  avatar: "آواتار",
  livekit: "اتاق زنده",
};

interface Draft {
  id: string | null;
  kind: ProviderKind;
  name: string;
  baseUrl: string;
  apiKey: string;
  /** LiveKit only: stored together with the key as "key:secret". */
  apiSecret: string;
  region: string;
  transcript: string;
  useProxy: boolean;
  enabled: boolean;
  hasKey: boolean;
}

const emptyDraft = (): Draft => ({
  id: null,
  kind: "openai",
  name: "",
  baseUrl: "",
  apiKey: "",
  apiSecret: "",
  region: "",
  transcript: "",
  useProxy: false,
  enabled: true,
  hasKey: false,
});

export function ProvidersTab() {
  const { providers, reloadProviders, mockEnabled } = useAdmin();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; message: string; models?: string[] }>>({});

  function edit(p: ProviderSummary) {
    setDraft({
      id: p.id,
      kind: p.kind,
      name: p.name,
      baseUrl: p.baseUrl ?? "",
      apiKey: "",
      apiSecret: "",
      region: String(p.config.region ?? ""),
      transcript: String(p.config.transcript ?? ""),
      useProxy: p.useProxy,
      enabled: p.enabled,
      hasKey: Boolean(p.apiKeyMasked),
    });
  }

  async function save() {
    if (!draft) return;
    setBusy("save");
    if (draft.kind === "livekit" && (draft.apiKey || draft.apiSecret) && !(draft.apiKey && draft.apiSecret)) {
      toast.error("برای LiveKit هر دو «کلید API» و «رمز API» را وارد کنید.");
      return;
    }
    const secret = draft.kind === "livekit" && draft.apiKey ? `${draft.apiKey.trim()}:${draft.apiSecret.trim()}` : draft.apiKey;
    const config: Record<string, unknown> = {};
    if (draft.kind === "azure_speech") config.region = draft.region.trim();
    if (draft.kind === "mock" && draft.transcript) config.transcript = draft.transcript;
    const body = {
      kind: draft.kind,
      name: draft.name,
      baseUrl: draft.baseUrl || null,
      // Empty field while editing = keep the stored key.
      ...(secret ? { apiKey: secret } : draft.id ? {} : { apiKey: "" }),
      config,
      useProxy: draft.useProxy,
      enabled: draft.enabled,
    };
    const ok = await attempt(
      () => api(draft.id ? `/api/admin/providers/${draft.id}` : "/api/admin/providers", { method: draft.id ? "PUT" : "POST", json: body }),
      "سرویس ذخیره شد.",
    );
    setBusy(null);
    if (ok) {
      setDraft(null);
      await reloadProviders();
    }
  }

  async function test(id: string) {
    setBusy(`test:${id}`);
    const result = await attempt(() => api<{ ok: boolean; message: string; models?: string[] }>(`/api/admin/providers/${id}/test`, { method: "POST" }));
    if (result) setTestResult((r) => ({ ...r, [id]: result }));
    setBusy(null);
    await reloadProviders();
  }

  async function remove(p: ProviderSummary) {
    if (!confirm(`سرویس «${p.name}» حذف شود؟ هر تنظیمی که از آن استفاده می‌کند غیرفعال می‌شود.`)) return;
    await attempt(() => api(`/api/admin/providers/${p.id}`, { method: "DELETE" }), "حذف شد.");
    await reloadProviders();
  }

  return (
    <div className="space-y-5">
      <Card
        description="هر سرویس یک بار با کلیدش اینجا ثبت می‌شود؛ سپس در «مغز و صدا» و «آواتار» انتخاب می‌کنید کدام برای چه کاری استفاده شود. کلیدها رمزنگاری‌شده ذخیره می‌شوند و هرگز به مرورگر بازنمی‌گردند."
        actions={
          !draft && (
            <Button onClick={() => setDraft(emptyDraft())}>
              <Plus className="size-4" /> افزودن سرویس
            </Button>
          )
        }
      >
        {draft && <ProviderForm draft={draft} setDraft={setDraft} onSave={save} busy={busy === "save"} mockEnabled={mockEnabled} />}
        {!draft && providers.length === 0 && <p className="text-sm text-muted">هنوز سرویسی ثبت نشده است.</p>}
      </Card>

      {providers.map((p) => {
        const result = testResult[p.id];
        return (
          <Card key={p.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold">{p.name}</h3>
                  <Badge>{KIND_LABELS[p.kind]}</Badge>
                  {!p.enabled && <Badge tone="warn">غیرفعال</Badge>}
                  {p.useProxy && (
                    <Badge tone="neutral">
                      <Globe className="ml-1 size-3" /> از پروکسی
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {p.capabilities.map((c) => (
                    <Badge key={c} tone="ok">
                      {CAPABILITY_LABELS[c]}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted" dir="ltr">
                  {[p.baseUrl || (p.kind === "azure_speech" ? `region: ${p.config.region ?? "—"}` : ""), p.apiKeyMasked]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {p.lastTestAt && (
                  <p className={`flex items-center gap-1 text-xs ${p.lastTestOk ? "text-accent" : "text-danger"}`}>
                    {p.lastTestOk ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
                    {p.lastTestMessage} · {formatDate(p.lastTestAt)}
                  </p>
                )}
              </div>
              <div className="flex gap-1.5">
                <Button variant="outline" busy={busy === `test:${p.id}`} onClick={() => test(p.id)}>
                  <Zap className="size-4" /> آزمون اتصال
                </Button>
                <Button variant="ghost" onClick={() => edit(p)} aria-label="ویرایش">
                  <Pencil className="size-4" />
                </Button>
                <Button variant="ghost" onClick={() => remove(p)} aria-label="حذف">
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
            {result?.models && result.models.length > 0 && (
              <details className="mt-3 text-xs text-muted">
                <summary className="cursor-pointer">فهرست مدل‌ها/صداها ({result.models.length})</summary>
                <p className="mt-2 max-h-40 overflow-auto leading-6" dir="ltr">
                  {result.models.join(" · ")}
                </p>
              </details>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function ProviderForm({
  draft,
  setDraft,
  onSave,
  busy,
  mockEnabled,
}: {
  draft: Draft;
  setDraft: (d: Draft | null) => void;
  onSave: () => void;
  busy: boolean;
  mockEnabled: boolean;
}) {
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const presets = PRESETS.filter((p) => p.kind !== "mock" || mockEnabled);
  const preset = PRESETS.find((p) => p.kind === draft.kind && (p.baseUrl ?? "") === draft.baseUrl);
  const needsKey = draft.kind !== "mock";
  const hasBaseUrl = !["azure_speech", "mock"].includes(draft.kind);

  return (
    <div className="space-y-4 rounded-xl border border-line bg-ink/40 p-4">
      {!draft.id && (
        <Field label="انتخاب سریع">
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() =>
                  set({
                    kind: p.kind,
                    name: p.label.replace(/ \(.*\)$/, ""),
                    baseUrl: p.baseUrl ?? "",
                    region: String(p.config?.region ?? ""),
                  })
                }
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  preset?.id === p.id ? "border-accent bg-accent/15 text-accent" : "border-line text-white/70 hover:bg-white/5"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </Field>
      )}
      {preset?.note && <p className="rounded-lg bg-warm/10 px-3 py-2 text-xs leading-6 text-warm">{preset.note}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="نام نمایشی">
          <Input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="مثلاً OpenAI اصلی" />
        </Field>
        <Field label="نوع سرویس">
          <Select value={draft.kind} onChange={(e) => set({ kind: e.target.value as ProviderKind })} disabled={Boolean(draft.id)}>
            {(Object.keys(KIND_LABELS) as ProviderKind[])
              .filter((k) => k !== "mock" || mockEnabled)
              .map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
          </Select>
        </Field>
        {hasBaseUrl && (
          <Field
            label={draft.kind === "livekit" ? "نشانی سرور LiveKit" : "آدرس پایهٔ API"}
            hint={draft.kind === "livekit" ? "مثلاً wss://my-project.livekit.cloud" : "برای درگاه‌های ایرانی سازگار با OpenAI، آدرس همان درگاه را وارد کنید."}
          >
            <Input
              dir="ltr"
              value={draft.baseUrl}
              onChange={(e) => set({ baseUrl: e.target.value })}
              placeholder={draft.kind === "livekit" ? "wss://…livekit.cloud" : "https://api.openai.com/v1"}
            />
          </Field>
        )}
        {draft.kind === "azure_speech" && (
          <Field label="منطقه (Region)" hint="همان منطقه‌ای که منبع Speech در Azure ساخته شده، مثلاً westeurope">
            <Input dir="ltr" value={draft.region} onChange={(e) => set({ region: e.target.value })} placeholder="westeurope" />
          </Field>
        )}
        {needsKey && (
          <Field label="کلید API" hint={draft.hasKey ? "برای نگه‌داشتن کلید فعلی خالی بگذارید." : undefined}>
            <PasswordInput
              dir="ltr"
              autoComplete="off"
              value={draft.apiKey}
              onChange={(e) => set({ apiKey: e.target.value })}
              placeholder={draft.hasKey ? "•••••••• (ذخیره شده)" : ""}
            />
          </Field>
        )}
        {draft.kind === "livekit" && (
          <Field label="رمز API (API Secret)" hint={draft.hasKey ? "برای نگه‌داشتن مقادیر فعلی، هر دو را خالی بگذارید." : undefined}>
            <PasswordInput
              dir="ltr"
              autoComplete="off"
              value={draft.apiSecret}
              onChange={(e) => set({ apiSecret: e.target.value })}
              placeholder={draft.hasKey ? "•••••••• (ذخیره شده)" : ""}
            />
          </Field>
        )}
        {draft.kind === "mock" && (
          <Field label="متن آزمایشی گفتار" hint="همین متن به‌جای صدای کاربر در نظر گرفته می‌شود.">
            <Input value={draft.transcript} onChange={(e) => set({ transcript: e.target.value })} placeholder="سلام، ساعت کاری شما چیست؟" />
          </Field>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Switch
          checked={draft.useProxy}
          onChange={(v) => set({ useProxy: v })}
          label="استفاده از پروکسی خروجی (برای سرویس‌های خارجی روی سرور ایران)"
        />
        <Switch checked={draft.enabled} onChange={(v) => set({ enabled: v })} label="فعال" />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setDraft(null)}>
          انصراف
        </Button>
        <Button busy={busy} onClick={onSave} disabled={!draft.name}>
          ذخیره
        </Button>
      </div>
    </div>
  );
}
