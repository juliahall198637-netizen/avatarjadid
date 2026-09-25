"use client";

import { ANSWER_LENGTH_LABELS, DEFAULT_PERSONA_PROMPT, FORMALITY_LABELS, HUMOR_LABELS, TONE_LABELS, TONE_PRESETS } from "@/lib/defaults";

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
            label="نقش و دستورالعمل اختصاصی"
            hint="دستیار کیست و برای چه مجموعه‌ای کار می‌کند؛ مثلاً «تو دستیار پذیرش بیمارستان … هستی». قواعد فارسی روان و مناسب صدا همیشه خودکار اضافه می‌شوند."
          >
            <Textarea rows={6} value={s.persona.systemPrompt} onChange={(e) => update((d) => void (d.persona.systemPrompt = e.target.value))} />
          </Field>
          <Button variant="ghost" className="text-xs" onClick={() => update((d) => void (d.persona.systemPrompt = DEFAULT_PERSONA_PROMPT))}>
            بازگردانی دستورالعمل پیش‌فرض
          </Button>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="لحن">
              <Select value={s.persona.tonePreset} onChange={(e) => update((d) => void (d.persona.tonePreset = e.target.value as typeof s.persona.tonePreset))}>
                {TONE_PRESETS.map((t) => (
                  <option key={t} value={t}>
                    {TONE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="طول پاسخ">
              <Select
                value={s.persona.answerLength}
                onChange={(e) => update((d) => void (d.persona.answerLength = e.target.value as typeof s.persona.answerLength))}
              >
                {(Object.keys(ANSWER_LENGTH_LABELS) as (keyof typeof ANSWER_LENGTH_LABELS)[]).map((k) => (
                  <option key={k} value={k}>
                    {ANSWER_LENGTH_LABELS[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={`شوخ‌طبعی: ${HUMOR_LABELS[s.persona.humorLevel]}`}>
              <input
                type="range"
                min={0}
                max={4}
                value={s.persona.humorLevel}
                onChange={(e) => update((d) => void (d.persona.humorLevel = Number(e.target.value)))}
                className="w-full accent-[var(--color-accent)]"
              />
            </Field>
            <Field label={`رسمیت: ${FORMALITY_LABELS[s.persona.formalityLevel - 1]}`}>
              <input
                type="range"
                min={1}
                max={5}
                value={s.persona.formalityLevel}
                onChange={(e) => update((d) => void (d.persona.formalityLevel = Number(e.target.value)))}
                className="w-full accent-[var(--color-accent)]"
              />
            </Field>
          </div>
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

      <Card
        title="موضوعات ممنوع"
        description="پرسش‌های این موضوع‌ها بدون پاسخ‌گویی، با جملهٔ ثابت زیر رد می‌شوند. سیاسی و مذهبی: ابتدا با کلیدواژه و سپس با مدل تشخیص داده می‌شوند تا پرسش‌های عادی اشتباهی رد نشوند."
      >
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <Switch checked={s.policy.blockPolitical} onChange={(v) => update((d) => void (d.policy.blockPolitical = v))} label="پرهیز از موضوعات سیاسی" />
            <Switch checked={s.policy.blockReligious} onChange={(v) => update((d) => void (d.policy.blockReligious = v))} label="پرهیز از موضوعات مذهبی" />
          </div>
          <Field label="کلمه‌ها یا عبارت‌های ممنوع (هر خط یکی)" hint="هر پرسشی که یکی از این‌ها را داشته باشد، فوراً و بدون هزینهٔ مدل رد می‌شود.">
            <Textarea rows={3} value={s.policy.blockedKeywords} onChange={(e) => update((d) => void (d.policy.blockedKeywords = e.target.value))} />
          </Field>
          <Field label="پاسخ در این موارد">
            <Input value={s.policy.refusalText} onChange={(e) => update((d) => void (d.policy.refusalText = e.target.value))} />
          </Field>
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
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="پایان خودکار پس از سکوت (ثانیه)" hint="۰ = هرگز. هزینه را کم می‌کند و کیوسک را برای نفر بعد آماده می‌کند.">
              <Input
                type="number"
                min={0}
                max={900}
                value={s.conversation.idleEndSec}
                onChange={(e) => update((d) => void (d.conversation.idleEndSec = Number(e.target.value)))}
              />
            </Field>
            <Field label="حداکثر مدت هر گفتگو (دقیقه)">
              <Input
                type="number"
                min={1}
                max={120}
                value={s.conversation.maxSessionMin}
                onChange={(e) => update((d) => void (d.conversation.maxSessionMin = Number(e.target.value)))}
              />
            </Field>
          </div>
        </div>
      </Card>

      <Card title="حریم خصوصی" description="صدای خام بازدیدکنندگان ذخیره نمی‌شود؛ فقط متن گفتگوها برای مرور مدیر نگه داشته می‌شود.">
        <Field label="نگه‌داری گفتگوها (روز)" hint="گفتگوهای قدیمی‌تر خودکار حذف می‌شوند. ۰ = برای همیشه نگه‌داری شود.">
          <Input
            type="number"
            min={0}
            max={3650}
            value={s.privacy.retentionDays}
            onChange={(e) => update((d) => void (d.privacy.retentionDays = Number(e.target.value)))}
          />
        </Field>
      </Card>

      <Card title="متن‌های صفحه" description="نشانی حالت کیوسک (بدون دکمهٔ مدیریت، با دکمهٔ تمام‌صفحه): /kiosk">
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
