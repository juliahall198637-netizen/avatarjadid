// Runtime configuration read from the environment. Only secrets that must
// exist before the database is reachable live here; everything else is
// managed from the admin panel.

function required(name: string, minLength = 1): string {
  const value = process.env[name]?.trim();
  if (!value || value.length < minLength) {
    throw new Error(
      minLength > 1
        ? `Environment variable ${name} must be at least ${minLength} characters.`
        : `Environment variable ${name} is not set.`,
    );
  }
  return value;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get databaseSsl(): boolean | "require" | "prefer" {
    const raw = process.env.DATABASE_SSL?.trim().toLowerCase();
    if (raw === "false" || raw === "0" || raw === "disable") return false;
    if (raw === "true" || raw === "require") return "require";
    const url = process.env.DATABASE_URL ?? "";
    if (/@(localhost|127\.0\.0\.1)[:/]/.test(url)) return false;
    // Liara's private-network databases may not offer TLS: use it when available.
    return "prefer";
  },
  get sessionSecret() {
    return required("SESSION_SECRET", 32);
  },
  get encryptionKey() {
    return required("ENCRYPTION_KEY", 32);
  },
  get mockProvidersEnabled() {
    return process.env.ENABLE_MOCK_PROVIDERS === "1";
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
  get secureCookies() {
    // Liara terminates TLS in front of the app, so production is always HTTPS.
    // COOKIE_SECURE=false exists only for plain-HTTP testing of a production build.
    if (process.env.COOKIE_SECURE === "false") return false;
    return process.env.NODE_ENV === "production";
  },
};
