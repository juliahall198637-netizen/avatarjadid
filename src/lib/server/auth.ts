import bcrypt from "bcryptjs";
import { cookies } from "next/headers";

import { ApiError, assertSameOrigin, clientIp } from "./api";
import { randomToken, sha256 } from "./crypto";
import { db } from "./db";
import { env } from "./env";

const COOKIE = "aj_admin";
const SESSION_DAYS = 7;
export const MIN_PASSWORD_LENGTH = 10;

export type Role = "owner" | "operator";

export interface Admin {
  id: string;
  email: string;
  role: Role;
}

export function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function createAdmin(email: string, password: string, role: Role = "owner"): Promise<Admin> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ApiError(400, "weak_password", `گذرواژه باید حداقل ${MIN_PASSWORD_LENGTH} نویسه باشد.`);
  }
  const rows = await db()`
    insert into admin_users (email, password_hash, role) values (${normalizeEmail(email)}, ${await hashPassword(password)}, ${role})
    on conflict (email) do nothing
    returning id, email, role`;
  if (!rows[0]) throw new ApiError(409, "exists", "مدیری با این ایمیل وجود دارد.");
  return rows[0] as unknown as Admin;
}

export async function startSession(userId: string, request: Request) {
  const token = randomToken();
  await db()`
    insert into admin_sessions (user_id, token_hash, expires_at, ip, user_agent)
    values (${userId}, ${sha256(token)}, now() + ${`${SESSION_DAYS} days`}::interval,
            ${clientIp(request)}, ${request.headers.get("user-agent")?.slice(0, 300) ?? null})`;
  await db()`update admin_users set last_login_at = now() where id = ${userId}`;
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: env.secureCookies,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) await db()`delete from admin_sessions where token_hash = ${sha256(token)}`;
  store.delete(COOKIE);
}

export async function currentAdmin(): Promise<Admin | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const rows = await db()`
    select u.id, u.email, u.role from admin_sessions s join admin_users u on u.id = s.user_id
    where s.token_hash = ${sha256(token)} and s.expires_at > now()`;
  return (rows[0] as unknown as Admin | undefined) ?? null;
}

/**
 * Every admin API route calls this first. Routes that change keys, settings,
 * network or accounts require the owner role; operators manage content only.
 */
export async function requireAdmin(request: Request, role: Role = "owner"): Promise<Admin> {
  assertSameOrigin(request);
  const admin = await currentAdmin();
  if (!admin) throw new ApiError(401, "unauthorized", "ابتدا وارد پنل مدیریت شوید.");
  if (role === "owner" && admin.role !== "owner") {
    throw new ApiError(403, "forbidden", "این بخش فقط برای مدیر اصلی در دسترس است.");
  }
  return admin;
}

/** Records an admin action; never blocks the action itself. */
export async function audit(admin: Admin | string, action: string, target?: string | null) {
  const actor = typeof admin === "string" ? admin : admin.email;
  await db()`insert into admin_audit (actor, action, target) values (${actor}, ${action}, ${target?.slice(0, 300) ?? null})`.catch(() => {});
}
