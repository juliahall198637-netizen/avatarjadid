import { normalizePersian } from "@/lib/persian";

import { streamChat } from "./providers/llm";
import { providerFor } from "./providers/registry";
import type { AppSettings } from "./settings";

// Ported from Raviostan's policy gate: a cheap keyword prefilter, then a model
// confirmation so ordinary questions that merely contain a hint word pass.

const POLITICAL = ["سیاس", "انتخابات", "دولت", "مجلس", "رئیس‌جمهور", "رییس جمهور", "حزب", "تحریم", "براندازی", "اپوزیسیون", "جنگ", "رهبر"];
const RELIGIOUS = ["مذهب", "دین", "اسلام", "مسیح", "یهود", "نماز", "روزه", "قرآن", "فتوا", "حلال", "حرام", "امام", "خدا", "پیامبر"];

export type PolicyVerdict = { blocked: false } | { blocked: true; reason: "keyword" | "political" | "religious" };

function has(text: string, hints: string[]) {
  return hints.some((h) => text.includes(normalizePersian(h)));
}

async function classify(settings: AppSettings, question: string, signal?: AbortSignal): Promise<string | null> {
  const target = settings.llm.primary;
  if (!target) return null;
  const provider = await providerFor(target.providerId, "llm");
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 10_000);
  signal?.addEventListener("abort", () => abort.abort(), { once: true });
  try {
    let out = "";
    const classifierTarget = {
      ...target,
      temperature: null,
      // Anthropic needs room for adaptive thinking; OpenAI-compatible models
      // differ on token parameters, so we just stop reading early instead.
      maxTokens: provider.kind === "anthropic" ? 512 : null,
      effort: provider.kind === "anthropic" ? ("low" as const) : null,
    };
    for await (const delta of streamChat(provider, classifierTarget, {
      system:
        "پرسش کاربر را دسته‌بندی کن. فقط یکی از این سه کلمه را بدون توضیح بازگردان: POLITICAL اگر پرسش دربارهٔ سیاست، حکومت، احزاب یا مناقشات سیاسی است؛ RELIGIOUS اگر دربارهٔ باورها، احکام یا مناقشات دینی است؛ NONE در سایر موارد.",
      messages: [{ role: "user", content: question }],
      signal: abort.signal,
    })) {
      out += delta;
      if (out.length > 24) break;
    }
    return out.toUpperCase();
  } finally {
    clearTimeout(timer);
    abort.abort();
  }
}

export async function checkPolicy(settings: AppSettings, question: string, signal?: AbortSignal): Promise<PolicyVerdict> {
  const { policy } = settings;
  const text = normalizePersian(question).toLowerCase();

  const keywords = policy.blockedKeywords
    .split("\n")
    .map((k) => normalizePersian(k).toLowerCase().trim())
    .filter(Boolean);
  if (keywords.some((k) => text.includes(k))) return { blocked: true, reason: "keyword" };

  const political = policy.blockPolitical && has(text, POLITICAL);
  const religious = policy.blockReligious && has(text, RELIGIOUS);
  if (!political && !religious) return { blocked: false };

  try {
    const label = await classify(settings, question, signal);
    if (label === null) return { blocked: true, reason: political ? "political" : "religious" };
    if (policy.blockPolitical && label.includes("POLITICAL")) return { blocked: true, reason: "political" };
    if (policy.blockReligious && label.includes("RELIGIOUS")) return { blocked: true, reason: "religious" };
    return { blocked: false };
  } catch {
    // Fail closed on the prefiltered topic: the admin explicitly asked to block it.
    return { blocked: true, reason: political ? "political" : "religious" };
  }
}
