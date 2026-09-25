// Shared between server and admin UI: which provider kinds exist, what each
// can do, and ready-made presets. Base URLs are editable in the panel, so an
// Iranian OpenAI-compatible gateway works the same way as OpenAI itself.

export type ProviderKind = "openai" | "anthropic" | "azure_speech" | "elevenlabs" | "simli" | "liveavatar" | "did" | "mock";
export type Capability = "llm" | "stt" | "tts" | "embeddings" | "avatar";

export const CAPABILITIES: Record<ProviderKind, Capability[]> = {
  openai: ["llm", "stt", "tts", "embeddings"],
  anthropic: ["llm"],
  azure_speech: ["stt", "tts"],
  elevenlabs: ["stt", "tts"],
  simli: ["avatar"],
  liveavatar: ["avatar"],
  did: ["avatar"],
  mock: ["llm", "stt", "tts", "embeddings"],
};

export const KIND_LABELS: Record<ProviderKind, string> = {
  openai: "سازگار با OpenAI",
  anthropic: "Anthropic (Claude)",
  azure_speech: "Azure Speech",
  elevenlabs: "ElevenLabs",
  simli: "Simli (آواتار)",
  liveavatar: "HeyGen LiveAvatar",
  did: "D-ID (آواتار)",
  mock: "آزمایشی (بدون هزینه)",
};

export interface Preset {
  id: string;
  label: string;
  kind: ProviderKind;
  baseUrl?: string;
  config?: Record<string, unknown>;
  note?: string;
  defaults?: Partial<Record<Capability, { model?: string; voice?: string }>>;
}

export const PRESETS: Preset[] = [
  {
    id: "openai",
    label: "OpenAI",
    kind: "openai",
    baseUrl: "https://api.openai.com/v1",
    note: "از سرور داخل ایران فقط با پروکسی در دسترس است.",
    defaults: {
      llm: { model: "gpt-4o-mini" },
      stt: { model: "gpt-4o-transcribe" },
      tts: { model: "gpt-4o-mini-tts", voice: "coral" },
      embeddings: { model: "text-embedding-3-small" },
    },
  },
  {
    id: "avalai",
    label: "AvalAI (درگاه ایرانی)",
    kind: "openai",
    baseUrl: "https://api.avalai.ir/v1",
    note: "درگاه سازگار با OpenAI که از داخل ایران بدون پروکسی کار می‌کند. آدرس را با مستندات سرویس تطبیق دهید.",
    defaults: {
      llm: { model: "gpt-4o-mini" },
      stt: { model: "whisper-1" },
      tts: { model: "tts-1", voice: "alloy" },
      embeddings: { model: "text-embedding-3-small" },
    },
  },
  {
    id: "gapgpt",
    label: "GapGPT (درگاه ایرانی)",
    kind: "openai",
    baseUrl: "https://api.gapgpt.app/v1",
    note: "درگاه سازگار با OpenAI. آدرس را با مستندات سرویس تطبیق دهید.",
    defaults: { llm: { model: "gpt-4o-mini" } },
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    kind: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    defaults: { llm: { model: "google/gemini-2.5-flash" } },
  },
  {
    id: "gemini",
    label: "Google Gemini",
    kind: "openai",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaults: { llm: { model: "gemini-2.5-flash" }, embeddings: { model: "text-embedding-004" } },
  },
  {
    id: "groq",
    label: "Groq",
    kind: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    defaults: { llm: { model: "llama-3.3-70b-versatile" }, stt: { model: "whisper-large-v3-turbo" } },
  },
  {
    id: "anthropic",
    label: "Anthropic Claude",
    kind: "anthropic",
    baseUrl: "https://api.anthropic.com",
    defaults: { llm: { model: "claude-opus-5" } },
  },
  {
    id: "azure",
    label: "Azure Speech (بهترین صدای فارسی)",
    kind: "azure_speech",
    config: { region: "westeurope" },
    note: "صداهای فارسی: fa-IR-DilaraNeural (زن) و fa-IR-FaridNeural (مرد).",
    defaults: { tts: { voice: "fa-IR-DilaraNeural" }, stt: { model: "" } },
  },
  {
    id: "elevenlabs",
    label: "ElevenLabs",
    kind: "elevenlabs",
    baseUrl: "https://api.elevenlabs.io",
    defaults: { tts: { model: "eleven_v3" }, stt: { model: "scribe_v1" } },
  },
  {
    id: "simli",
    label: "Simli",
    kind: "simli",
    baseUrl: "https://api.simli.ai",
  },
  {
    id: "liveavatar",
    label: "HeyGen LiveAvatar",
    kind: "liveavatar",
    baseUrl: "https://api.liveavatar.com",
  },
  {
    id: "did",
    label: "D-ID",
    kind: "did",
    baseUrl: "https://api.d-id.com",
    note: "کلید API را همان‌طور که در D-ID Studio نمایش داده می‌شود وارد کنید. D-ID فقط چهره و لب را می‌سازد؛ صدای فارسی از سرویس صدای شما می‌آید.",
  },
  {
    id: "mock",
    label: "آزمایشی (بدون هزینه)",
    kind: "mock",
    note: "برای آزمایش مسیر گفتگو بدون کلید واقعی. فقط وقتی ENABLE_MOCK_PROVIDERS=1 باشد فعال است.",
  },
];

export const ANTHROPIC_MODELS = ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"];

export const AZURE_PERSIAN_VOICES = ["fa-IR-DilaraNeural", "fa-IR-FaridNeural"];
export const OPENAI_VOICES = ["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse"];
