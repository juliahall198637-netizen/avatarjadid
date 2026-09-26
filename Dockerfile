# Single-service image: web UI, API and migrations in one Node process.
FROM node:22-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# If the build server cannot reach npmjs, pass a mirror:
#   --build-arg NPM_REGISTRY=https://<mirror>/
ARG NPM_REGISTRY=https://registry.npmjs.org/
RUN npm config set registry "$NPM_REGISTRY"
COPY package.json package-lock.json ./
COPY scripts/copy-vad-assets.mjs scripts/
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/next.config.mjs ./
USER node
EXPOSE 3000
# Migrations run automatically at startup (src/instrumentation.ts).
CMD ["node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
