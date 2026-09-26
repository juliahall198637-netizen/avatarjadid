import { z } from "zod";

import { DEFAULT_PERSONA_PROMPT, TONE_PRESETS } from "@/lib/defaults";

import { db } from "./db";

const target = z.object({
  providerId: z.string().uuid(),
  model: z.string().max(200).default(""),
});

const llmTarget = target.extend({
  temperature: z.number().min(0).max(2).nullable().default(null),
  maxTokens: z.number().int().min(64).max(8000).nullable().default(null),
  effort: z.enum(["low", "medium", "high"]).nullable().default(null),
});

const sttTarget = target.extend({
  language: z.string().max(10).default("fa"),
  // Words the recogniser should expect: names, places, product terms.
  hint: z.string().max(500).default(""),
});

const ttsTarget = target.extend({
  voice: z.string().max(200).default(""),
  speed: z.number().min(0.5).max(2).default(1),
  instructions: z.string().max(500).default(""),
});

const mouthBox = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  w: z.number().min(1).max(100),
  h: z.number().min(1).max(100),
});

export const settingsSchema = z.object({
  persona: z
    .object({
      name: z.string().max(80).default("دستیار"),
      // Role and domain instructions written by the admin. Persian fluency and
      // voice-output rules are always added by persona.ts.
      systemPrompt: z.string().max(8000).default(DEFAULT_PERSONA_PROMPT),
      tonePreset: z.enum(TONE_PRESETS).default("PROFESSIONAL_FRIENDLY"),
      humorLevel: z.number().int().min(0).max(4).default(0),
      formalityLevel: z.number().int().min(1).max(5).default(3),
      answerLength: z.enum(["SHORT", "CONCISE", "BALANCED"]).default("CONCISE"),
      greeting: z.string().max(400).default("سلام! خوش آمدید. هر سوالی دارید بپرسید، در خدمتم."),
      greetOnStart: z.boolean().default(true),
      historyTurns: z.number().int().min(0).max(30).default(8),
      // off: never use the knowledge base; prefer: use it when relevant;
      // strict: answer only from it and politely decline otherwise.
      knowledgeMode: z.enum(["off", "prefer", "strict"]).default("prefer"),
      strictFallback: z.string().max(400).default("متأسفانه در این مورد اطلاعات تأییدشده‌ای ندارم."),
    })
    .prefault({}),
  llm: z
    .object({ primary: llmTarget.nullable().default(null), fallback: llmTarget.nullable().default(null) })
    .prefault({}),
  stt: z
    .object({ primary: sttTarget.nullable().default(null), fallback: sttTarget.nullable().default(null) })
    .prefault({}),
  tts: z
    .object({ primary: ttsTarget.nullable().default(null), fallback: ttsTarget.nullable().default(null) })
    .prefault({}),
  embeddings: target.nullable().default(null),
  avatar: z
    .object({
      type: z.enum(["builtin", "simli", "liveavatar", "did", "bey"]).default("builtin"),
      builtin: z
        .object({
          portraitAssetId: z.string().uuid().nullable().default(null),
          mouthSoftAssetId: z.string().uuid().nullable().default(null),
          mouthRoundAssetId: z.string().uuid().nullable().default(null),
          mouthOpenAssetId: z.string().uuid().nullable().default(null),
          mouthBox: mouthBox.default({ x: 42, y: 62, w: 16, h: 8 }),
        })
        .prefault({}),
      simli: z
        .object({ providerId: z.string().uuid().nullable().default(null), faceId: z.string().max(200).default("") })
        .prefault({}),
      liveavatar: z
        .object({
          providerId: z.string().uuid().nullable().default(null),
          avatarId: z.string().max(200).default(""),
          sandbox: z.boolean().default(false),
        })
        .prefault({}),
      bey: z
        .object({
          providerId: z.string().uuid().nullable().default(null),
          livekitProviderId: z.string().uuid().nullable().default(null),
          avatarId: z.string().max(200).default(""),
        })
        .prefault({}),
      did: z
        .object({
          providerId: z.string().uuid().nullable().default(null),
          // Public https image of a face, or empty to use the built-in portrait.
          sourceUrl: z.string().max(1000).default(""),
        })
        .prefault({}),
    })
    .prefault({}),
  conversation: z
    .object({
      // Let the visitor interrupt the avatar by speaking. Needs good echo
      // cancellation (headphones or a quiet room), otherwise the avatar hears itself.
      allowBargeIn: z.boolean().default(false),
      speechThreshold: z.number().min(0.2).max(0.95).default(0.5),
      silenceMs: z.number().int().min(300).max(3000).default(900),
      maxUtteranceSec: z.number().int().min(5).max(60).default(30),
      // Ends the conversation after this much silence (saves cost; readies a
      // kiosk for the next visitor). 0 disables.
      idleEndSec: z.number().int().min(0).max(900).default(90),
      maxSessionMin: z.number().int().min(1).max(120).default(15),
    })
    .prefault({}),
  policy: z
    .object({
      blockPolitical: z.boolean().default(false),
      blockReligious: z.boolean().default(false),
      // One word or phrase per line; any question containing one is refused
      // immediately, without calling the answer model.
      blockedKeywords: z.string().max(4000).default(""),
      refusalText: z.string().max(400).default("پوزش می‌خواهم؛ در این موضوع نمی‌توانم پاسخ بدهم. اگر پرسش دیگری دارید، در خدمتم."),
    })
    .prefault({}),
  privacy: z
    .object({
      // Conversations older than this are deleted automatically; 0 keeps them forever.
      retentionDays: z.number().int().min(0).max(3650).default(90),
    })
    .prefault({}),
  network: z.object({ proxyEnabled: z.boolean().default(false) }).prefault({}),
  limits: z
    .object({
      turnsPerMinute: z.number().int().min(1).max(200).default(12),
      turnsPerDay: z.number().int().min(1).max(10000).default(300),
      avatarSessionsPerHour: z.number().int().min(1).max(100).default(6),
      avatarSessionsPerDayGlobal: z.number().int().min(1).max(100000).default(300),
    })
    .prefault({}),
  ui: z
    .object({
      title: z.string().max(80).default("آواتار هوشمند"),
      subtitle: z.string().max(200).default("برای شروع گفتگو دکمه را بزنید و صحبت کنید."),
    })
    .prefault({}),
});

export type AppSettings = z.infer<typeof settingsSchema>;
export type LlmTarget = z.infer<typeof llmTarget>;
export type SttTarget = z.infer<typeof sttTarget>;
export type TtsTarget = z.infer<typeof ttsTarget>;

let cache: { value: AppSettings; at: number } | null = null;

export async function getSettings(): Promise<AppSettings> {
  if (cache && Date.now() - cache.at < 5_000) return cache.value;
  const rows = await db()`select data from app_settings where id = 1`;
  const parsed = settingsSchema.safeParse(rows[0]?.data ?? {});
  if (!parsed.success) console.error("[settings] stored settings are invalid; using defaults", parsed.error.issues[0]);
  const value = parsed.success ? parsed.data : settingsSchema.parse({});
  cache = { value, at: Date.now() };
  return value;
}

export async function saveSettings(input: unknown, adminId: string | null): Promise<AppSettings> {
  const value = settingsSchema.parse(input);
  const sql = db();
  await sql.begin(async (tx) => {
    await tx`
      insert into app_settings (id, data, updated_by) values (1, ${tx.json(value)}, ${adminId})
      on conflict (id) do update set data = excluded.data, updated_at = now(), updated_by = excluded.updated_by`;
    await tx`insert into settings_history (data, created_by) values (${tx.json(value)}, ${adminId})`;
    await tx`delete from settings_history where id not in (select id from settings_history order by id desc limit 50)`;
  });
  cache = null;
  return value;
}
