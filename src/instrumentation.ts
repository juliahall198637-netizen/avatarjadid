export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { bootstrap } = await import("./lib/server/bootstrap");
    // Not awaited: Next waits for register() before serving, so a slow or
    // unreachable database would hang every page (a 502 behind Liara's proxy).
    // /api/health reports the database state instead.
    void bootstrap().catch((error) => console.error("[bootstrap] failed", error));
  }
}
