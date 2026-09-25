import { assertSameOrigin, clientIp, json, route } from "@/lib/server/api";
import { speak } from "@/lib/server/pipeline";
import { hit } from "@/lib/server/ratelimit";
import { getSettings } from "@/lib/server/settings";
import { PCM_SAMPLE_RATE } from "@/lib/server/providers/speech";

export const dynamic = "force-dynamic";

// The greeting is the same for everyone, so it is synthesized once per
// (text, voice settings) and reused — no TTS cost per visitor.
let cache: { key: string; pcm: string } | null = null;

export const POST = route(async (request: Request) => {
  assertSameOrigin(request);
  await hit(`greet:ip:${clientIp(request)}`, 30, 3600);
  const settings = await getSettings();
  const text = settings.persona.greeting.trim();
  if (!text) return json({ text: "", pcm: null, sampleRate: PCM_SAMPLE_RATE });

  const key = JSON.stringify([text, settings.tts]);
  if (cache?.key !== key) {
    const pcm = await speak(settings, text, null);
    cache = { key, pcm: pcm.toString("base64") };
  }
  return json({ text, pcm: cache.pcm, sampleRate: PCM_SAMPLE_RATE });
});
