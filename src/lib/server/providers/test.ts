import Anthropic from "@anthropic-ai/sdk";

import { describeError, ensureOk, outboundFetch } from "../http";
import { baseUrl, requireKey, type Provider } from "./registry";

export interface TestResult {
  ok: boolean;
  message: string;
  latencyMs: number;
  models?: string[];
}

/** A cheap, read-only call that proves the key, address and network path work. */
export async function testProvider(provider: Provider): Promise<TestResult> {
  const started = Date.now();
  const opts = { useProxy: provider.useProxy, timeoutMs: 20_000 };
  try {
    let message = "اتصال برقرار است.";
    let models: string[] | undefined;

    switch (provider.kind) {
      case "openai": {
        const response = await ensureOk(
          await outboundFetch(
            `${baseUrl(provider, "https://api.openai.com/v1")}/models`,
            { headers: { Authorization: `Bearer ${requireKey(provider)}` } },
            opts,
          ),
          provider.name,
        );
        const json = (await response.json()) as { data?: { id: string }[] };
        models = (json.data ?? []).map((m) => m.id).sort().slice(0, 300);
        message = `اتصال برقرار است؛ ${models.length} مدل در دسترس.`;
        break;
      }
      case "anthropic": {
        const client = new Anthropic({
          apiKey: requireKey(provider),
          baseURL: provider.baseUrl || undefined,
          maxRetries: 0,
          fetch: (url: string | URL | Request, init?: RequestInit) =>
            outboundFetch(url instanceof Request ? url.url : url, init, opts),
        });
        const page = await client.models.list({ limit: 50 });
        models = page.data.map((m) => m.id);
        message = `اتصال برقرار است؛ ${models.length} مدل در دسترس.`;
        break;
      }
      case "azure_speech": {
        const region = String(provider.config.region ?? "");
        const response = await ensureOk(
          await outboundFetch(
            `https://${region}.tts.speech.microsoft.com/cognitiveservices/voices/list`,
            { headers: { "Ocp-Apim-Subscription-Key": requireKey(provider) } },
            opts,
          ),
          provider.name,
        );
        const voices = (await response.json()) as { ShortName: string; Locale: string }[];
        models = voices.filter((v) => v.Locale === "fa-IR").map((v) => v.ShortName);
        message = `اتصال برقرار است؛ صداهای فارسی: ${models.join("، ") || "یافت نشد"}.`;
        break;
      }
      case "elevenlabs": {
        const response = await ensureOk(
          await outboundFetch(
            `${baseUrl(provider, "https://api.elevenlabs.io")}/v1/voices`,
            { headers: { "xi-api-key": requireKey(provider) } },
            opts,
          ),
          provider.name,
        );
        const json = (await response.json()) as { voices?: { voice_id: string; name: string }[] };
        models = (json.voices ?? []).map((v) => `${v.voice_id} — ${v.name}`);
        message = `اتصال برقرار است؛ ${models.length} صدا در حساب.`;
        break;
      }
      case "simli": {
        const response = await outboundFetch(
          `${baseUrl(provider, "https://api.simli.ai")}/compose/ice`,
          { headers: { "x-simli-api-key": requireKey(provider) } },
          opts,
        );
        await ensureOk(response, provider.name);
        break;
      }
      case "liveavatar": {
        await ensureOk(
          await outboundFetch(
            `${baseUrl(provider, "https://api.liveavatar.com")}/v1/users/credits`,
            { headers: { "X-API-KEY": requireKey(provider), accept: "application/json" } },
            opts,
          ),
          provider.name,
        );
        break;
      }
      case "did": {
        const key = requireKey(provider);
        const response = await ensureOk(
          await outboundFetch(
            `${baseUrl(provider, "https://api.d-id.com")}/credits`,
            { headers: { Authorization: /^(Basic|Bearer) /.test(key) ? key : `Basic ${key}`, Accept: "application/json" } },
            opts,
          ),
          provider.name,
        );
        const credits = (await response.json()) as { remaining?: number };
        message = typeof credits.remaining === "number" ? `اتصال برقرار است؛ اعتبار باقی‌مانده: ${credits.remaining}` : "اتصال برقرار است.";
        break;
      }
      case "mock":
        message = "سرویس آزمایشی آماده است.";
        break;
    }
    return { ok: true, message, latencyMs: Date.now() - started, models };
  } catch (error) {
    return { ok: false, message: describeError(error), latencyMs: Date.now() - started };
  }
}
