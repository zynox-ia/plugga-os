# Contexto para agentes

Leia também o contrato operacional em [`docs/AGENT.md`](docs/AGENT.md), a constituição em [`.specify/memory/constitution.md`](.specify/memory/constitution.md), os ADRs em `docs/adr/` e o guia de operação em `ops/GUIA.md`. Esta página resume a estrutura e os comandos observados em `origin/main` `48883b0` durante a preparação, em 2026-10-08.

## Contexto do projeto (gerado na preparação — revisar à mão quando mudar)

### Stack

- Monorepo com pnpm workspaces e Turborepo (`package.json:5-7,32`, `pnpm-workspace.yaml:1-3`, `turbo.json`).
- Node 24 (`.nvmrc:1`, faixa de engines `>=22 <27` em `package.json:6-8`); pnpm 11.20.0 (`package.json:5`); Turborepo 2.5.6 (`package.json:32`).
- Web: Next.js 15.5.24, React 19.1.1 e TypeScript (`apps/web/package.json:16-17`).
- API: NestJS 11.1.6 nas dependências e 11.1.18 nos overrides do workspace; Prisma 6.15.0, Vitest 3.2.4 e TypeScript 5.9.2 (`apps/api/package.json:34,41,66-67`, `pnpm-workspace.yaml:5-10`).
- Dados e infraestrutura local: PostgreSQL com Prisma, Redis e armazenamento S3 compatível SeaweedFS (`apps/api/prisma/schema.prisma`, `compose.yaml`, `.env.example`). A CI usa PostgreSQL 16 e Redis 7.4 (`.github/workflows/ci.yml`).
- `packages/shared` publica contratos TypeScript compartilhados; as fronteiras entre apps e packages estão descritas em `docs/adr/0001-monorepo-pnpm-turborepo-boundaries.md` e `docs/AGENT.md:32-55`.

### Comandos oficiais verificados

| Ação | Comando | Verificado em |
|---|---|---|
| Instalar dependências | `pnpm install --frozen-lockfile` | 2026-10-08: PASS, lockfile válido e 5 projetos workspace instalados. |
| Testes unitários e de integração locais | `pnpm test` | 2026-10-08: PASS, 6 tarefas Turbo concluídas; API registrou 866 testes aprovados e 72 ignorados, sem falhas. |
| Lint | `pnpm lint` | 2026-10-08: PASS, 4 tarefas; verificações de event log, rede externa e imports legados passaram. |
| Typecheck | `pnpm typecheck` | 2026-10-08: PASS, 6 tarefas. O primeiro run leu tipos antigos em `apps/web/.next/types`; removido apenas esse diretório gerado e executado `pnpm --filter @plugga/web exec next typegen` antes da repetição. |

### Comandos documentados que não foram validados como comandos locais

- Build: a CI executa `pnpm build` em Ubuntu (`.github/workflows/ci.yml`). Em 2026-10-08, o build local no Windows compilou e gerou as páginas estáticas, mas falhou ao criar symlinks para `.next/standalone` (`EPERM`). Trate como problema local de ambiente até uma execução em Linux confirmar o resultado.
- Inicialização local: o `README.md` documenta `corepack install`, `pnpm install --frozen-lockfile`, `docker compose up -d`, `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:seed` e `pnpm dev`. Não foi executada, pois inicia serviços locais e exige banco/Redis.
- E2E web: `pnpm test:e2e` está declarado no projeto e configurado na CI, que prepara serviços e Chromium (`.github/workflows/ci.yml`). Não foi executado localmente nesta preparação.

### Mapa do código

| Área | Pasta | Observações |
|---|---|---|
| Telas e rotas web | `apps/web/app/` | Next.js App Router; exemplos `page.tsx`, `clientes/page.tsx` e `energia-opm/relatorios/page.tsx`. Rotas BFF ficam em `app/api/`, por exemplo `api/clientes/route.ts` e `api/commercial/opportunities/route.ts`. |
| Componentes | `apps/web/app/components/` | Componentes compartilhados e por domínio; exemplos `app-shell.tsx`, `clientes-view.tsx` e `compras-view.tsx`. |
| Estado, sessão e acesso à API web | `apps/web/app/lib/` | Clientes, proxy e helpers de sessão; exemplos `api.ts`, `proxy.ts`, `use-session-user.tsx` e `navigation.ts`. |
| API e domínios | `apps/api/src/` | Módulos NestJS por domínio, incluindo `auth/`, `clientes/`, `compras/`, `commercial/`, `energy/`, `integrations/`, `jobs/`, `obras/` e `pluggamob/`; controllers, services e repositories vivem junto ao domínio. |
| Banco e migrations | `apps/api/prisma/` | `schema.prisma`, `seed.ts` e migrations versionadas; havia 19 diretórios de migration no inventário de 2026-10-08. |
| Contratos compartilhados | `packages/shared/src/` | DTOs, tipos, enums e eventos usados entre web e API. |
| Testes | `apps/web/test/`, `apps/web/e2e/`, `apps/api/src/`, `apps/api/test/`, `packages/*/` | Web usa testes Node e Playwright; API usa Vitest com arquivos `*.spec.ts` e `*.e2e.spec.ts`; a CI roda as suítes e os testes com infraestrutura. |
| Documentação e operação | `docs/`, `specs/`, `ops/`, `scripts/` | ADRs e contrato de agentes, specs históricas, guias operacionais e verificações de segurança/entrega. As specs concluídas são registros históricos (`docs/AGENT.md:57-92`). |

### Convenções

- Limites observados: `apps/*` podem depender de `packages/*`, mas packages não importam apps; web e API conversam por HTTP usando `packages/shared`; módulos API expõem interfaces próprias (`docs/AGENT.md:32-55`, ADR-0001 e ADR-0002).
- Arquivos API seguem sufixos `*.controller.ts`, `*.service.ts` e `*.repository.ts`; testes usam `*.spec.ts`/`*.test.ts`, com e2e em `apps/api/test/` e `apps/web/e2e/`.
- O histórico recente usa prefixos `feat:`, `fix:`, `chore:`, `docs:` e `test:`, com descrições em português (`git log --oneline -30`, executado em 2026-10-08).
- Chaves presentes em `.env.example` (nomes apenas; nem todas são necessariamente obrigatórias): `NODE_ENV`, `HOST`, `PORT`, `API_INTERNAL_URL`, `POSTGRES_PORT`, `REDIS_PORT`, `STORAGE_PORT`, `STORAGE_ADMIN_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `APP_DB_USER`, `APP_DB_PASSWORD`, `DATABASE_URL`, `REDIS_URL`, `DEV_AUTH_ENABLED`, `ROUTE_GUARD_MODE`, `LOG_LEVEL`, `TRUST_PROXY`, `WEB_TRUST_PROXY`, `AUTH_SESSION_SECRET`, `AUTH_APP_BASE_URL`, `GOOGLE_AUTH_ENABLED`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_SAMPLE_TEAM`, `EMAIL_PROVIDER`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`, `BITRIX_IMPORT_PAGE_SIZE`, `JOBS_ENABLED`, `JOBS_WORKER_CONCURRENCY`, `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `SECRETS_ENCRYPTION_KEY`. Não leia nem copie valores de `.env`.

### Fluxo de trabalho com agentes

- Este projeto usa GitHub Spec Kit. Skills: Claude `/speckit-<cmd>`, Codex `$speckit-<cmd>`; ambas as integrações estão instaladas.
- Features e ajustes seguem SDD: specify → clarify → plan → tasks → analyze → implement → converge. O projeto mantém artefatos em `specs/NNN-nome/` e os escreve em português (`docs/AGENT.md:57-92`).
- Bugs usam a extensão `bug`: bug-assess → bug-fix → bug-test.
- No fluxo do Coordenador, cada fase roda em um agente novo; não pule fases.
- A política de branches documentada é trabalhar a partir de `develop` e abrir PR para `develop`; `main` é produção protegida (`docs/AGENT.md:119-160`). Siga exceções explícitas dadas pelo humano responsável.
