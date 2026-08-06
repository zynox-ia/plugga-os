# Plugga OS

Sistema operacional interno da **Plugga / Waze Energia**, organizado como um
monorepo pnpm + Turborepo com Next.js, NestJS e contratos TypeScript
compartilhados.

> **Limite operacional:** esta fundação é local e mock-only. Ela não autoriza
> acesso, escrita, envio, configuração ou cutover em Bitrix, OMIE,
> PluggaMob/OCPP, PagBank, WhatsApp, Telegram, OpenClaw, crons ou produção.

## Estrutura

| Caminho | Responsabilidade |
|---|---|
| `apps/web` | Aplicação Next.js |
| `apps/api` | API NestJS em monólito modular |
| `packages/shared` | DTOs, tipos, enums e eventos livres de framework |
| `packages/config` | Configuração compartilhada de tooling |
| `docs/adr` | Decisões e limites arquiteturais aceitos |

Aplicações podem importar pacotes; pacotes nunca importam aplicações. Web e API
se comunicam apenas por HTTP e pelos contratos de `packages/shared`.

## Pré-requisitos

- Node.js LTS na versão indicada por `.nvmrc`;
- Corepack habilitado (a versão de pnpm é fixada no `package.json`);
- Docker com Docker Compose para Postgres e Redis locais.

## Executar localmente

```bash
cp .env.example .env
corepack enable
corepack install
pnpm install --frozen-lockfile
docker compose up -d
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Os nomes exatos dos scripts de banco são mantidos no `package.json`. O Compose e
as migrações destinam-se somente ao banco local definido em `.env`.

Com a API em execução, verifique:

```bash
curl --fail http://localhost:3001/health
```

Endpoints protegidos usam somente o stub local quando
`DEV_AUTH_ENABLED=true`. Informe um principal sintético em `x-dev-principal` e
papéis separados por vírgula em `x-dev-roles`; esses headers não são segredos nem
um mecanismo de autenticação para ambientes expostos.

A API escuta apenas em `127.0.0.1` por padrão. Para permitir acesso por outras
interfaces de rede em um ambiente local controlado, configure `HOST=0.0.0.0`
explicitamente; o stub de autenticação não é seguro para exposição pública.

Para encerrar apenas a infraestrutura local:

```bash
docker compose down
```

## Qualidade e CI

A CI executa em pull requests e em pushes para `main`, usando o lockfile e os
mesmos comandos raiz:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Segurança e escopo do Bloco A

- `.env.example` contém somente placeholders. Nunca versione `.env`, tokens,
  senhas, webhooks, chaves, endpoints reais ou dados pessoais.
- Integrações são apenas registros/adapters `mock`; não existe adapter real de
  leitura ou escrita neste bloco.
- WhatsApp e Telegram nunca enviam mensagens. Uma rota mock pode validar e
  auditar localmente, mas é um no-op de entrega.
- Jobs são somente inventário mock. Não há pause, retry, migração ou controle de
  cron real.
- `event_log` e `agent_actions` são trilhas append-only.
- Auth/RBAC é um stub local atrás de abstrações e não deve ser exposto como
  autenticação de produção.

Leia o [guia de agentes](docs/AGENT.md) antes de contribuir. Qualquer evolução
para integração real ou write exige ADR, gates técnicos e aprovação explícita de
cutover por domínio.

## Documentação

| Documento | Descrição |
|---|---|
| [`docs/PRD-plugga-waze-os.md`](docs/PRD-plugga-waze-os.md) | PRD do produto |
| [`docs/mapa-produto-mvp.md`](docs/mapa-produto-mvp.md) | Mapa resumido de telas |
| [`docs/adr/README.md`](docs/adr/README.md) | Índice dos ADRs do Bloco A |
| [`docs/mockup/index.html`](docs/mockup/index.html) | Mockup visual da marca Plugga |
