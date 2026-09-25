import { ensureOk, outboundFetch, UpstreamError } from "../http";
import { mockEmbedding } from "./mock";
import { baseUrl, requireKey, type Provider } from "./registry";

export async function embed(provider: Provider, model: string, inputs: string[], signal?: AbortSignal): Promise<number[][]> {
  if (provider.kind === "mock") return inputs.map(mockEmbedding);
  if (provider.kind !== "openai") throw new UpstreamError(`سرویس ${provider.kind} بردارسازی ندارد.`, null);

  const out: number[][] = [];
  for (let i = 0; i < inputs.length; i += 64) {
    const batch = inputs.slice(i, i + 64);
    const response = await ensureOk(
      await outboundFetch(
        `${baseUrl(provider, "https://api.openai.com/v1")}/embeddings`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${requireKey(provider)}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: model || "text-embedding-3-small", input: batch }),
        },
        { useProxy: provider.useProxy, timeoutMs: 60_000, signal },
      ),
      provider.name,
    );
    const json = (await response.json()) as { data?: { embedding: number[]; index: number }[] };
    const rows = (json.data ?? []).sort((a, b) => a.index - b.index);
    if (rows.length !== batch.length) throw new UpstreamError(`${provider.name}: تعداد بردارها نادرست است.`, null);
    out.push(...rows.map((r) => r.embedding));
  }
  return out;
}
