# syntax=docker/dockerfile:1

# Build context is the monorepo root (see compose.yaml): the web app depends on
# @plugga/shared through a workspace link.
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS build
# Manifests first so a dependency-only change reuses the install layer.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY packages/config/package.json packages/config/
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/api/prisma apps/api/prisma
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile

COPY . .
# A URL da API NAO e mais lida no build (US12, T128): API_INTERNAL_URL e resolvida
# em tempo de execucao pelo servidor, entao a mesma imagem serve a qualquer
# ambiente. Defina-a no `environment` do conteiner (compose.yaml).
RUN pnpm --filter @plugga/web... build

FROM base AS runtime
ENV NODE_ENV=production
# Next's standalone bundle already contains the traced node_modules, so nothing
# else from the workspace is copied in.
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
# The standalone server honours HOSTNAME/PORT; 0.0.0.0 is required for the
# published port to reach it (compose.yaml keeps it bound to 127.0.0.1 on the host).
ENV HOSTNAME=0.0.0.0 PORT=3000
CMD ["node", "apps/web/server.js"]
