import { db } from "../src/lib/server/db";
import { runMigrations } from "../src/lib/server/migrate";

const applied = await runMigrations(db());
console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Database is up to date.");
await db().end();
