# Single-service image: web UI, API and migrations in one Node process.
# Liara's build server pays a fixed cost for every step, and its build has a
# time limit, so this file keeps steps to a minimum: one RUN installs, builds,
# assembles the runtime tree in /out (Next's standalone output: only the files
# the server really uses) and deletes node_modules; one COPY moves /out.
FROM node:22-slim AS build
WORKDIR /app
# If the build server cannot reach npmjs, pass a mirror:
#   --build-arg NPM_REGISTRY=https://<mirror>/
ARG NPM_REGISTRY=https://registry.npmjs.org/
COPY . .
RUN export NEXT_TELEMETRY_DISABLED=1 SKIP_BUILD_CHECKS=1 npm_config_registry="$NPM_REGISTRY" \
 && npm ci --no-audit --no-fund --loglevel=error \
 && npm run build \
 && mkdir -p /out/.next \
 && cp -r .next/standalone/. /out/ \
 && cp -r .next/static /out/.next/static \
 && cp -r public migrations /out/ \
 && rm -f /out/.env* \
 && rm -rf node_modules .next

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /out ./
USER node
# Migrations run automatically at startup (src/instrumentation.ts).
# HOSTNAME is forced here because orchestrators set it to the pod name, which
# Next's server.js would then try to bind to (and fail: 502).
CMD ["sh", "-c", "HOSTNAME=0.0.0.0 exec node server.js"]
