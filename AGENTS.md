## Contexto do projeto (gerado na preparação — revisar à mão quando mudar)

### Stack

- Monorepo pnpm workspaces com Turborepo (`package.json:5-16`, `pnpm-workspace.yaml:1-3`, `turbo.json:1-20`).
- Node 24 (`.nvmrc:1`; faixa `>=22 <27` em `package.json:6-7`); pnpm 11.20.0 (`package.json:5`); Turborepo 2.5.6 (`package.json:25`).
- Web: Next.js 15.5.24 e React 19.1.1 (`apps/web/package.json:16-17`).
- API: NestJS 11 (dependências declaradas como 11.1.6 e sobrescritas para 11.1.18 em `pnpm-workspace.yaml:4-6`); Prisma 6.15.0 e Vitest 3.2.4 (`apps/api/package.json:39,44,67-72`).
- Persistência: PostgreSQL com Prisma e Redis; a CI usa Postgres 16 e Redis 7.4 (`apps/api/prisma/schema.prisma`, `.github/workflows/ci.yml:29-49`).
- `packages/shared` contém contratos TypeScript compartilhados; `packages/config` contém configuração de tooling (`docs/adr/0001-monorepo-pnpm-turborepo-boundaries.md:18-34`).

### Comandos oficiais

| Ação | Comando | Verificado em |
|---|---|---|
| Instalar | `pnpm install --frozen-lockfile` | 2026-10-08: OK, exit 0; lockfile congelado e 6 projetos instalados. |
| Rodar local | `docker compose up -d`; `pnpm db:generate`; `pnpm db:migrate`; `pnpm db:seed`; `pnpm dev` | Documentado em `README.md:39-46`; não executado nesta preparação, pois inicia dependências locais. |
| Testes | `pnpm test` | 2026-10-08: exit 1; 2 testes falharam no pacote `@plugga/auditoria-oraculo` (detalhes abaixo). |
| Lint | `pnpm lint` | 2026-10-08: OK, 5/5 pacotes. |
| Typecheck | `pnpm typecheck` | 2026-10-08: OK, 7/7 tarefas; Turbo avisou que `@plugga/config#build` não declara arquivos de saída. |
| Build | `pnpm build` | 2026-10-08: exit 1 no Windows ao criar symlinks em `.next/standalone` (`EPERM`); a compilação do Next terminou, a cópia de arquivos rastreados falhou. A CI executa o mesmo comando em Ubuntu (`.github/workflows/ci.yml:124`). |

Problemas conhecidos desta execução:

- `pnpm test`: falharam `cobre os 141 arquivos normativos e confere com a árvore` e `o arquivo em disco é exatamente o que o gerador produz`, em `packages/auditoria-oraculo/src/manifesto.test.ts`. Os hashes do manifesto versionado divergem dos arquivos da árvore; 30 dos 32 testes do pacote passaram.
- `corepack enable` não conseguiu escrever em `C:\Program Files\nodejs\pnpm` (`EPERM`). O `pnpm` já disponível era 11.20.0, igual à versão fixada, e `corepack install` e `pnpm install --frozen-lockfile` passaram.
- O build local no Windows requer permissão para criar symlinks no diretório `.next/standalone`; esse requisito não foi validado em outro sistema operacional.

### Mapa do código

| Área | Pasta | Observações |
|---|---|---|
| Telas e rotas | `apps/web/app/` | Next.js App Router; exemplos: `app/page.tsx`, `app/clientes/page.tsx`, `app/energia-opm/`. |
| Componentes | `apps/web/app/components/` | Componentes por domínio, como `app-shell.tsx`, `clientes-view.tsx` e `dashboard-view.tsx`. |
| Estado e acesso à API no web | `apps/web/app/lib/` | Clientes, proxies e sessão; exemplos: `api.ts`, `auth-proxy.ts`, `use-session-user.tsx`. |
| API e domínios | `apps/api/src/` | Módulos NestJS por domínio. Em `src/clientes/` há controller, service, module, repository e implementação Prisma. |
| Banco e migrations | `apps/api/prisma/` | `schema.prisma` e 19 migrations versionadas; acesso via Prisma. |
| Contratos compartilhados | `packages/shared/src/` | Tipos, DTOs, enums e eventos usados por web e API. |
| Testes | `apps/web/test/`, `apps/web/e2e/`, `apps/api/src/`, `apps/api/test/`, `packages/*/src/` | Testes unitários, de integração e E2E; a CI roda `pnpm test` e `pnpm test:e2e` (`.github/workflows/ci.yml:112-174`). |
| Documentação e operações | `docs/`, `ops/`, `scripts/` | ADRs e guias; scripts de deploy, backup e testes locais. |

### Convenções

- A arquitetura separa `apps/web`, `apps/api` e pacotes compartilhados; web e API não importam um ao outro. Módulos da API expõem interfaces intencionais e mantêm repositórios junto ao domínio (`docs/AGENT.md:30-47`, `docs/adr/0001-monorepo-pnpm-turborepo-boundaries.md`, `docs/adr/0002-next-nest-modular-monolith.md`).
- Arquivos da API seguem nomes como `*.controller.ts`, `*.service.ts`, `*.repository.ts`; testes unitários usam `*.spec.ts` ou `*.test.ts`, e E2E web usa `*.spec.ts` em `apps/web/e2e/`.
- O histórico recente usa prefixos `feat:`, `fix:`, `chore:` e `docs:` com descrições em português (`git log --oneline -30`, consultado em 2026-10-08).
- Os nomes das variáveis de ambiente estão em `.env.example`; entre elas: `DATABASE_URL`, `REDIS_URL`, `AUTH_SESSION_SECRET`, `NEXT_PUBLIC_API_URL`, `STORAGE_ENDPOINT`, `JOBS_ENABLED` e `SECRETS_ENCRYPTION_KEY`. Use apenas os placeholders do exemplo; não leia nem copie valores de `.env`.
- A CI roda lint, typecheck, testes e build em `.github/workflows/ci.yml:112-124`; `docs/AGENT.md:65-76` também os lista para handoff.

### Fluxo de trabalho com agentes

- Este projeto usa GitHub Spec Kit. Skills: Claude `/speckit-<cmd>`, Codex `$speckit-<cmd>`.
- Features e ajustes: fluxo SDD (`specify → clarify → plan → tasks → analyze → implement → converge`).
- Bugs: extensão `bug` (`bug-assess → bug-fix → bug-test`).
- Cada fase roda em um agente novo, disparado pelo Coordenador. Não pule fases.
