// Creates an admin account, or resets the password of an existing one.
// Usage: npm run admin:create   (prompts)   or   ADMIN_EMAIL=.. ADMIN_PASSWORD=.. npm run admin:create
import { createInterface } from "node:readline/promises";

import { hashPassword, MIN_PASSWORD_LENGTH, normalizeEmail } from "../src/lib/server/auth";
import { db } from "../src/lib/server/db";
import { runMigrations } from "../src/lib/server/migrate";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const email = normalizeEmail(process.env.ADMIN_EMAIL || (await rl.question("Admin email: ")));
const password = process.env.ADMIN_PASSWORD || (await rl.question(`Password (min ${MIN_PASSWORD_LENGTH} chars): `));
rl.close();

if (!/^[^@\s]+@[^@\s]+$/.test(email)) throw new Error("Invalid email");
if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);

await runMigrations(db());
const hash = await hashPassword(password);
const [row] = await db()`
  insert into admin_users (email, password_hash) values (${email}, ${hash})
  on conflict (email) do update set password_hash = excluded.password_hash
  returning (xmax = 0) as created`;
await db()`delete from admin_sessions where user_id = (select id from admin_users where email = ${email})`;
console.log(row?.created ? `Created admin ${email}` : `Password reset for ${email}`);
await db().end();
