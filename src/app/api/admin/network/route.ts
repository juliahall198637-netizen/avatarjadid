import { z } from "zod";

import { ApiError, json, route } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { maskSecret } from "@/lib/server/crypto";
import { describeError, getProxyUrl, outboundFetch, setProxyUrl } from "@/lib/server/http";

export const dynamic = "force-dynamic";

function maskProxy(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = maskSecret(parsed.password);
    return parsed.toString();
  } catch {
    return "••••";
  }
}

export const GET = route(async (request: Request) => {
  await requireAdmin(request);
  const url = await getProxyUrl();
  return json({ configured: Boolean(url), masked: url ? maskProxy(url) : null });
});

/** Body: { proxyUrl: string | null } to save/clear, or { test: true } to probe reachability. */
export const PUT = route(async (request: Request) => {
  await requireAdmin(request);
  const body = z
    .object({ proxyUrl: z.string().trim().max(500).nullable().optional(), test: z.boolean().optional() })
    .parse(await request.json());

  if (body.proxyUrl !== undefined) {
    if (body.proxyUrl && !/^https?:\/\/[^\s]+$/.test(body.proxyUrl)) {
      throw new ApiError(400, "bad_proxy", "آدرس پروکسی باید به شکل http://user:pass@host:port باشد.");
    }
    await setProxyUrl(body.proxyUrl || null);
  }

  if (body.test) {
    // Any HTTP answer (even 401) from OpenAI proves the route out of the country works.
    const results: Record<string, string> = {};
    for (const [label, useProxy] of [["direct", false], ["proxy", true]] as const) {
      const started = Date.now();
      try {
        const response = await outboundFetch("https://api.openai.com/v1/models", {}, { useProxy, timeoutMs: 12_000 });
        results[label] = `HTTP ${response.status} در ${Date.now() - started}ms`;
      } catch (error) {
        results[label] = `ناموفق: ${describeError(error)}`;
      }
    }
    return json({ ok: true, results });
  }
  return json({ ok: true });
});
