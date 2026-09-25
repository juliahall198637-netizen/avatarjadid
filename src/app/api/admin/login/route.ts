import { z } from "zod";

import { ApiError, assertSameOrigin, clientIp, json, route } from "@/lib/server/api";
import { audit, normalizeEmail, startSession, verifyPassword } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { hit } from "@/lib/server/ratelimit";

// Constant-time-ish: compare against a real bcrypt hash even for unknown emails.
const DUMMY_HASH = "$2b$12$dMxhmI9Xo7R9MYw59RHIBe4xn43qcNYqjDQBjLv894J/qsh.epfie";

export const POST = route(async (request: Request) => {
  assertSameOrigin(request);
  await hit(`login:ip:${clientIp(request)}`, 10, 900);
  const { email, password } = z
    .object({ email: z.string().max(200), password: z.string().max(200) })
    .parse(await request.json());
  const rows = await db()`select id, password_hash from admin_users where email = ${normalizeEmail(email)}`;
  const ok = await verifyPassword(password, (rows[0]?.password_hash as string) ?? DUMMY_HASH);
  if (!rows[0] || !ok) {
    await audit(normalizeEmail(email).slice(0, 100) || "?", "ورود ناموفق", clientIp(request));
    throw new ApiError(401, "bad_credentials", "ایمیل یا گذرواژه نادرست است.");
  }
  await startSession(rows[0].id as string, request);
  await audit(normalizeEmail(email), "ورود", clientIp(request));
  return json({ ok: true });
});
