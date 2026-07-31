# syntax=docker/dockerfile:1

# Prisma engines need OpenSSL to detect the right target — install it in every
# stage that runs `prisma generate` AND in the runtime (engine must match).
FROM node:22.23.1-bookworm-slim AS base
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# ---- deps: full install (dev deps needed for tsc) ----
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate

# ---- build: compile TypeScript -> dist/ (src + prisma/seed) ----
FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npx tsc -p tsconfig.build.json

# ---- prod-deps: production-only node_modules (prisma CLI is a prod dep,
#      needed at boot for `prisma migrate deploy`) ----
FROM base AS prod-deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN npx prisma generate

# ---- runtime: non-root, prod deps only ----
FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY prisma ./prisma
RUN chown -R node:node /app
USER node
EXPOSE 4000
# Database initialization is a deliberate, one-time deployment job. Never
# seed a runtime container: that would make a missing environment variable
# recreate a privileged account during a rollout.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]
