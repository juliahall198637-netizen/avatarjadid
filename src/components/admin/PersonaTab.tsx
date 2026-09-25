"use client";

import { DEFAULT_PERSONA_PROMPT } from "@/lib/defaults";

import { useAdmin } from "./AdminPanel";
import { Button, Card, Field, Input, Select, Switch, Textarea } from "./ui";

export function PersonaTab() {
  const { settings, update } = useAdmin();
  const s = settings!;

  return (
    <div className="space-y-5">
      <Card title="شخصیت دستیار">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="نام دستیار" hint="روی دکمهٔ شروع هم نمایش داده می‌شود.">
              <Input value={s.persona.name} onChange={(e) => update((d) => void (d.persona.name = e.target.value))} />
            </Field>
            <Field label="تعداد نوبت‌های قبلی که به خاطر می‌سپارد">
              <Input
                type="number"
                min={0}
                max={30}
                value={s.persona.historyTurns}
                onChange={(e) => update((d) => void (d.persona.historyTurns = Number(e.target.value)))}
              />
            </Field>
          </div>
          <Field
            label="دستورالعمل (پرامپت سیستم)"
            hint="نقش، لحن و محدودیت‌های دستیار. چون پاسخ با صدا خوانده می‌شود، کوتاه‌نویسی و پرهیز از فهرست و علامت‌ها مهم است."
          >
            <Textarea rows={10} value={s.persona.systemPrompt} onChange={(e) => update((d) => void (d.persona.systemPrompt = e.target.value))} />
          </Field>
          <Button variant="ghost" className="text-xs" onClick={() => update((d) => void (d.persona.systemPrompt = DEFAULT_PERSONA_PROMPT))}>
            بازگردانی دستورالعمل پیش‌فرض
          </Button>
          <Field label="خوشامدگویی" hint="وقتی بازدیدکننده گفتگو را شروع می‌کند، آواتار این جمله را می‌گوید.">
            <Input value={s.persona.greeting} onChange={(e) => update((d) => void (d.persona.greeting = e.target.value))} />
          </Field>
          <Switch checked={s.persona.greetOnStart} onChange={(v) => update((d) => void (d.persona.greetOnStart = v))} label="خوشامدگویی در شروع گفتگو" />
        </div>
      </Card>

      <Card title="استفاده از پایگاه دانش">
        <div className="space-y-4">
          <Field label="حالت پاسخ‌گویی">
            <Select
              value={s.persona.knowledgeMode}
              onChange={(e) => update((d) => void (d.persona.knowledgeMode = e.target.value as typeof s.persona.knowledgeMode))}
            >
              <option value="prefer">ترجیح پایگاه دانش؛ در غیر این صورت دانش عمومی</option>
              <option value="strict">فقط پایگاه دانش (پاسخ غیرمرتبط نمی‌دهد)</option>
              <option value="off">بدون پایگاه دانش</option>
            </Select>
          </Field>
          {s.persona.knowledgeMode === "strict" && (
            <Field label="پاسخ وقتی اطلاعاتی پیدا نشد">
              <Input value={s.persona.strictFallback} onChange={(e) => update((d) => void (d.persona.strictFallback = e.target.value))} />
            </Field>
          )}
        </div>
      </Card>

      <Card title="رفتار گفتگو" description="تنظیم شنیدن و نوبت‌گیری.">
        <div className="space-y-4">
          <Switch
            checked={s.conversation.allowBargeIn}
            onChange={(v) => update((d) => void (d.conversation.allowBargeIn = v))}
            label="بازدیدکننده بتواند وسط صحبت آواتار حرف بزند (فقط با هدفون یا محیط کم‌پژواک)"
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={`حساسیت شنیدن: ${s.conversation.speechThreshold.toFixed(2)}`} hint="عدد بیشتر = صداهای ضعیف و نویز کمتر شنیده می‌شوند.">
              <input
                type="range"
                min={0.3}
                max={0.9}
                step={0.05}
                value={s.conversation.speechThreshold}
                onChange={(e) => update((d) => void (d.conversation.speechThreshold = Number(e.target.value)))}
                className="w-full accent-[var(--color-accent)]"
              />
            </Field>
            <Field label={`مکث پایان جمله: ${s.conversation.silenceMs}ms`} hint="چقدر سکوت یعنی صحبت تمام شد. برای گویندگان آرام بیشتر کنید.">
              <input
                type="range"
                min={400}
                max={2500}
                step={100}
                value={s.conversation.silenceMs}
                onChange={(e) => update((d) => void (d.conversation.silenceMs = Number(e.target.value)))}
                className="w-full accent-[var(--color-accent)]"
              />
            </Field>
            <Field label="حداکثر طول هر صحبت (ثانیه)">
              <Input
                type="number"
                min={5}
                max={60}
                value={s.conversation.maxUtteranceSec}
                onChange={(e) => update((d) => void (d.conversation.maxUtteranceSec = Number(e.target.value)))}
              />
            </Field>
          </div>
        </div>
      </Card>

      <Card title="متن‌های صفحه">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="عنوان">
            <Input value={s.ui.title} onChange={(e) => update((d) => void (d.ui.title = e.target.value))} />
          </Field>
          <Field label="توضیح زیر آواتار">
            <Input value={s.ui.subtitle} onChange={(e) => update((d) => void (d.ui.subtitle = e.target.value))} />
          </Field>
        </div>
      </Card>

      <Card title="محدودیت مصرف" description="هر گفتگو هزینهٔ واقعی دارد؛ این سقف‌ها از سوءاستفاده جلوگیری می‌کنند.">
        <div className="grid gap-4 sm:grid-cols-2">
          {(
            [
              ["turnsPerMinute", "پرسش در دقیقه (هر بازدیدکننده)"],
              ["turnsPerDay", "پرسش در روز (هر بازدیدکننده)"],
              ["avatarSessionsPerHour", "نشست آواتار ویدیویی در ساعت (هر بازدیدکننده)"],
              ["avatarSessionsPerDayGlobal", "کل نشست‌های آواتار ویدیویی در روز"],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label}>
              <Input type="number" min={1} value={s.limits[key]} onChange={(e) => update((d) => void (d.limits[key] = Number(e.target.value)))} />
            </Field>
          ))}
        </div>
      </Card>
    </div>
  );
}
