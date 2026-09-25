import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type postgres from "postgres";

// Arbitrary constant so concurrent instances never migrate at the same time.
const LOCK_ID = 727_401_19;

export async function runMigrations(sql: postgres.Sql, log = console.log): Promise<string[]> {
  const dir = path.join(process.cwd(), "migrations");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const applied: string[] = [];

  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${LOCK_ID})`;
    await tx`
      create table if not exists schema_migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      )`;
    const done = new Set((await tx`select name from schema_migrations`).map((r) => r.name as string));
    for (const file of files) {
      if (done.has(file)) continue;
      const body = await readFile(path.join(dir, file), "utf8");
      await tx.unsafe(body);
      await tx`insert into schema_migrations (name) values (${file})`;
      applied.push(file);
      log(`[migrate] applied ${file}`);
    }
  });

  return applied;
}
