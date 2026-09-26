// Plain JS (not .ts) so the production image needs no TypeScript at runtime.
/** @type {import("next").NextConfig} */
const skipChecks = process.env.SKIP_BUILD_CHECKS === "1";

const nextConfig = {
  // The Docker image ships only .next/standalone (server + the files it
  // actually uses) instead of the whole node_modules, which keeps Liara's
  // build well under its time limit.
  output: "standalone",
  // Lint and typecheck run before every push (AGENTS.md); the Docker build
  // skips them to save time.
  eslint: { ignoreDuringBuilds: skipChecks },
  typescript: { ignoreBuildErrors: skipChecks },
  // Node-only libraries stay out of the server bundle.
  serverExternalPackages: ["postgres", "undici", "unpdf", "bcryptjs"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "microphone=(self), camera=()" },
        ],
      },
      { source: "/admin/:path*", headers: [{ key: "X-Frame-Options", value: "DENY" }] },
      {
        source: "/vad/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800" }],
      },
    ];
  },
};

export default nextConfig;
