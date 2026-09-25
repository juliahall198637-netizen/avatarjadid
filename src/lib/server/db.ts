import postgres from "postgres";

import { env } from "./env";

declare global {
  var __avatarSql: postgres.Sql | undefined;
}

/** Shared connection pool; survives Next.js hot reloads in development. */
export function db(): postgres.Sql {
  if (!globalThis.__avatarSql) {
    globalThis.__avatarSql = postgres(env.databaseUrl, {
      ssl: env.databaseSsl,
      max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
      idle_timeout: 30,
      connect_timeout: 15,
      onnotice: () => {},
    });
  }
  return globalThis.__avatarSql;
}
