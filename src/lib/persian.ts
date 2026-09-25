// Ported from the earlier Raviostan project (persian.ts + persian-speech.ts).

/** Persian text normalization shared by ingestion, retrieval and TTS. */
const ARABIC_TO_PERSIAN: Record<string, string> = {
  "ي": "ی",
  "ك": "ک",
  "ۀ": "ه",
  "ة": "ه",
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9",
  "۰": "0",
  "۱": "1",
  "۲": "2",
  "۳": "3",
  "۴": "4",
  "۵": "5",
  "۶": "6",
  "۷": "7",
  "۸": "8",
  "۹": "9",
};

export function normalizePersian(input: string): string {
  let out = "";
  for (const char of input.normalize("NFC")) {
    out += ARABIC_TO_PERSIAN[char] ?? char;
  }
  return out
    // remove tashkeel / diacritics
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    // zero-width non joiner kept, other invisible chars dropped
    .replace(/[\u200B\u200E\u200F\uFEFF]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Semantic-ish chunking: paragraph aware with a character budget and overlap. */
export function chunkPersianText(
  text: string,
  { maxChars = 1100, overlap = 150 }: { maxChars?: number; overlap?: number } = {},
): string[] {
  const clean = normalizePersian(text);
  if (!clean) return [];

  const paragraphs = clean.split(/\n{2,}/).flatMap((paragraph) => {
    if (paragraph.length <= maxChars) return [paragraph];
    return paragraph.split(/(?<=[.!?؟。])\s+/);
  });

  const chunks: string[] = [];
  let current = "";

  for (const piece of paragraphs) {
    const candidate = current ? `${current}\n${piece}` : piece;
    if (candidate.length > maxChars && current) {
      chunks.push(current.trim());
      const tail = current.slice(-overlap);
      current = `${tail}\n${piece}`;
    } else {
      current = candidate;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks.filter((chunk) => chunk.replace(/\s/g, "").length > 30);
}
const ONES = [
  "",
  "یک",
  "دو",
  "سه",
  "چهار",
  "پنج",
  "شش",
  "هفت",
  "هشت",
  "نه",
];
const TEENS = [
  "ده",
  "یازده",
  "دوازده",
  "سیزده",
  "چهارده",
  "پانزده",
  "شانزده",
  "هفده",
  "هجده",
  "نوزده",
];
const TENS = ["", "", "بیست", "سی", "چهل", "پنجاه", "شصت", "هفتاد", "هشتاد", "نود"];
const HUNDREDS = [
  "",
  "صد",
  "دویست",
  "سیصد",
  "چهارصد",
  "پانصد",
  "ششصد",
  "هفتصد",
  "هشتصد",
  "نهصد",
];
const SCALES: { value: number; name: string }[] = [
  { value: 1_000_000_000, name: "میلیارد" },
  { value: 1_000_000, name: "میلیون" },
  { value: 1_000, name: "هزار" },
];

function belowThousand(value: number): string {
  const parts: string[] = [];
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  if (hundreds) parts.push(HUNDREDS[hundreds]!);
  if (rest >= 10 && rest < 20) parts.push(TEENS[rest - 10]!);
  else {
    const tens = Math.floor(rest / 10);
    const ones = rest % 10;
    if (tens) parts.push(TENS[tens]!);
    if (ones) parts.push(ONES[ones]!);
  }
  return parts.join(" و ");
}

/** 1۴۵۰ → «هزار و چهارصد و پنجاه». */
export function persianNumberToWords(input: number): string {
  if (!Number.isFinite(input)) return "";
  if (input === 0) return "صفر";
  const negative = input < 0;
  let value = Math.abs(Math.trunc(input));
  const decimals = Math.abs(input) - value;

  const parts: string[] = [];
  for (const scale of SCALES) {
    if (value >= scale.value) {
      const count = Math.floor(value / scale.value);
      value %= scale.value;
      parts.push(count === 1 ? scale.name : `${belowThousand(count)} ${scale.name}`);
    }
  }
  if (value) parts.push(belowThousand(value));

  let words = parts.filter(Boolean).join(" و ");
  if (decimals > 0) {
    const fraction = String(Math.round(decimals * 100)).padStart(2, "0");
    words += ` ممیز ${belowThousand(Number(fraction))}`;
  }
  return negative ? `منفی ${words}` : words;
}

/** Latin words a Persian narrator otherwise pronounces with a foreign accent. */
const LATIN_TERMS: [RegExp, string][] = [
  [/\bPDF\b/gi, "پی‌دی‌اف"],
  [/\bAPI\b/gi, "ای‌پی‌آی"],
  [/\bID\b/g, "شناسه"],
  [/\bOK\b/gi, "اوکی"],
  [/\bSMS\b/gi, "پیامک"],
  [/\bEmail\b/gi, "ایمیل"],
  [/\bURL\b/gi, "نشانی اینترنتی"],
  [/\bAI\b/g, "هوش مصنوعی"],
];

const ABBREVIATIONS: [RegExp, string][] = [
  [/(^|\s)ص\.(?=\s|$)/g, "$1صفحهٔ "],
  [/(^|\s)ره(?=\s|$)/g, "$1رحمة‌الله‌علیه"],
  [/(^|\s)و غیره(?=\s|$)/g, "$1و موارد دیگر"],
  [/\bو\/یا\b/g, "و یا"],
];

/** Converts written Persian into fluent, speakable Persian. */
export function toSpeechText(input: string): string {
  let text = input.normalize("NFC");

  // Markdown and bullet symbols are read aloud otherwise.
  text = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/(\*\*|__|\*|_)/g, "")
    .replace(/^\s*[-–—•]\s+/gm, "")
    .replace(/^\s*(\d+)[.)]\s+/gm, "$1. ")
    .replace(/\|/g, " ")
    .replace(/[<>#^~]/g, " ");

  // Arabic digits/letters → Persian equivalents handled by the shared normalizer's map.
  text = text
    .replace(/[٠۰]/g, "0")
    .replace(/[١۱]/g, "1")
    .replace(/[٢۲]/g, "2")
    .replace(/[٣۳]/g, "3")
    .replace(/[٤۴]/g, "4")
    .replace(/[٥۵]/g, "5")
    .replace(/[٦۶]/g, "6")
    .replace(/[٧۷]/g, "7")
    .replace(/[٨۸]/g, "8")
    .replace(/[٩۹]/g, "9")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک");

  for (const [pattern, replacement] of LATIN_TERMS) text = text.replace(pattern, replacement);
  for (const [pattern, replacement] of ABBREVIATIONS) text = text.replace(pattern, replacement);

  // Units and symbols before numbers, so the numeral pass sees plain digits.
  text = text
    .replace(/(\d)\s*%/g, "$1 درصد")
    .replace(/٪/g, " درصد")
    .replace(/(\d)\s*(ریال|تومان)/g, "$1 $2")
    .replace(/&/g, " و ");

  // Dates: 1403/05/12 → «۱۴۰۳ ماه ۵ روز ۱۲» reads badly; say it as a date.
  text = text.replace(/\b(\d{4})[/-](\d{1,2})[/-](\d{1,2})\b/g, (_m, y, mo, d) =>
    `${persianNumberToWords(Number(d))} ماه ${persianNumberToWords(Number(mo))} سال ${persianNumberToWords(Number(y))}`,
  );

  // Times: 14:30 → «ساعت چهارده و سی دقیقه».
  text = text.replace(/\b(\d{1,2}):(\d{2})\b/g, (_m, h, mi) =>
    `ساعت ${persianNumberToWords(Number(h))} و ${persianNumberToWords(Number(mi))} دقیقه`,
  );

  // Remaining numerals (thousand separators included) become words.
  text = text.replace(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g, (match) =>
    persianNumberToWords(Number(match.replace(/,/g, ""))),
  );

  // Prosody: normalize punctuation and give the model clear pause points.
  text = text
    .replace(/\s*\.\s*/g, "، ")
    .replace(/\s*[;؛]\s*/g, "، ")
    .replace(/\s*:\s*/g, "، ")
    .replace(/\s*،\s*/g, "، ")
    .replace(/\s*\?\s*/g, "؟ ")
    .replace(/\s*!\s*/g, "! ")
    .replace(/(؟|!)\s*/g, "$1 ")
    .replace(/\n{2,}/g, "... ")
    .replace(/\n/g, "، ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/(،\s*){2,}/g, "، ")
    .trim();

  // A trailing separator sounds like an unfinished sentence.
  text = text.replace(/[،\s]+$/g, "");
  return text.endsWith("؟") || text.endsWith("!") ? text : `${text}.`;
}

/**
 * Cuts a streamed answer into speakable sentences as tokens arrive, so the
 * first sentence can be synthesized while the model is still writing.
 * The first sentence is released early (on a comma) to cut response latency.
 */
export class SentenceSplitter {
  private buffer = "";
  private emitted = 0;

  push(delta: string): string[] {
    this.buffer += delta;
    const out: string[] = [];
    for (;;) {
      const cut = this.findCut();
      if (cut < 0) break;
      const sentence = this.buffer.slice(0, cut).trim();
      this.buffer = this.buffer.slice(cut);
      if (sentence.replace(/[\s.،,!?؟…]/g, "")) {
        out.push(sentence);
        this.emitted++;
      }
    }
    return out;
  }

  flush(): string[] {
    const rest = this.buffer.trim();
    this.buffer = "";
    return rest.replace(/[\s.،,!?؟…]/g, "") ? [rest] : [];
  }

  private findCut(): number {
    const text = this.buffer;
    const hard = /[.!?؟…\n]+["»)\]]*\s/g;
    let match: RegExpExecArray | null;
    while ((match = hard.exec(text))) {
      const end = match.index + match[0].length;
      // "1.5" or "ص." style dots inside a word are not sentence ends.
      if (match[0].startsWith(".") && /\d$/.test(text.slice(0, match.index)) && /^\d/.test(text.slice(end))) continue;
      if (end >= 8) return end;
    }
    const softLimit = this.emitted === 0 ? 40 : 160;
    if (text.length > softLimit) {
      const soft = /[،,؛;:]\s/g;
      let last = -1;
      while ((match = soft.exec(text))) {
        if (match.index + match[0].length >= 20) last = match.index + match[0].length;
      }
      if (last > 0) return last;
    }
    // Runaway sentence without punctuation: cut at a space.
    if (text.length > 260) {
      const space = text.lastIndexOf(" ", 220);
      return space > 40 ? space + 1 : 220;
    }
    return -1;
  }
}

/** Crude keyword tokens for retrieval when no embedding service is configured. */
export function keywordTokens(text: string): string[] {
  return normalizePersian(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\u200c ]+/gu, " ")
    .split(/[\s\u200c]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

const STOPWORDS = new Set(
  "و در به از که این آن با برای را است هست یک تا بر هم نیز یا اما اگر چه چرا چطور چگونه کجا کی چی چیه می ها های ای شود شد بود باشد کنم کنید کند کرد the a an of to in is are and or".split(" "),
);
