import { z } from "zod";

import { json, route } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { describeError } from "@/lib/server/http";
import { speak } from "@/lib/server/pipeline";
import { PCM_SAMPLE_RATE } from "@/lib/server/providers/speech";
import { getSettings } from "@/lib/server/settings";

export const POST = route(async (request: Request) => {
  await requireAdmin(request);
  const { text } = z.object({ text: z.string().trim().min(1).max(500) }).parse(await request.json());
  const started = Date.now();
  try {
    const pcm = await speak(await getSettings(), text, null);
    return json({ ok: true, pcm: pcm.toString("base64"), sampleRate: PCM_SAMPLE_RATE, latencyMs: Date.now() - started });
  } catch (error) {
    return json({ ok: false, message: describeError(error) });
  }
});
