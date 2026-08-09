# syntax=docker/dockerfile:1

# Build context is the monorepo root (see compose.yaml): the API depends on
# @plugga/shared through a workspace link, so pnpm needs the whole workspace.
# Debian slim rather than Alpine: @node-rs/argon2 and the Prisma engines are
# native, and glibc avoids a class of musl-only surprises.
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
# openssl is required by the Prisma query engine; curl fetches the Tesseract
# language data in the runtime stage (the slim image ships neither).
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates curl \
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

# Chromium renders the energy-efficiency study PDF (SKILL.md forbids
# LibreOffice: it destroys the layout).
#
# Playwright's own browser, not Debian's `chromium` package: pointing
# `executablePath` at a distro build is an unsupported pairing, because
# Playwright speaks a CDP dialect pinned to the Chromium it ships. It often
# works and then breaks on an unrelated apt upgrade — a failure that would only
# surface when someone tried to download a client report.
#
# Installed to a shared path rather than the installing user's cache: the image
# runs as `node`, and a browser sitting in root's HOME would be invisible to it.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN pnpm exec playwright install --with-deps chromium \
  && chmod -R a+rX /ms-playwright \
  && rm -rf /var/lib/apt/lists/*
# See documento/pdf.ts: the Chromium sandbox needs user namespaces, which
# Docker's default seccomp profile blocks. Safe here only because the HTML is
# ours and every case field is escaped before it reaches the page.
ENV CHROMIUM_NO_SANDBOX=true

# Dados de treino do Tesseract para leitura de fatura digitalizada.
#
# Baixados aqui, na construção da imagem, e não pelo tesseract.js na primeira
# leitura. O padrão da biblioteca é buscar o arquivo num CDN quando a primeira
# fatura chega — uma dependência de rede escondida dentro do que a pessoa vê
# como uma operação local. Numa VPS sem saída para a internet, ou com o CDN
# fora do ar, a primeira digitalização falharia com erro de download.
#
# `por` é o único idioma incluído: fatura de distribuidora brasileira. São
# ~15 MB; os outros cem idiomas não teriam uso aqui.
ENV TESSERACT_DATA_PATH=/app/tessdata
RUN mkdir -p /app/tessdata \
  && curl -fsSL -o /app/tessdata/por.traineddata.gz \
    https://tessdata.projectnaptha.com/4.0.0/por.traineddata.gz \
  && chmod -R a+rX /app/tessdata

USER node
EXPOSE 3001
# Inside a container 127.0.0.1 would make the API unreachable from the web
# container; the Compose network and the lack of a published port are what keep
# it private (ADR-0012). compose.yaml sets HOST=0.0.0.0 explicitly.
CMD ["node", "dist/main.js"]
