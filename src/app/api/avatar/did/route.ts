import { z } from "zod";

import { ApiError, assertSameOrigin, json, route } from "@/lib/server/api";
import { readDidToken } from "@/lib/server/did-token";
import { describeError } from "@/lib/server/http";
import { didClose, didIce, didSdp, didTalk } from "@/lib/server/providers/avatar";
import { providerFor } from "@/lib/server/providers/registry";
import { hit } from "@/lib/server/ratelimit";
import { getSettings } from "@/lib/server/settings";
import { existingVisitorId } from "@/lib/server/visitor";
import { pcmToWav } from "@/lib/wav";

export const dynamic = "force-dynamic";

const MAX_PCM_BASE64 = 4_000_000; // ~60 s of 24 kHz speech

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sdp"), token: z.string(), answer: z.object({ type: z.literal("answer"), sdp: z.string().max(100_000) }) }),
  z.object({
    action: z.literal("ice"),
    token: z.string(),
    candidate: z.object({
      candidate: z.string().max(2000).nullable(),
      sdpMid: z.string().max(100).nullable().optional(),
      sdpMLineIndex: z.number().int().nullable().optional(),
    }),
  }),
  z.object({ action: z.literal("talk"), token: z.string(), pcm: z.string().max(MAX_PCM_BASE64), sampleRate: z.number().int().min(8000).max(48000) }),
  z.object({ action: z.literal("close"), token: z.string() }),
]);

/**
 * Signalling and speech for a D-ID stream, proxied so the D-ID key stays on
 * the server. `talk` receives PCM our own TTS produced for this visitor.
 */
export const POST = route(async (request: Request) => {
  assertSameOrigin(request);
  const visitor = await existingVisitorId();
  const input = body.parse(await request.json());
  const ref = readDidToken(input.token, visitor);
  const settings = await getSettings();
  if (settings.avatar.type !== "did" || !settings.avatar.did.providerId) {
    throw new ApiError(409, "not_did", "آواتار D-ID فعال نیست.");
  }
  const provider = await providerFor(settings.avatar.did.providerId, "avatar");

  try {
    switch (input.action) {
      case "sdp":
        await didSdp(provider, ref.kind, ref.streamId, ref.sessionId, input.answer);
        return json({ ok: true });
      case "ice":
        await hit(`did:ice:${visitor}`, 200, 60);
        await didIce(provider, ref.kind, ref.streamId, ref.sessionId, input.candidate);
        return json({ ok: true });
      case "talk": {
        await hit(`did:talk:${visitor}`, 60, 60);
        const pcm = Buffer.from(input.pcm, "base64");
        const duration = await didTalk(provider, ref.kind, ref.streamId, ref.sessionId, pcmToWav(new Uint8Array(pcm), input.sampleRate));
        return json({ ok: true, duration: duration ?? pcm.length / 2 / input.sampleRate });
      }
      case "close":
        await didClose(provider, ref.kind, ref.streamId, ref.sessionId).catch(() => {});
        return json({ ok: true });
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.warn("[did]", input.action, describeError(error));
    throw new ApiError(502, "did_failed", "ارتباط با سرویس D-ID ناموفق بود.");
  }
});
