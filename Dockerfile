# Single-service image: web UI, API and migrations in one Node process.
# Kept fast for Liara's build time limit: one RUN installs and builds, then
# deletes node_modules so no ~1 GB layer is saved or copied; the runtime image
# gets only Next's standalone output (the files the server really uses).
FROM node:22-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 SKIP_BUILD_CHECKS=1
# If the build server cannot reach npmjs, pass a mirror:
#   --build-arg NPM_REGISTRY=https://<mirror>/
ARG NPM_REGISTRY=https://registry.npmjs.org/
COPY . .
RUN npm config set registry "$NPM_REGISTRY" \
 && npm ci --no-audit --no-fund \
 && npm run build \
 && rm -rf node_modules .next/cache

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/migrations ./migrations
USER node
EXPOSE 3000
# Migrations run automatically at startup (src/instrumentation.ts).
# HOSTNAME is forced here because orchestrators set it to the pod name, which
# Next's server.js would then try to bind to (and fail: 502).
CMD ["sh", "-c", "HOSTNAME=0.0.0.0 exec node server.js"]
