# Working in this repository

Next.js 15 (App Router) + PostgreSQL, one Node process. Persian RTL UI.

## Rules that shape everything

- `/` is public and anonymous. Every public route that costs money calls `hit()`
  (src/lib/server/ratelimit.ts) first and resolves the caller with `visitorId()`;
  anything touching a conversation calls `assertOwnConversation()`.
- Every `/api/admin/*` handler starts with `requireAdmin(request)` — it also
  enforces the same-origin check. There is no public sign-up.
- Provider keys are stored encrypted (src/lib/server/crypto.ts) and never sent
  to the browser. The home page passes only `PublicAvatarConfig`.
- All outbound calls go through `outboundFetch()` so the admin-configured proxy
  and timeouts apply. Servers in Iran cannot reach most foreign APIs directly.
- The Persian "brain" and voice always run on our server. Avatar services
  (Simli, LiveAvatar) only receive PCM audio and animate the face; never use
  their built-in voice agents — they do not handle Persian well.
- TTS adapters must return PCM16 mono at 24 kHz (`PCM_SAMPLE_RATE`).
- The client creates the conversation (which sets the visitor cookie) before
  connecting any avatar; avatar endpoints use `existingVisitorId()` and refuse
  callers without the cookie. Parallel first requests would fork the visitor.
- D-ID credentials never reach the browser: it holds a signed per-stream token
  (src/lib/server/did-token.ts). `scripts/dev/fake-did.mjs` simulates D-ID.
- Settings live in one JSON row validated by `settingsSchema`; add new options
  there with defaults so old rows keep parsing.
- Schema changes: add a new numbered file in `migrations/`; they run at startup.

## Before pushing

```sh
npm run typecheck && npm run lint && npm run build
# with a running server and ENABLE_MOCK_PROVIDERS=1:
npm run test:e2e
```
