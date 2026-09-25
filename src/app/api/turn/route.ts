import { ApiError, assertSameOrigin, clientIp, route } from "@/lib/server/api";
import { describeError } from "@/lib/server/http";
import { answerTurn, transcribeTurn, type TurnEvent } from "@/lib/server/pipeline";
import { hit } from "@/lib/server/ratelimit";
import { getSettings } from "@/lib/server/settings";
import { assertOwnConversation, visitorId } from "@/lib/server/visitor";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_AUDIO_BYTES = 2_500_000; // ~75 s of 16 kHz mono PCM
const MAX_TEXT_CHARS = 1000;

/**
 * One conversational turn. Body: multipart with `conversationId` and either
 * `audio` (16 kHz WAV) or `text`. Response: NDJSON stream of TurnEvents.
 */
export const POST = route(async (request: Request) => {
  assertSameOrigin(request);
  const visitor = await visitorId();
  const form = await request.formData();
  const conversationId = String(form.get("conversationId") ?? "");
  await assertOwnConversation(conversationId, visitor);

  const settings = await getSettings();
  const ip = clientIp(request);
  const { turnsPerMinute, turnsPerDay } = settings.limits;
  await hit(`turn:v:${visitor}:m`, turnsPerMinute, 60);
  await hit(`turn:v:${visitor}:d`, turnsPerDay, 86400);
  // Many visitors can share one IP (offices, mobile carriers), hence the multiplier.
  await hit(`turn:ip:${ip}:m`, turnsPerMinute * 10, 60);

  const audio = form.get("audio");
  const text = typeof form.get("text") === "string" ? String(form.get("text")).trim() : "";
  let wav: Buffer | null = null;
  if (audio instanceof Blob) {
    if (audio.size > MAX_AUDIO_BYTES) throw new ApiError(413, "too_long", "صحبت خیلی طولانی بود؛ کوتاه‌تر بگویید.");
    if (audio.size < 1000) throw new ApiError(400, "too_short", "صدایی دریافت نشد.");
    wav = Buffer.from(await audio.arrayBuffer());
  } else if (!text) {
    throw new ApiError(400, "empty", "پرسشی دریافت نشد.");
  } else if (text.length > MAX_TEXT_CHARS) {
    throw new ApiError(400, "too_long", "متن پرسش خیلی طولانی است.");
  }

  const encoder = new TextEncoder();
  const signal = request.signal;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (event: TurnEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          closed = true;
        }
      };
      try {
        let question = text;
        if (wav) {
          question = (await transcribeTurn(settings, wav, conversationId, signal)).trim();
          if (!question) {
            emit({ t: "empty" });
            return;
          }
          emit({ t: "user", text: question });
        }
        await answerTurn(settings, conversationId, question.slice(0, MAX_TEXT_CHARS), emit, signal);
      } catch (error) {
        if (!signal.aborted) {
          console.warn("[turn] failed:", describeError(error));
          emit({ t: "error", message: describeError(error) });
        }
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed by the client */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
});
