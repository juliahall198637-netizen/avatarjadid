import { cookies } from "next/headers";

import { ApiError } from "./api";
import { randomToken, sign, unsign } from "./crypto";
import { db } from "./db";
import { env } from "./env";

const COOKIE = "aj_visitor";

/**
 * Anonymous visitors get a signed id cookie. It proves ownership of their own
 * conversations and nothing else.
 */
export async function visitorId(): Promise<string> {
  const store = await cookies();
  const existing = unsign(store.get(COOKIE)?.value);
  if (existing) return existing;
  const id = randomToken(16);
  store.set(COOKIE, sign(id), {
    httpOnly: true,
    secure: env.secureCookies,
    sameSite: "lax",
    path: "/",
    maxAge: 180 * 86400,
  });
  return id;
}

export async function assertOwnConversation(conversationId: string, visitor: string) {
  if (!/^[0-9a-f-]{36}$/i.test(conversationId)) throw new ApiError(400, "bad_conversation", "شناسهٔ گفتگو نامعتبر است.");
  const rows = await db()`select visitor_id from conversations where id = ${conversationId}`;
  if (!rows[0] || rows[0].visitor_id !== visitor) {
    throw new ApiError(404, "no_conversation", "گفتگو پیدا نشد. صفحه را دوباره بارگذاری کنید.");
  }
}
