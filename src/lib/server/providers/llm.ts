import Anthropic from "@anthropic-ai/sdk";

import { ensureOk, outboundFetch, UpstreamError } from "../http";
import type { LlmTarget } from "../settings";
import { mockChat } from "./mock";
import { baseUrl, requireKey, type Provider } from "./registry";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  system: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
}

/** Streams answer text. Throws UpstreamError before the first token if the provider fails. */
export function streamChat(provider: Provider, target: LlmTarget, request: ChatRequest): AsyncGenerator<string> {
  switch (provider.kind) {
    case "openai":
      return streamOpenAi(provider, target, request);
    case "anthropic":
      return streamAnthropic(provider, target, request);
    case "mock": {
      const last = request.messages.at(-1)?.content ?? "";
      const context = /<knowledge>([\s\S]*?)<\/knowledge>/.exec(request.system)?.[1]?.trim() ?? "";
      return mockChat(last, context);
    }
    default:
      throw new UpstreamError(`سرویس ${provider.kind} مدل زبانی ندارد.`, null);
  }
}

async function* streamOpenAi(provider: Provider, target: LlmTarget, request: ChatRequest): AsyncGenerator<string> {
  const body: Record<string, unknown> = {
    model: target.model,
    stream: true,
    messages: [{ role: "system", content: request.system }, ...request.messages],
  };
  if (target.temperature !== null) body.temperature = target.temperature;
  if (target.maxTokens !== null) body.max_tokens = target.maxTokens;

  const response = await ensureOk(
    await outboundFetch(
      `${baseUrl(provider, "https://api.openai.com/v1")}/chat/completions`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${requireKey(provider)}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      { useProxy: provider.useProxy, timeoutMs: 90_000, signal: request.signal },
    ),
    provider.name,
  );
  if (!response.body) throw new UpstreamError(`${provider.name}: پاسخ خالی`, null);

  const decoder = new TextDecoder();
  let pending = "";
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    pending += decoder.decode(chunk, { stream: true });
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) {
      const data = line.trim();
      if (!data.startsWith("data:")) continue;
      const payload = data.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const parsed = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[]; error?: { message?: string } };
        if (parsed.error) throw new UpstreamError(`${provider.name}: ${parsed.error.message ?? "خطا"}`, null);
        const text = parsed.choices?.[0]?.delta?.content;
        if (text) yield text;
      } catch (error) {
        if (error instanceof UpstreamError) throw error;
        // Keep-alive comments and partial frames are ignored.
      }
    }
  }
}

// Claude Opus 5 / Fable: opt into server-side fallback so a declined request
// is re-run on Anthropic's recommended model instead of returning a refusal.
const FALLBACK_MODELS = /^claude-(opus-5|fable-5)/;

async function* streamAnthropic(provider: Provider, target: LlmTarget, request: ChatRequest): AsyncGenerator<string> {
  const client = new Anthropic({
    apiKey: requireKey(provider),
    baseURL: provider.baseUrl || undefined,
    maxRetries: 1,
    timeout: 90_000,
    fetch: (url: string | URL | Request, init?: RequestInit) =>
      outboundFetch(url instanceof Request ? url.url : url, init, { useProxy: provider.useProxy, timeoutMs: 90_000 }),
  });

  const model = target.model || "claude-opus-5";
  const params = {
    model,
    max_tokens: target.maxTokens ?? 4000,
    system: request.system,
    messages: request.messages,
    ...(target.effort ? { output_config: { effort: target.effort } } : {}),
    ...(FALLBACK_MODELS.test(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}),
  };

  try {
    const stream = client.beta.messages.stream(params as Parameters<typeof client.beta.messages.stream>[0], {
      signal: request.signal,
    });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield event.delta.text;
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") {
      throw new UpstreamError(`${provider.name}: مدل به این پرسش پاسخ نداد.`, null, "refusal");
    }
  } catch (error) {
    if (error instanceof UpstreamError) throw error;
    if (error instanceof Anthropic.APIError) {
      throw new UpstreamError(`${provider.name}: HTTP ${error.status ?? "?"}`, error.status ?? null, error.message.slice(0, 300));
    }
    throw error;
  }
}
