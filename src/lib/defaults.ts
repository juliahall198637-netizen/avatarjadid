// Shared by the server settings schema and the admin panel.

export const DEFAULT_PERSONA_PROMPT = `تو دستیار هوشمند و خوش‌برخورد این مجموعه هستی و به پرسش‌های بازدیدکنندگان پاسخ می‌دهی.
اگر جواب را نمی‌دانی، صادقانه بگو و حدس نزن.`;

export const TONE_PRESETS = ["PROFESSIONAL_FRIENDLY", "FRIENDLY", "FORMAL", "EDUCATIONAL", "CONCISE", "WITTY"] as const;
export type TonePreset = (typeof TONE_PRESETS)[number];

export const TONE_LABELS: Record<TonePreset, string> = {
  PROFESSIONAL_FRIENDLY: "حرفه‌ای و گرم",
  FRIENDLY: "دوستانه و ساده",
  FORMAL: "رسمی و اداری",
  EDUCATIONAL: "آموزشی (گام‌به‌گام)",
  CONCISE: "بسیار کوتاه و مستقیم",
  WITTY: "هوشمند و کمی شوخ‌طبع",
};

export const ANSWER_LENGTH_LABELS = {
  SHORT: "کوتاه (حداکثر دو جمله)",
  CONCISE: "متوسط (حداکثر چهار جمله)",
  BALANCED: "مفصل‌تر (یک تا دو بند کوتاه)",
} as const;

export const HUMOR_LABELS = ["بدون شوخی", "بسیار ملایم", "گاهی طنز ملایم", "شوخ‌طبع و محترمانه", "سرزنده و شوخ"];
export const FORMALITY_LABELS = ["کاملاً محاوره‌ای", "نیمه‌محاوره", "فارسی معیار", "رسمی و اداری", "کاملاً رسمی"];
