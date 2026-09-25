import { z } from "zod";

import { CAPABILITIES, type Capability, type ProviderKind } from "@/lib/providers-catalog";

import { ApiError } from "../api";
import { decrypt, encrypt, maskSecret } from "../crypto";
import { db } from "../db";
import { env } from "../env";

export interface Provider {
  id: string;
  kind: ProviderKind;
  name: string;
  baseUrl: string | null;
  apiKey: string | null;
  config: Record<string, unknown>;
  useProxy: boolean;
  enabled: boolean;
}

/** What the admin UI receives: the key is masked. */
export interface ProviderSummary extends Omit<Provider, "apiKey"> {
  apiKeyMasked: string | null;
  capabilities: Capability[];
  lastTestAt: string | null;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
}

const kinds = ["openai", "anthropic", "azure_speech", "elevenlabs", "simli", "liveavatar", "mock"] as const;

export const providerInput = z.object({
  kind: z.enum(kinds),
  name: z.string().trim().min(1).max(80),
  baseUrl: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === "" || /^https:\/\/[^\s]+$/.test(v) || /^http:\/\/(localhost|127\.0\.0\.1)/.test(v), {
      message: "آدرس باید با https:// شروع شود",
    })
    .nullable()
    .optional(),
  // undefined = keep the stored key, "" = remove it.
  apiKey: z.string().trim().max(1000).optional(),
  config: z.record(z.string(), z.unknown()).default({}),
  useProxy: z.boolean().default(false),
  enabled: z.boolean().default(true),
});

type Row = Record<string, unknown>;

function fromRow(row: Row): Provider {
  let apiKey: string | null = null;
  if (row.api_key_cipher) {
    try {
      apiKey = decrypt(row.api_key_cipher as string);
    } catch {
      // ENCRYPTION_KEY changed: the stored key is unreadable and must be re-entered.
      apiKey = null;
    }
  }
  return {
    id: row.id as string,
    kind: row.kind as ProviderKind,
    name: row.name as string,
    baseUrl: (row.base_url as string | null) || null,
    apiKey,
    config: (row.config as Record<string, unknown>) ?? {},
    useProxy: row.use_proxy as boolean,
    enabled: row.enabled as boolean,
  };
}

export async function listProviders(): Promise<ProviderSummary[]> {
  const rows = await db()`select * from providers order by created_at`;
  return rows.map((row) => {
    const p = fromRow(row);
    const unreadable = Boolean(row.api_key_cipher) && !p.apiKey;
    return {
      id: p.id,
      kind: p.kind,
      name: p.name,
      baseUrl: p.baseUrl,
      config: p.config,
      useProxy: p.useProxy,
      enabled: p.enabled,
      apiKeyMasked: unreadable ? "کلید قابل رمزگشایی نیست؛ دوباره وارد کنید" : p.apiKey ? maskSecret(p.apiKey) : null,
      capabilities: CAPABILITIES[p.kind] ?? [],
      lastTestAt: row.last_test_at ? new Date(row.last_test_at as string).toISOString() : null,
      lastTestOk: (row.last_test_ok as boolean | null) ?? null,
      lastTestMessage: (row.last_test_message as string | null) ?? null,
    };
  });
}

export async function getProvider(id: string): Promise<Provider | null> {
  const rows = await db()`select * from providers where id = ${id}`;
  return rows[0] ? fromRow(rows[0]) : null;
}

/** Loads a provider for use and checks it can serve the capability. */
export async function providerFor(id: string, capability: Capability): Promise<Provider> {
  const provider = await getProvider(id);
  if (!provider || !provider.enabled) {
    throw new ApiError(503, "provider_unavailable", "سرویس انتخاب‌شده غیرفعال است یا حذف شده.");
  }
  if (!CAPABILITIES[provider.kind]?.includes(capability)) {
    throw new ApiError(503, "provider_mismatch", `سرویس «${provider.name}» این قابلیت را پشتیبانی نمی‌کند.`);
  }
  if (provider.kind === "mock" && !env.mockProvidersEnabled) {
    throw new ApiError(503, "mock_disabled", "سرویس آزمایشی در این محیط غیرفعال است.");
  }
  return provider;
}

export async function saveProvider(id: string | null, input: z.infer<typeof providerInput>): Promise<string> {
  if (input.kind === "mock" && !env.mockProvidersEnabled) {
    throw new ApiError(400, "mock_disabled", "سرویس آزمایشی فقط با ENABLE_MOCK_PROVIDERS=1 فعال می‌شود.");
  }
  const sql = db();
  const cipher = input.apiKey === undefined ? undefined : input.apiKey === "" ? null : encrypt(input.apiKey);
  if (id) {
    const rows = await sql`
      update providers set
        kind = ${input.kind}, name = ${input.name}, base_url = ${input.baseUrl || null},
        config = ${sql.json(input.config as never)}, use_proxy = ${input.useProxy}, enabled = ${input.enabled},
        api_key_cipher = ${cipher === undefined ? sql`api_key_cipher` : cipher},
        updated_at = now()
      where id = ${id} returning id`;
    if (!rows[0]) throw new ApiError(404, "not_found", "سرویس پیدا نشد.");
    return id;
  }
  const rows = await sql`
    insert into providers (kind, name, base_url, api_key_cipher, config, use_proxy, enabled)
    values (${input.kind}, ${input.name}, ${input.baseUrl || null}, ${cipher ?? null},
            ${sql.json(input.config as never)}, ${input.useProxy}, ${input.enabled})
    returning id`;
  return rows[0]!.id as string;
}

export async function deleteProvider(id: string): Promise<string | null> {
  const [row] = await db()`delete from providers where id = ${id} returning name`;
  return (row?.name as string | undefined) ?? null;
}

export async function recordTest(id: string, ok: boolean, message: string) {
  await db()`
    update providers set last_test_at = now(), last_test_ok = ${ok}, last_test_message = ${message.slice(0, 500)}
    where id = ${id}`;
}

export function requireKey(provider: Provider): string {
  if (!provider.apiKey) throw new ApiError(503, "missing_key", `کلید API سرویس «${provider.name}» ثبت نشده است.`);
  return provider.apiKey;
}

export function baseUrl(provider: Provider, fallback: string): string {
  return (provider.baseUrl || fallback).replace(/\/+$/, "");
}
