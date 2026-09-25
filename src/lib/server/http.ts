import { ProxyAgent, fetch as undiciFetch } from "undici";

import { decrypt, encrypt } from "./crypto";
import { db } from "./db";

// Servers inside Iran (e.g. Liara) are refused by most foreign AI APIs, so
// every outbound call can optionally go through an admin-configured proxy.

const PROXY_SECRET = "outbound_proxy_url";

let cached: { url: string | null; agent: ProxyAgent | null; loadedAt: number } | null = null;

export async function getProxyUrl(): Promise<string | null> {
  const rows = await db()`select cipher from secrets where name = ${PROXY_SECRET}`;
  return rows[0] ? decrypt(rows[0].cipher as string) : null;
}

export async function setProxyUrl(url: string | null): Promise<void> {
  if (url) {
    await db()`
      insert into secrets (name, cipher) values (${PROXY_SECRET}, ${encrypt(url)})
      on conflict (name) do update set cipher = excluded.cipher, updated_at = now()`;
  } else {
    await db()`delete from secrets where name = ${PROXY_SECRET}`;
  }
  cached = null;
}

async function proxyAgent(): Promise<ProxyAgent | null> {
  if (cached && Date.now() - cached.loadedAt < 30_000) return cached.agent;
  const url = await getProxyUrl();
  if (cached?.url === url) {
    cached.loadedAt = Date.now();
    return cached.agent;
  }
  await cached?.agent?.close().catch(() => {});
  cached = { url, agent: url ? new ProxyAgent(url) : null, loadedAt: Date.now() };
  return cached.agent;
}

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly detail?: string,
  ) {
    super(message);
  }
}

export interface OutboundOptions {
  useProxy?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** fetch() that honours the proxy setting and always has a timeout. */
export async function outboundFetch(
  url: string | URL,
  init: RequestInit = {},
  { useProxy = false, timeoutMs = 30_000, signal }: OutboundOptions = {},
): Promise<Response> {
  const signals = [AbortSignal.timeout(timeoutMs), signal, init.signal].filter(Boolean) as AbortSignal[];
  const merged = AbortSignal.any(signals);

  if (useProxy) {
    const dispatcher = await proxyAgent();
    if (!dispatcher) throw new UpstreamError("پروکسی فعال است ولی آدرس پروکسی در پنل ثبت نشده.", null);
    let { body, headers } = init;
    if (body instanceof FormData || body instanceof Blob) {
      // The npm undici package does not recognise Node's built-in FormData/Blob
      // classes, so encode the multipart body here with the native Response.
      const encoded = new Response(body);
      const withType = new Headers(headers);
      const type = encoded.headers.get("content-type");
      if (type) withType.set("content-type", type);
      headers = withType;
      body = new Uint8Array(await encoded.arrayBuffer());
    }
    // undici's own fetch is used so the dispatcher type always matches.
    const response = await undiciFetch(url, {
      ...(init as Parameters<typeof undiciFetch>[1]),
      headers: headers as never,
      body: body as never,
      signal: merged,
      dispatcher,
    });
    return response as unknown as Response;
  }
  return fetch(url, { ...init, signal: merged });
}

/** Throws an UpstreamError carrying a short, key-free description of the failure. */
export async function ensureOk(response: Response, service: string): Promise<Response> {
  if (response.ok) return response;
  const text = (await response.text().catch(() => "")).slice(0, 300);
  throw new UpstreamError(`${service}: HTTP ${response.status}`, response.status, redact(text));
}

export function redact(text: string): string {
  return text.replace(/(sk|key|token|bearer)[-_a-z0-9]*[:= ]+[A-Za-z0-9._-]{12,}/gi, "$1 [redacted]");
}

export function describeError(error: unknown): string {
  if (error instanceof UpstreamError) return error.detail ? `${error.message} — ${error.detail}` : error.message;
  if (error instanceof Error) {
    if (error.name === "TimeoutError") return "زمان پاسخ سرویس به پایان رسید.";
    const cause = (error as Error & { cause?: { code?: string } }).cause;
    if (cause?.code) return `${error.message} (${cause.code})`;
    return error.message;
  }
  return String(error);
}
