import { AZURE_PERSIAN_VOICES } from "@/lib/providers-catalog";

import { ensureOk, outboundFetch, UpstreamError } from "../http";
import type { SttTarget, TtsTarget } from "../settings";
import { MOCK_SAMPLE_RATE, mockSpeech, mockTranscript } from "./mock";
import { baseUrl, requireKey, type Provider } from "./registry";

/** Every TTS adapter returns raw 16-bit little-endian mono PCM at this rate. */
export const PCM_SAMPLE_RATE = 24_000;

function azureRegion(provider: Provider): string {
  const region = String(provider.config.region ?? "").trim();
  if (!/^[a-z0-9]+$/.test(region)) throw new UpstreamError(`منطقهٔ (region) سرویس «${provider.name}» درست تنظیم نشده.`, null);
  return region;
}

// ── Speech to text ─────────────────────────────────────────────────────────

/** `wav` is 16 kHz mono 16-bit PCM WAV, as produced by the browser VAD. */
export async function transcribe(provider: Provider, target: SttTarget, wav: Buffer, signal?: AbortSignal): Promise<string> {
  const opts = { useProxy: provider.useProxy, timeoutMs: 45_000, signal };
  const audio = new Blob([new Uint8Array(wav)], { type: "audio/wav" });

  switch (provider.kind) {
    case "openai": {
      const form = new FormData();
      form.append("file", audio, "speech.wav");
      form.append("model", target.model || "whisper-1");
      if (target.language) form.append("language", target.language);
      // A Persian prompt steers Whisper-family models towards Persian script and vocabulary.
      form.append("prompt", `گفتگوی فارسی. ${target.hint}`.trim());
      form.append("response_format", "json");
      const response = await ensureOk(
        await outboundFetch(
          `${baseUrl(provider, "https://api.openai.com/v1")}/audio/transcriptions`,
          { method: "POST", headers: { Authorization: `Bearer ${requireKey(provider)}` }, body: form },
          opts,
        ),
        provider.name,
      );
      return ((await response.json()) as { text?: string }).text?.trim() ?? "";
    }
    case "azure_speech": {
      const language = target.language === "fa" || !target.language ? "fa-IR" : target.language;
      const url = `https://${azureRegion(provider)}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${encodeURIComponent(language)}&format=simple`;
      const response = await ensureOk(
        await outboundFetch(
          url,
          {
            method: "POST",
            headers: {
              "Ocp-Apim-Subscription-Key": requireKey(provider),
              "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
              Accept: "application/json",
            },
            body: new Uint8Array(wav),
          },
          opts,
        ),
        provider.name,
      );
      const result = (await response.json()) as { RecognitionStatus?: string; DisplayText?: string };
      if (result.RecognitionStatus && !["Success", "NoMatch", "InitialSilenceTimeout"].includes(result.RecognitionStatus)) {
        throw new UpstreamError(`${provider.name}: ${result.RecognitionStatus}`, null);
      }
      return result.DisplayText?.trim() ?? "";
    }
    case "elevenlabs": {
      const form = new FormData();
      form.append("file", audio, "speech.wav");
      form.append("model_id", target.model || "scribe_v1");
      form.append("language_code", target.language === "fa" || !target.language ? "fas" : target.language);
      form.append("tag_audio_events", "false");
      const response = await ensureOk(
        await outboundFetch(
          `${baseUrl(provider, "https://api.elevenlabs.io")}/v1/speech-to-text`,
          { method: "POST", headers: { "xi-api-key": requireKey(provider) }, body: form },
          opts,
        ),
        provider.name,
      );
      return ((await response.json()) as { text?: string }).text?.trim() ?? "";
    }
    case "mock":
      return mockTranscript(provider.config);
    default:
      throw new UpstreamError(`سرویس ${provider.kind} تبدیل گفتار به متن ندارد.`, null);
  }
}

// ── Text to speech ─────────────────────────────────────────────────────────

function escapeXml(text: string) {
  return text.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
}

/** Returns PCM16 mono at PCM_SAMPLE_RATE. */
export async function synthesize(provider: Provider, target: TtsTarget, text: string, signal?: AbortSignal): Promise<Buffer> {
  const opts = { useProxy: provider.useProxy, timeoutMs: 45_000, signal };

  switch (provider.kind) {
    case "openai": {
      const body: Record<string, unknown> = {
        model: target.model || "gpt-4o-mini-tts",
        voice: target.voice || "coral",
        input: text,
        response_format: "pcm",
      };
      if (target.speed !== 1) body.speed = target.speed;
      if (target.instructions) body.instructions = target.instructions;
      const response = await ensureOk(
        await outboundFetch(
          `${baseUrl(provider, "https://api.openai.com/v1")}/audio/speech`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${requireKey(provider)}`, "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
          opts,
        ),
        provider.name,
      );
      return Buffer.from(await response.arrayBuffer());
    }
    case "azure_speech": {
      const voice = target.voice || AZURE_PERSIAN_VOICES[0]!;
      const rate = Math.round((target.speed - 1) * 100);
      const ssml =
        `<speak version="1.0" xml:lang="fa-IR" xmlns="http://www.w3.org/2001/10/synthesis">` +
        `<voice name="${escapeXml(voice)}"><prosody rate="${rate >= 0 ? "+" : ""}${rate}%">${escapeXml(text)}</prosody></voice></speak>`;
      const response = await ensureOk(
        await outboundFetch(
          `https://${azureRegion(provider)}.tts.speech.microsoft.com/cognitiveservices/v1`,
          {
            method: "POST",
            headers: {
              "Ocp-Apim-Subscription-Key": requireKey(provider),
              "Content-Type": "application/ssml+xml",
              "X-Microsoft-OutputFormat": "raw-24khz-16bit-mono-pcm",
              "User-Agent": "avatarjadid",
            },
            body: ssml,
          },
          opts,
        ),
        provider.name,
      );
      return Buffer.from(await response.arrayBuffer());
    }
    case "elevenlabs": {
      if (!target.voice) throw new UpstreamError(`شناسهٔ صدای ElevenLabs در تنظیمات صدا وارد نشده.`, null);
      const url = `${baseUrl(provider, "https://api.elevenlabs.io")}/v1/text-to-speech/${encodeURIComponent(target.voice)}?output_format=pcm_24000`;
      // No language_code: eleven_multilingual_v2 detects Persian itself and rejects "fa".
      const response = await ensureOk(
        await outboundFetch(
          url,
          {
            method: "POST",
            headers: { "xi-api-key": requireKey(provider), "Content-Type": "application/json" },
            body: JSON.stringify({
              text,
              model_id: target.model || "eleven_multilingual_v2",
              voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.3, speed: target.speed },
            }),
          },
          opts,
        ),
        provider.name,
      );
      return Buffer.from(await response.arrayBuffer());
    }
    case "mock":
      if (MOCK_SAMPLE_RATE !== PCM_SAMPLE_RATE) throw new Error("mock sample rate mismatch");
      return mockSpeech(text);
    default:
      throw new UpstreamError(`سرویس ${provider.kind} تبدیل متن به گفتار ندارد.`, null);
  }
}
