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
  (src/lib/server/did-token.ts). D-ID supports photos (/talks) and premium
  presenters (/clips). `scripts/dev/fake-did.mjs` simulates both.
- Beyond Presence joins a per-conversation LiveKit room (src/lib/server/providers/livekit.ts);
  the browser sends PCM with LiveKit's avatar protocol (topic `lk.audio_stream`,
  RPCs `lk.clear_buffer` / `lk.playback_finished`). LiveKit key and secret are
  stored encrypted as one "key:secret" value. `scripts/dev/fake-bey.mjs` plus
  `livekit-server --dev` exercise the whole path locally.
- Settings live in one JSON row validated by `settingsSchema`; add new options
  there with defaults so old rows keep parsing.
- Schema changes: add a new numbered file in `migrations/`; they run at startup.

## Before pushing

```sh
npm run typecheck && npm run lint && npm run build
# with a running server and ENABLE_MOCK_PROVIDERS=1:
npm run test:e2e
```

## Deploying (Liara)

Docker platform, port 3000 (`liara.json`, `Dockerfile`, `.liaraignore`).
Required env: DATABASE_URL, SESSION_SECRET, ENCRYPTION_KEY (+ ADMIN_EMAIL /
ADMIN_PASSWORD for the first admin). Database TLS defaults to "prefer" because
Liara's private-network Postgres may not offer it. Step-by-step guide: README §6.
