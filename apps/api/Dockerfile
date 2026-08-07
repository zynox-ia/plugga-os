# syntax=docker/dockerfile:1

# Build context is the monorepo root (see compose.yaml): the API depends on
# @plugga/shared through a workspace link, so pnpm needs the whole workspace.
# Debian slim rather than Alpine: @node-rs/argon2 and the Prisma engines are
# native, and glibc avoids a class of musl-only surprises.
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
# openssl is required by the Prisma query engine.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

FROM base AS build
# Manifests first so a dependency-only change reuses the install layer.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY packages/config/package.json packages/config/
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# apps/api has a `prisma generate` postinstall, so the schema must be present.
COPY apps/api/prisma apps/api/prisma
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile

COPY . .
# turbo resolves @plugga/shared's build first (apps/api typecheck/build need it).
RUN pnpm --filter @plugga/api... build

FROM base AS runtime
ENV NODE_ENV=production
# Dev dependencies stay in the image on purpose: the Prisma CLI ships there and
# `pnpm db:migrate:deploy` / `db:seed` are part of the documented local flow.
COPY --from=build /app /app
WORKDIR /app/apps/api
USER node
EXPOSE 3001
# Inside a container 127.0.0.1 would make the API unreachable from the web
# container; the Compose network and the lack of a published port are what keep
# it private (ADR-0012). compose.yaml sets HOST=0.0.0.0 explicitly.
CMD ["node", "dist/main.js"]
