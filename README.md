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
