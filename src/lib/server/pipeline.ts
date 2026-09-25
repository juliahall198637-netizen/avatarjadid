import { SentenceSplitter, toSpeechText } from "@/lib/persian";

import { db } from "./db";
import { describeError, UpstreamError } from "./http";
import { retrieve, type RetrievedChunk } from "./knowledge";
import { buildSystemPrompt } from "./persona";
import { checkPolicy } from "./policy";
import { streamChat, type ChatMessage } from "./providers/llm";
import { providerFor } from "./providers/registry";
import { PCM_SAMPLE_RATE, synthesize, transcribe } from "./providers/speech";
import type { AppSettings, LlmTarget, SttTarget, TtsTarget } from "./settings";

// One conversational turn: speech → text → answer → Persian speech, streamed
// to the browser as NDJSON events so the avatar starts talking after the
// first sentence instead of after the whole answer.

export type TurnEvent =
  | { t: "user"; text: string }
  | { t: "delta"; text: string }
  | { t: "audio"; seq: number; text: string; sampleRate: number; pcm: string }
  | { t: "done"; text: string; source: "knowledge" | "general" | "fallback" | "policy"; sources: string[] }
  | { t: "empty" }
  | { t: "error"; message: string };

type Emit = (event: TurnEvent) => void;

/** Failure after output already reached the visitor: retrying elsewhere would repeat it. */
class PartialOutputError extends Error {
  constructor(readonly cause: unknown) {
    super("partial output");
  }
}

async function logEvent(conversationId: string | null, capability: string, providerId: string | null, ok: boolean, started: number, error?: string) {
  await db()`
    insert into provider_events (conversation_id, capability, provider_id, ok, latency_ms, error)
    values (${conversationId}, ${capability}, ${providerId}, ${ok}, ${Date.now() - started}, ${error?.slice(0, 500) ?? null})`.catch(() => {});
}

/** Runs `fn` against the primary target, then the fallback if the primary fails. */
async function withFallback<T, R>(
  capability: "stt" | "tts" | "llm",
  targets: (T & { providerId: string } | null)[],
  conversationId: string | null,
  fn: (target: T & { providerId: string }) => Promise<R>,
): Promise<R> {
  const configured = targets.filter((t): t is T & { providerId: string } => Boolean(t));
  if (!configured.length) {
    const label = { stt: "تبدیل گفتار به متن", tts: "صدای فارسی", llm: "مدل پاسخ" }[capability];
    throw new UpstreamError(`سرویس «${label}» هنوز در پنل مدیریت انتخاب نشده.`, null);
  }
  let lastError: unknown;
  for (const target of configured) {
    const started = Date.now();
    try {
      const result = await fn(target);
      await logEvent(conversationId, capability, target.providerId, true, started);
      return result;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      lastError = error;
      await logEvent(conversationId, capability, target.providerId, false, started, describeError(error));
      if (error instanceof PartialOutputError) throw error.cause;
    }
  }
  throw lastError;
}

// Whisper-family models "hear" these subtitle credits in silence or noise.
const HALLUCINATIONS = /زیرنویس|امضا(ی)? ?صدا|ترجمه و|subtitles? by|amara\.org|thanks for watching|^[\s.،!?؟…]*$/i;

export async function transcribeTurn(settings: AppSettings, wav: Buffer, conversationId: string, signal?: AbortSignal) {
  const text = await withFallback<SttTarget, string>("stt", [settings.stt.primary, settings.stt.fallback], conversationId, async (target) =>
    transcribe(await providerFor(target.providerId, "stt"), target, wav, signal),
  );
  return HALLUCINATIONS.test(text) && text.length < 60 ? "" : text;
}

export async function speak(settings: AppSettings, text: string, conversationId: string | null, signal?: AbortSignal): Promise<Buffer> {
  const speech = toSpeechText(text);
  return withFallback<TtsTarget, Buffer>("tts", [settings.tts.primary, settings.tts.fallback], conversationId, async (target) =>
    synthesize(await providerFor(target.providerId, "tts"), target, speech, signal),
  );
}

async function history(conversationId: string, turns: number): Promise<ChatMessage[]> {
  if (turns <= 0) return [];
  const rows = await db()`
    select role, content from messages where conversation_id = ${conversationId}
    order by id desc limit ${turns * 2}`;
  return rows.reverse().map((r) => ({ role: r.role as "user" | "assistant", content: r.content as string }));
}

async function saveMessage(conversationId: string, role: "user" | "assistant", content: string, meta: Record<string, unknown> = {}) {
  await db()`insert into messages (conversation_id, role, content, meta) values (${conversationId}, ${role}, ${content}, ${db().json(meta as never)})`;
  await db()`update conversations set message_count = message_count + 1, last_activity_at = now() where id = ${conversationId}`;
}

/**
 * Answers `question` and emits text deltas plus synthesized audio per sentence.
 * TTS for sentence N+1 runs while sentence N is being sent, preserving order.
 */
export async function answerTurn(settings: AppSettings, conversationId: string, question: string, emit: Emit, signal: AbortSignal) {
  const started = Date.now();
  const past = await history(conversationId, settings.persona.historyTurns);
  await saveMessage(conversationId, "user", question);

  const verdict = await checkPolicy(settings, question, signal);
  if (verdict.blocked) {
    await replyFixed(settings, conversationId, settings.policy.refusalText, "policy", started, emit, signal, { policy: verdict.reason });
    return;
  }

  let knowledge: RetrievedChunk[] = [];
  if (settings.persona.knowledgeMode !== "off") {
    knowledge = await retrieve(question, 4, signal).catch(() => []);
  }
  const sources = [...new Set(knowledge.map((k) => k.title))];

  // Strict mode with nothing relevant: answer with the fixed sentence, no model call.
  if (settings.persona.knowledgeMode === "strict" && !knowledge.length) {
    await replyFixed(settings, conversationId, settings.persona.strictFallback, "fallback", started, emit, signal);
    return;
  }

  const system = buildSystemPrompt(settings, knowledge);
  const messages: ChatMessage[] = [...past, { role: "user", content: question }];

  let answer = "";
  let seq = 0;
  let audioChain: Promise<void> = Promise.resolve();
  let audioError: unknown = null;
  const splitter = new SentenceSplitter();

  const queueSentence = (sentence: string) => {
    const index = seq++;
    const pcmPromise = speak(settings, sentence, conversationId, signal);
    pcmPromise.catch(() => {}); // handled in the chain below
    audioChain = audioChain.then(async () => {
      try {
        const pcm = await pcmPromise;
        emit({ t: "audio", seq: index, text: sentence, sampleRate: PCM_SAMPLE_RATE, pcm: pcm.toString("base64") });
      } catch (error) {
        audioError ??= error;
      }
    });
  };

  await withFallback<LlmTarget, void>("llm", [settings.llm.primary, settings.llm.fallback], conversationId, async (target) => {
    const provider = await providerFor(target.providerId, "llm");
    let first = true;
    try {
      for await (const delta of streamChat(provider, target, { system, messages, signal })) {
        first = false;
        answer += delta;
        emit({ t: "delta", text: delta });
        for (const sentence of splitter.push(delta)) queueSentence(sentence);
      }
    } catch (error) {
      throw first ? error : new PartialOutputError(error);
    }
    if (first) throw new UpstreamError(`${provider.name}: پاسخ خالی`, null);
  });
  for (const sentence of splitter.flush()) queueSentence(sentence);
  await audioChain;

  const source = knowledge.length ? "knowledge" : "general";
  await saveMessage(conversationId, "assistant", answer, {
    source,
    sources,
    latencyMs: Date.now() - started,
    audioError: audioError ? describeError(audioError) : undefined,
  });
  if (audioError) emit({ t: "error", message: `صدای پاسخ ساخته نشد: ${describeError(audioError)}` });
  emit({ t: "done", text: answer, source, sources });
}

/** Speaks a fixed sentence (refusal or strict-mode fallback) without calling the answer model. */
async function replyFixed(
  settings: AppSettings,
  conversationId: string,
  text: string,
  source: "fallback" | "policy",
  started: number,
  emit: Emit,
  signal: AbortSignal,
  meta: Record<string, unknown> = {},
) {
  emit({ t: "delta", text });
  const pcm = await speak(settings, text, conversationId, signal);
  emit({ t: "audio", seq: 0, text, sampleRate: PCM_SAMPLE_RATE, pcm: pcm.toString("base64") });
  await saveMessage(conversationId, "assistant", text, { source, latencyMs: Date.now() - started, ...meta });
  emit({ t: "done", text, source, sources: [] });
}
