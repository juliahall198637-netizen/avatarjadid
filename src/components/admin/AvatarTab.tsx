"use client";

import { ImageUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { PortraitWithMouth } from "@/components/avatar/BuiltinAvatar";
import type { AppSettings } from "@/lib/server/settings";

import { useAdmin } from "./AdminPanel";
import { api, attempt, Button, Card, cx, Field, Input, Select, Switch } from "./ui";

type Builtin = AppSettings["avatar"]["builtin"];
type AssetKey = "portraitAssetId" | "mouthSoftAssetId" | "mouthRoundAssetId" | "mouthOpenAssetId";

const TYPES = [
  {
    id: "builtin",
    title: "آواتار داخلی",
    text: "بدون هزینه و بدون سرویس خارجی؛ از داخل ایران همیشه در دسترس. عکس + حرکت لب هماهنگ با صدا.",
  },
  { id: "simli", title: "Simli", text: "ویدیوی زندهٔ چهره با لب‌خوانی واقعی. نیاز به کلید Simli و Face ID." },
  { id: "liveavatar", title: "HeyGen LiveAvatar", text: "ویدیوی زندهٔ چهره (حالت LITE). نیاز به کلید LiveAvatar و شناسهٔ آواتار." },
  { id: "did", title: "D-ID", text: "ویدیوی چهره از روی یک عکس، با لب‌خوانی صدای فارسی خودمان. نیاز به کلید D-ID." },
] as const;

const FRAMES: { key: AssetKey; label: string }[] = [
  { key: "portraitAssetId", label: "دهان بسته (تصویر اصلی)" },
  { key: "mouthSoftAssetId", label: "دهان کمی باز" },
  { key: "mouthRoundAssetId", label: "دهان گرد" },
  { key: "mouthOpenAssetId", label: "دهان کاملاً باز" },
];

export function AvatarTab() {
  const { settings, update, providers } = useAdmin();
  const avatar = settings!.avatar;
  const avatarProviders = (kind: string) => providers.filter((p) => p.kind === kind);

  return (
    <div className="space-y-5">
      <Card title="نوع آواتار">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => update((d) => void (d.avatar.type = t.id))}
              className={cx(
                "rounded-xl border p-4 text-right transition",
                avatar.type === t.id ? "border-accent bg-accent/10" : "border-line hover:bg-white/5",
              )}
            >
              <p className="font-bold">{t.title}</p>
              <p className="mt-1 text-xs leading-6 text-muted">{t.text}</p>
            </button>
          ))}
        </div>
        {avatar.type !== "builtin" && (
          <p className="mt-4 rounded-lg bg-warm/10 px-3 py-2 text-xs leading-6 text-warm">
            ویدیوی این سرویس‌ها مستقیم از مرورگر بازدیدکننده دریافت می‌شود. کاربران داخل ایران ممکن است بدون فیلترشکن به آن دسترسی نداشته باشند. صدا و مغز فارسی
            همچنان از سرور شما می‌آید؛ این سرویس فقط چهره و لب را می‌سازد.
          </p>
        )}
      </Card>

      {avatar.type === "builtin" && <BuiltinEditor builtin={avatar.builtin} />}

      {avatar.type === "simli" && (
        <Card title="تنظیمات Simli">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="سرویس Simli">
              <Select value={avatar.simli.providerId ?? ""} onChange={(e) => update((d) => void (d.avatar.simli.providerId = e.target.value || null))}>
                <option value="">— انتخاب کنید —</option>
                {avatarProviders("simli").map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Face ID" hint="از داشبورد Simli، بخش Faces.">
              <Input dir="ltr" value={avatar.simli.faceId} onChange={(e) => update((d) => void (d.avatar.simli.faceId = e.target.value.trim()))} />
            </Field>
          </div>
        </Card>
      )}

      {avatar.type === "did" && (
        <Card
          title="تنظیمات D-ID"
          description="D-ID از روی یک عکس چهره، ویدیوی زنده می‌سازد و لب را با صدای فارسی تولیدشده در سرور شما هماهنگ می‌کند (عامل آمادهٔ D-ID استفاده نمی‌شود)."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="سرویس D-ID">
              <Select value={avatar.did.providerId ?? ""} onChange={(e) => update((d) => void (d.avatar.did.providerId = e.target.value || null))}>
                <option value="">— انتخاب کنید —</option>
                {avatarProviders("did").map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="نشانی تصویر چهره (اختیاری)"
              hint="نشانی https یک عکس روبه‌رو و واضح. خالی بگذارید تا «تصویر اصلی» آواتار داخلی (بخش پایین همین صفحه) خودکار به D-ID فرستاده شود."
            >
              <Input dir="ltr" value={avatar.did.sourceUrl} onChange={(e) => update((d) => void (d.avatar.did.sourceUrl = e.target.value.trim()))} placeholder="https://…/face.jpg" />
            </Field>
          </div>
          <p className="mt-3 text-xs leading-6 text-muted">
            هر جمله جداگانه به D-ID فرستاده می‌شود و شروع هر بخش حدود یک ثانیه طول می‌کشد؛ برای کاهش مکث، جمله‌هایی که حین صحبت آماده می‌شوند یکجا ارسال می‌شوند.
          </p>
        </Card>
      )}

      {avatar.type === "did" && !avatar.did.sourceUrl && <BuiltinEditor builtin={avatar.builtin} />}

      {avatar.type === "liveavatar" && (
        <Card title="تنظیمات HeyGen LiveAvatar">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="سرویس LiveAvatar">
              <Select
                value={avatar.liveavatar.providerId ?? ""}
                onChange={(e) => update((d) => void (d.avatar.liveavatar.providerId = e.target.value || null))}
              >
                <option value="">— انتخاب کنید —</option>
                {avatarProviders("liveavatar").map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="شناسهٔ آواتار (avatar_id)">
              <Input
                dir="ltr"
                value={avatar.liveavatar.avatarId}
                onChange={(e) => update((d) => void (d.avatar.liveavatar.avatarId = e.target.value.trim()))}
              />
            </Field>
          </div>
          <div className="mt-3">
            <Switch
              checked={avatar.liveavatar.sandbox}
              onChange={(v) => update((d) => void (d.avatar.liveavatar.sandbox = v))}
              label="حالت آزمایشی (sandbox) — بدون مصرف اعتبار، با آواتار نمایشی خود سرویس"
            />
          </div>
        </Card>
      )}
    </div>
  );
}

function BuiltinEditor({ builtin }: { builtin: Builtin }) {
  const { update } = useAdmin();
  const [previewPose, setPreviewPose] = useState<"closed" | "soft" | "round" | "open" | "cycle">("closed");
  const previewRef = useRef<HTMLDivElement>(null);
  const url = (id: string | null) => (id ? `/api/assets/${id}` : null);
  const hasMouths = Boolean(builtin.mouthSoftAssetId && builtin.mouthRoundAssetId && builtin.mouthOpenAssetId);

  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    if (previewPose !== "cycle") {
      el.dataset.mouth = previewPose;
      return;
    }
    const cycle = ["closed", "soft", "round", "open", "round", "soft"];
    let i = 0;
    const timer = setInterval(() => (el.dataset.mouth = cycle[i++ % cycle.length]!), 120);
    return () => clearInterval(timer);
  }, [previewPose]);

  async function upload(key: AssetKey, file: File) {
    const form = new FormData();
    form.append("file", file);
    form.append("kind", key);
    const result = await attempt(() => api<{ id: string }>("/api/admin/assets", { method: "POST", body: form }));
    if (result) update((d) => void (d.avatar.builtin[key] = result.id));
  }

  const box = builtin.mouthBox;
  const setBox = (k: keyof typeof box, v: number) => update((d) => void (d.avatar.builtin.mouthBox[k] = v));

  return (
    <Card
      title="تصاویر آواتار داخلی"
      description="چهار نسخه از یک تصویر با قاب کاملاً یکسان بارگذاری کنید که فقط دهان در آن‌ها فرق دارد (مثلاً با ویرایش تصویر با هوش مصنوعی). بدون تصویر، یک چهرهٔ طراحی‌شده نمایش داده می‌شود."
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {FRAMES.map(({ key, label }) => (
              <div key={key} className="flex items-center gap-3 rounded-xl border border-line p-2.5">
                <div className="size-14 shrink-0 overflow-hidden rounded-lg bg-ink">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {builtin[key] && <img src={url(builtin[key])!} alt="" className="size-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{label}</p>
                  <label className="mt-1 inline-flex cursor-pointer items-center gap-1 text-xs text-accent hover:underline">
                    <ImageUp className="size-3.5" /> {builtin[key] ? "جایگزینی" : "بارگذاری"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && upload(key, e.target.files[0])}
                    />
                  </label>
                  {builtin[key] && (
                    <button type="button" className="mr-3 text-xs text-muted hover:text-danger" onClick={() => update((d) => void (d.avatar.builtin[key] = null))}>
                      حذف
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div>
            <p className="text-sm font-medium">محدودهٔ دهان (درصد از عرض و ارتفاع تصویر)</p>
            <p className="mb-2 text-xs leading-6 text-muted">کادر خط‌چین را کمی بزرگ‌تر از لب‌ها بگیرید؛ لبه‌های کادر نرم محو می‌شوند. دکمهٔ «حرکت» را برای بررسی بزنید.</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  ["x", "فاصله از چپ"],
                  ["y", "فاصله از بالا"],
                  ["w", "عرض"],
                  ["h", "ارتفاع"],
                ] as const
              ).map(([k, label]) => (
                <Field key={k} label={`${label}: ${box[k]}٪`}>
                  <input
                    type="range"
                    min={k === "w" || k === "h" ? 2 : 0}
                    max={k === "w" || k === "h" ? 60 : 98}
                    step={0.5}
                    value={box[k]}
                    onChange={(e) => setBox(k, Number(e.target.value))}
                    className="w-full accent-[var(--color-accent)]"
                  />
                </Field>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div ref={previewRef} data-mouth="closed" className="builtin-avatar mx-auto h-80">
            {builtin.portraitAssetId ? (
              <PortraitWithMouth
                showBox
                config={{
                  type: "builtin",
                  portraitUrl: url(builtin.portraitAssetId),
                  mouthUrls: hasMouths
                    ? { soft: url(builtin.mouthSoftAssetId)!, round: url(builtin.mouthRoundAssetId)!, open: url(builtin.mouthOpenAssetId)! }
                    : null,
                  mouthBox: box,
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-line text-sm text-muted">پیش‌نمایش</div>
            )}
          </div>
          <div className="flex flex-wrap justify-center gap-1">
            {(["closed", "soft", "round", "open", "cycle"] as const).map((pose) => (
              <Button key={pose} variant={previewPose === pose ? "primary" : "ghost"} className="px-2 py-1 text-xs" onClick={() => setPreviewPose(pose)}>
                {{ closed: "بسته", soft: "کم", round: "گرد", open: "باز", cycle: "▶ حرکت" }[pose]}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
