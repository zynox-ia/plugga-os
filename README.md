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
- Docker com Docker Compose para Postgres, Redis e Mailpit locais.

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

`pnpm db:seed` é idempotente e **não sobrescreve decisão de cutover**: ao
reexecutar, ele só atualiza o catálogo das integrações (`name`, `owner`). O
`mode` é semeado como `mock` apenas na criação da linha, e `status`,
`last_sync_at` e `last_error` são estado operacional — nenhum dos quatro é
revertido por um reseed. Assim, virar uma integração para `read_only` sobrevive
ao próximo seed em vez de fechar o gate do migrador silenciosamente.

Com a API em execução, verifique:

```bash
curl --fail http://localhost:3001/health
```

### Login real (self-hosted)

A autenticação padrão é **real e self-hosted** (ADR-0008): login por e-mail+senha,
sessão server-side opaca em Postgres, cookie `httpOnly`. O `seed` cria um admin
local a partir de `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` do seu `.env`.

```bash
cp .env.example .env
docker compose up -d
pnpm db:migrate:deploy
pnpm db:seed
pnpm --filter @plugga/api start   # ou: pnpm dev

# Login real (guarda o cookie de sessão em cookies.txt):
curl -i -c cookies.txt -X POST http://localhost:3001/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@plugga.local","password":"local_only_change_me"}'

# Sessão atual usando o cookie:
curl --fail -b cookies.txt http://localhost:3001/auth/me

# Logout (revoga a sessão imediatamente):
curl -i -b cookies.txt -X POST http://localhost:3001/auth/logout
```

Administradores gerenciam usuários por `/auth/invite`, `/auth/users`,
`/auth/users/:id/roles` e `/auth/users/:id/deactivate`. Convite e reset emitem
tokens de uso único entregues por `EmailPort` (ADR-0010).

### E-mail transacional (Mailpit local / Brevo no cliente)

| `EMAIL_PROVIDER` | Comportamento |
|---|---|
| `noop` (default seguro) | Loga e **não envia** (sem token/link no log) |
| `mailpit` | SMTP → container Mailpit do Compose; nada sai da máquina |
| `brevo` | API Brevo na **conta do cliente** (staging/prod); exige `BREVO_API_KEY` |

Local recomendado: `EMAIL_PROVIDER=mailpit` (já no `.env.example`). Após
`docker compose up -d`, abra a inbox em [http://localhost:8025](http://localhost:8025).

Smoke de entrega local (Mailpit no Compose; também roda na CI):

```bash
pnpm --filter @plugga/api test:email
```

**Staging/prod (VPS do cliente):** `EMAIL_PROVIDER=brevo` + `BREVO_API_KEY` só em
secret/env — nunca no git. Templates de convite/reset são versionados no OS
(não no editor de templates do Brevo).

Checklist de entregabilidade no DNS do cliente (não é código do OS; ADR-0010):

- [ ] SPF inclui o Brevo no domínio remetente
- [ ] DKIM do Brevo publicado no DNS
- [ ] DMARC presente (ao menos `p=none` para monitorar)
- [ ] Remetente/domínio autenticado no painel Brevo do cliente
- [ ] E-mail de teste com `spf=pass` / `dkim=pass` no cabeçalho

### Cutover auth (staging/prod)

Antes de expor a API fora de localhost:

- Defina `AUTH_ALLOWED_ORIGINS` com as origins do browser (ex.: `https://os.cliente.com`).
  Sem isso, o `OriginCheckGuard` só aceita localhost.
- Não force `AUTH_COOKIE_SECURE=false` em staging/prod — o cookie Secure deve
  permanecer ligado atrás de HTTPS.
- O processo web (`apps/web`) precisa ficar atrás de um reverse proxy que
  **sobrescreva** `X-Forwarded-For` com o IP real do cliente (nunca repasse um
  valor vindo do próprio cliente). A API só confia no hop loopback
  (`trust proxy: "loopback"` em `apps/api/src/main.ts`, já que ela escuta em
  `127.0.0.1`) para aplicar rate limiting por IP em `/auth/*` — sem um reverse
  proxy correto na frente do web, todo tráfego cai no mesmo balde.

### Escape hatch de desenvolvimento

`DEV_AUTH_ENABLED=true` habilita, **apenas em local/e2e**, um caminho por headers
`x-dev-principal`/`x-dev-roles`, coexistindo com o login real. Fica `false` por
padrão e é proibido em produção; nunca é o caminho de autenticação exposto.

A API escuta apenas em `127.0.0.1` por padrão. Para permitir acesso por outras
interfaces de rede em um ambiente local controlado, configure `HOST=0.0.0.0`
explicitamente.

Para encerrar apenas a infraestrutura local:

```bash
docker compose down
```

### Jobs assíncronos (BullMQ + Redis)

Jobs novos do OS rodam em uma fila **BullMQ** sobre o **Redis** do Compose
(ADR-0007/0011). O primeiro consumidor é o import read_only do Bitrix (abaixo).
Crons legados continuam apenas como **inventário read-only** (nada é criado,
pausado ou migrado).

| Variável | Efeito |
|---|---|
| `JOBS_ENABLED` | `false` por default: a API sobe sem Redis e a fila fica desabilitada (enqueue falha explicitamente, nunca descarta job em silêncio). `true` liga a fila + worker neste processo. |
| `REDIS_URL` | Redis local (guard de host local, como `DATABASE_URL`). |
| `JOBS_WORKER_CONCURRENCY` | Jobs processados em paralelo pelo worker (default `1`). |

Cada execução alimenta `job_runs` (`running → success/failed`, com
`attempt`, `duration_ms`, `error`, `triggered_by`) — observabilidade por
ADR-0007. Nenhum token/segredo entra em log.

Smoke da fila ponta a ponta (enqueue → worker → `job_runs`), com Redis + Postgres
do Compose; também roda na CI:

```bash
JOBS_ENABLED=true pnpm --filter @plugga/api test:jobs
```

### Bitrix Migrator (read_only, temporário)

O Bitrix Migrator lê **um** domínio prioritário — OPM, código `C7` — e espelha
os registros no Postgres do OS (ADR-0009). Ele é **read-only por construção**:
o adapter só aceita métodos de leitura (`.list`/`.get`/`.fields`) e recusa
qualquer método de escrita **antes** de emitir a requisição. Não existe caminho
de write para o Bitrix em nenhum estado de configuração.

| Variável | Efeito |
|---|---|
| `BITRIX_WEBHOOK_URL` | Webhook REST de entrada (token no path). **Segredo**: só em `.env`/secret — nunca no git, nunca na tabela `integrations`, nunca em log. Exigido `https` e path com `/rest/`. |
| `BITRIX_OPM_ENTITY_TYPE_ID` | `entityTypeId` do domínio OPM (C7) no portal do cliente. Fornecido na ativação. |
| `BITRIX_IMPORT_PAGE_SIZE` | Tamanho de página das leituras (default e máximo `50`). |

O import só existe como capacidade quando **as duas** condições valem:

1. `integrations.bitrix.mode = read_only` (o seed mantém `mock`; a troca é uma
   decisão de cutover, não um default), e
2. a credencial está presente no ambiente.

O gate é avaliado **no momento em que o job roda**, não só na chamada HTTP. Um
job enfileirado pelo scheduler, ou uma retentativa do BullMQ que executa depois
de o modo ser rebaixado, encontra o gate fechado e registra `job_run` com status
`skipped` — sem ler o Bitrix. O `409` (sem modo) e o `503` (sem credencial) do
endpoint são apenas feedback síncrono para quem chamou, não a garantia.

```bash
# Enfileira o import (admin apenas); o worker precisa de JOBS_ENABLED=true:
curl -si -X POST http://127.0.0.1:3001/integrations/bitrix/import \
  -b cookies.txt -H "origin: http://localhost:3000"
```

O job é **idempotente**: cada registro é espelhado por `(domain, external_id)`
com um fingerprint estável do payload, então reimportar dados iguais não escreve
nada (`unchanged`). Registros sem id são contados como `skipped` — nunca
descartados em silêncio. Cada execução alimenta `job_runs`.

Smoke de idempotência contra o Postgres do Compose (também roda na CI):

```bash
pnpm --filter @plugga/api test:bitrix
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
- Integrações são registros/adapters `mock`, com uma exceção explícita: o
  **Bitrix Migrator** tem adapter de **leitura real** em modo `read_only`
  (ADR-0009), gated por modo + credencial. Não existe adapter de **escrita**
  para nenhuma integração.
- WhatsApp e Telegram nunca enviam mensagens. Uma rota mock pode validar e
  auditar localmente, mas é um no-op de entrega.
- Jobs são somente inventário mock. Não há pause, retry, migração ou controle de
  cron real.
- `event_log` e `agent_actions` são trilhas append-only.
- Auth/RBAC é **real e self-hosted** (sessão em Postgres, Argon2id, RBAC por
  papel — ADR-0008); nenhum SaaS de identidade é usado. O antigo stub por header
  permanece apenas como escape hatch local sob `DEV_AUTH_ENABLED`.

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
