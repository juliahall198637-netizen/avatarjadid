"use client";

import { Play } from "lucide-react";
import { useState } from "react";

import { base64ToInt16, PcmPlayer } from "@/lib/client/audio";
import { ANTHROPIC_MODELS, AZURE_PERSIAN_VOICES, OPENAI_VOICES, PRESETS, type Capability } from "@/lib/providers-catalog";
import type { ProviderSummary } from "@/lib/server/providers/registry";
import type { AppSettings } from "@/lib/server/settings";

import { useAdmin } from "./AdminPanel";
import { api, attempt, Button, Card, Field, Input, Select, Textarea } from "./ui";

type Slot = "primary" | "fallback";

function modelSuggestions(provider: ProviderSummary | undefined, capability: Capability): string[] {
  if (!provider) return [];
  if (provider.kind === "anthropic") return ANTHROPIC_MODELS;
  const presetModels = PRESETS.filter((p) => p.kind === provider.kind)
    .map((p) => p.defaults?.[capability]?.model)
    .filter(Boolean) as string[];
  return [...new Set(presetModels)];
}

function defaultsFor(provider: ProviderSummary | undefined, capability: Capability) {
  const preset =
    PRESETS.find((p) => p.kind === provider?.kind && (p.baseUrl ?? "") === (provider?.baseUrl ?? "")) ??
    PRESETS.find((p) => p.kind === provider?.kind);
  return preset?.defaults?.[capability] ?? {};
}

function ProviderSelect({ capability, value, onChange }: { capability: Capability; value: string | null; onChange: (id: string | null) => void }) {
  const { providers } = useAdmin();
  const options = providers.filter((p) => p.capabilities.includes(capability));
  return (
    <Select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">— هیچ —</option>
      {options.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
          {!p.enabled ? " (غیرفعال)" : ""}
        </option>
      ))}
    </Select>
  );
}

function ModelInput({ id, value, onChange, suggestions, placeholder }: { id: string; value: string; onChange: (v: string) => void; suggestions: string[]; placeholder?: string }) {
  return (
    <>
      <Input dir="ltr" list={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      <datalist id={id}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </>
  );
}

export function PipelineTab() {
  const { settings, update, providers, dirty } = useAdmin();
  const s = settings!;
  const find = (id: string | null | undefined) => providers.find((p) => p.id === id);

  function setTarget<K extends "llm" | "stt" | "tts">(capability: K, slot: Slot, providerId: string | null) {
    update((d) => {
      if (!providerId) {
        d[capability][slot] = null;
        return;
      }
      const provider = find(providerId);
      const defaults = defaultsFor(provider, capability);
      const base = { providerId, model: defaults.model ?? "" };
      if (capability === "llm") d.llm[slot] = { ...base, temperature: null, maxTokens: null, effort: null };
      if (capability === "stt") d.stt[slot] = { ...base, language: "fa", hint: "" };
      if (capability === "tts") d.tts[slot] = { ...base, voice: defaults.voice ?? "", speed: 1, instructions: "" };
    });
  }

  return (
    <div className="space-y-5">
      <Card
        title="مدل پاسخ (LLM)"
        description="مدلی که پرسش را می‌فهمد و پاسخ فارسی می‌سازد. اگر سرویس اصلی خطا بدهد، سرویس پشتیبان به‌طور خودکار استفاده می‌شود."
      >
        <div className="grid gap-5 md:grid-cols-2">
          {(["primary", "fallback"] as const).map((slot) => {
            const t = s.llm[slot];
            const provider = find(t?.providerId);
            return (
              <div key={slot} className="space-y-3">
                <Field label={slot === "primary" ? "سرویس اصلی" : "سرویس پشتیبان"}>
                  <ProviderSelect capability="llm" value={t?.providerId ?? null} onChange={(id) => setTarget("llm", slot, id)} />
                </Field>
                {t && (
                  <>
                    <Field label="مدل">
                      <ModelInput
                        id={`llm-${slot}`}
                        value={t.model}
                        onChange={(v) => update((d) => void (d.llm[slot]!.model = v))}
                        suggestions={modelSuggestions(provider, "llm")}
                      />
                    </Field>
                    {provider?.kind === "anthropic" ? (
                      <Field label="عمق فکر (effort)" hint="برای گفتگوی صوتی، «کم» پاسخ سریع‌تری می‌دهد.">
                        <Select
                          value={t.effort ?? ""}
                          onChange={(e) => update((d) => void (d.llm[slot]!.effort = (e.target.value || null) as never))}
                        >
                          <option value="">پیش‌فرض مدل</option>
                          <option value="low">کم</option>
                          <option value="medium">متوسط</option>
                          <option value="high">زیاد</option>
                        </Select>
                      </Field>
                    ) : (
                      <Field label="دما (temperature)" hint="خالی = پیش‌فرض مدل. بعضی مدل‌ها فقط مقدار پیش‌فرض را می‌پذیرند.">
                        <Input
                          dir="ltr"
                          type="number"
                          step="0.1"
                          min={0}
                          max={2}
                          value={t.temperature ?? ""}
                          onChange={(e) => update((d) => void (d.llm[slot]!.temperature = e.target.value === "" ? null : Number(e.target.value)))}
                        />
                      </Field>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="تبدیل گفتار به متن (STT)" description="صدای بازدیدکننده را به متن فارسی تبدیل می‌کند.">
        <div className="grid gap-5 md:grid-cols-2">
          {(["primary", "fallback"] as const).map((slot) => {
            const t = s.stt[slot];
            const provider = find(t?.providerId);
            return (
              <div key={slot} className="space-y-3">
                <Field label={slot === "primary" ? "سرویس اصلی" : "سرویس پشتیبان"}>
                  <ProviderSelect capability="stt" value={t?.providerId ?? null} onChange={(id) => setTarget("stt", slot, id)} />
                </Field>
                {t && provider?.kind !== "azure_speech" && provider?.kind !== "mock" && (
                  <Field label="مدل">
                    <ModelInput
                      id={`stt-${slot}`}
                      value={t.model}
                      onChange={(v) => update((d) => void (d.stt[slot]!.model = v))}
                      suggestions={modelSuggestions(provider, "stt")}
                    />
                  </Field>
                )}
                {t && (
                  <Field label="واژه‌های راهنما" hint="نام‌ها و اصطلاحات خاص (مثلاً نام سازمان) تا درست شنیده شوند.">
                    <Input value={t.hint} onChange={(e) => update((d) => void (d.stt[slot]!.hint = e.target.value))} />
                  </Field>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card
        title="صدای فارسی (TTS)"
        description="پاسخ را با صدای فارسی می‌خواند. بهترین کیفیت فارسی معمولاً Azure (fa-IR-DilaraNeural / FaridNeural) است."
        actions={<TtsPreview disabled={dirty} />}
      >
        <div className="grid gap-5 md:grid-cols-2">
          {(["primary", "fallback"] as const).map((slot) => {
            const t = s.tts[slot];
            const provider = find(t?.providerId);
            const voices =
              provider?.kind === "azure_speech" ? AZURE_PERSIAN_VOICES : provider?.kind === "openai" ? OPENAI_VOICES : [];
            return (
              <div key={slot} className="space-y-3">
                <Field label={slot === "primary" ? "سرویس اصلی" : "سرویس پشتیبان"}>
                  <ProviderSelect capability="tts" value={t?.providerId ?? null} onChange={(id) => setTarget("tts", slot, id)} />
                </Field>
                {t && (
                  <>
                    {provider?.kind !== "azure_speech" && provider?.kind !== "mock" && (
                      <Field label="مدل">
                        <ModelInput
                          id={`tts-model-${slot}`}
                          value={t.model}
                          onChange={(v) => update((d) => void (d.tts[slot]!.model = v))}
                          suggestions={provider?.kind === "elevenlabs" ? ["eleven_multilingual_v2", "eleven_v3"] : modelSuggestions(provider, "tts")}
                        />
                      </Field>
                    )}
                    <Field
                      label="صدا"
                      hint={provider?.kind === "elevenlabs" ? "شناسهٔ صدا (voice_id) از حساب ElevenLabs؛ «آزمون اتصال» فهرست صداها را نشان می‌دهد." : undefined}
                    >
                      <ModelInput id={`tts-voice-${slot}`} value={t.voice} onChange={(v) => update((d) => void (d.tts[slot]!.voice = v))} suggestions={voices} />
                    </Field>
                    <Field label={`سرعت: ${t.speed.toFixed(2)}`}>
                      <input
                        type="range"
                        min={0.7}
                        max={1.3}
                        step={0.05}
                        value={t.speed}
                        onChange={(e) => update((d) => void (d.tts[slot]!.speed = Number(e.target.value)))}
                        className="w-full accent-[var(--color-accent)]"
                      />
                    </Field>
                    {provider?.kind === "openai" && (
                      <Field label="دستور لحن" hint="فقط مدل‌های gpt-4o-mini-tts به بعد.">
                        <Textarea
                          rows={2}
                          value={t.instructions}
                          onChange={(e) => update((d) => void (d.tts[slot]!.instructions = e.target.value))}
                          placeholder="با لحن گرم و آرام و تلفظ فارسی معیار تهرانی صحبت کن."
                        />
                      </Field>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card
        title="بردارسازی پایگاه دانش (اختیاری)"
        description="برای جست‌وجوی معنایی در اسناد. بدون آن، جست‌وجو بر اساس کلیدواژه انجام می‌شود. پس از تغییر، در تب «پایگاه دانش» بازسازی کنید."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="سرویس">
            <ProviderSelect
              capability="embeddings"
              value={s.embeddings?.providerId ?? null}
              onChange={(id) =>
                update((d) => {
                  d.embeddings = id ? { providerId: id, model: defaultsFor(find(id), "embeddings").model ?? "" } : null;
                })
              }
            />
          </Field>
          {s.embeddings && (
            <Field label="مدل">
              <ModelInput
                id="emb-model"
                value={s.embeddings.model}
                onChange={(v) => update((d) => void (d.embeddings!.model = v))}
                suggestions={modelSuggestions(find(s.embeddings.providerId), "embeddings")}
              />
            </Field>
          )}
        </div>
      </Card>
    </div>
  );
}

function TtsPreview({ disabled }: { disabled: boolean }) {
  const [text, setText] = useState("سلام! من دستیار هوشمند شما هستم. امروز ساعت ۱۴:۳۰ جلسه داریم.");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  async function play() {
    setBusy(true);
    setInfo(null);
    const result = await attempt(() =>
      api<{ ok: boolean; pcm?: string; sampleRate?: number; latencyMs?: number; message?: string }>("/api/admin/tts-preview", { method: "POST", json: { text } }),
    );
    setBusy(false);
    if (!result) return;
    if (!result.ok) return setInfo(result.message ?? "ناموفق");
    setInfo(`ساخته شد در ${result.latencyMs}ms`);
    const player = new PcmPlayer();
    await player.resume();
    const end = player.enqueue(base64ToInt16(result.pcm!), result.sampleRate!);
    setTimeout(() => void player.close(), (end - player.context.currentTime) * 1000 + 500);
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-80">
      <div className="flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} />
        <Button variant="outline" busy={busy} disabled={disabled} onClick={play} title={disabled ? "ابتدا تنظیمات را ذخیره کنید" : undefined}>
          <Play className="size-4" /> شنیدن
        </Button>
      </div>
      {disabled && <span className="text-xs text-warm">برای شنیدن، ابتدا تغییرات را ذخیره کنید.</span>}
      {info && <span className="text-xs text-muted">{info}</span>}
    </div>
  );
}

export type { AppSettings };
