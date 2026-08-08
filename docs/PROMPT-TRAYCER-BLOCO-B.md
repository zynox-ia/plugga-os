# Prompt Traycer — Bloco B (desenvolvimento)

Cole o bloco abaixo no ORCHESTRATOR / epic do Traycer.

Repo: `https://github.com/zynox-ia/plugga-os`  
Base: `main` (Bloco A ENTREGUE — PRs #1 e #2)  
Ambiente: **Docker Desktop local já instalado e ok** (usar Compose do repo).

---

## Contexto

Bloco A entregue: monorepo, Nest+Next, Prisma, Compose Postgres+Redis, ADRs 0001–0007, shell 12 áreas, Integrações/Jobs RO mock, WhatsApp no-op, CI + Playwright.

Agora abrimos o **Bloco B**: sair de stub/mock para fundação **utilizável em local**, com migração controlada — **sem write/cutover em produção**.

### Natureza do produto (obrigatório)

> **Plugga/Waze OS NÃO é SaaS multi-tenant.**  
> É sistema operacional **interno** do cliente (single-tenant), hospedado na infra deles (local → staging → VPS do cliente).  
> Não criar dependência de conta Supabase/Auth0/Clerk da Zynox. Identidade e dados ficam no Postgres do projeto.

## Regra crítica (não negociável)

- Zero alteração em Bitrix/OMIE/PluggaMob/WhatsApp/Telegram/OpenClaw/crons **de produção**.
- Zero cutover de domínio sem gate explícito + aprovação humana.
- Credenciais só em `.env` / secret local — nunca no git.
- WhatsApp: `POST /channels/whatsapp/send` permanece **no-op** neste bloco (exceto se houver gate LGPD+cutover — **não há**).

## Correção de produto — Bitrix NÃO é integração permanente

**Decisão do produto (obrigatória no Bloco B):**

> Bitrix **não** é integração de produto para sempre.  
> É **Migrador Bitrix (temporário)**: ler → importar para o Postgres do Plugga OS → operar no OS → cutover por domínio → **desligar** o uso daquele pipeline no Bitrix.

Na UI/docs/código:
- Preferir nomes: `Bitrix Migrator`, `migration adapter`, modo `read_only` / `bridge` **com data de morte por domínio**.
- Não desenhar dual-write eterno.
- Destino: dado vive **só** no Plugga OS.

Máquina de estados (por domínio, ex.: OPM C7, Compras C43, Vendas C0):

```text
mock → read_only (espelho/import) → [opcional bridge curto] → OS = fonte de verdade → adapter off
```

## Ambiente local (já liberado)

- Docker Desktop no host **já instalado**.
- PLATFORM/FEATURE devem usar:
  - `docker compose up -d` (Postgres + Redis)
  - `pnpm db:migrate && pnpm db:seed`
  - `pnpm dev` / CI local
- Provar migrate/seed/`test:db` no Docker local como parte do aceite do Bloco B.

## Decisões de produto (Bloco A → B)

### 1) Auth / RBAC — self-hosted (sem SaaS de identidade)

- **Provedor: auth própria no Postgres do Plugga OS** (Better Auth **ou** NestJS + Passport/JWT + Prisma sobre `users`/`roles` já existentes).
- Manter abstração `AuthContext` (ADR-0004); **remover** dependência de stub como caminho default.
- **Não** usar Supabase Auth / Clerk / Auth0 como default (projeto não é SaaS; evita conta de identidade fora da infra do cliente).
- Fluxos mínimos de segurança no B1:
  - login email + senha (hash Argon2id ou bcrypt custo alto)
  - sessões/JWT com expiração + refresh rotacionado (ou session store no Redis/Postgres)
  - logout / invalidação de sessão
  - convite / reset de senha por **e-mail transacional** (Brevo — ver §1b)
  - rate limit em login/reset
  - cookies `httpOnly` + `Secure` + `SameSite` em ambientes não-dev
  - RBAC por papéis: admin, diretoria, pluggamob, financeiro, opm, tech, viewer
- `DEV_AUTH_*` / header stub: só local explícito, **off** por default fora de dev.
- ADR Bloco B deve registrar: “single-tenant self-hosted auth”.

### 1b) E-mail transacional — Brevo na conta do **cliente**

- Pedir ao cliente criar/usar conta **Brevo** (Sendinblue) **deles**.
- Uso: convite de usuário, reset de senha, alertas de aprovação (não marketing em massa no B1).
- Adapter `EmailPort` + implementação Brevo SMTP/API; credenciais só em `.env` do cliente.
- Em local: Mailpit/Ethoreal no Compose **ou** Brevo sandbox do cliente — documentar no README.
- Domínio/remetente: preferir domínio do cliente (SPF/DKIM) — checklist no ADR/README.

### 2) `requested_by`

- `NULL` quando ação for só `service:` (agente).
- Preenchido quando humano autenticado dispara/aprova.
- Emendar ADR-0007; UI Agentes IA mostra agent + requestedBy.

### 3) Ordem de “integrações” (migradores / leitores)

1. **Bitrix Migrator** — read_only (prioridade: C7 OPM, C43 Compras, C0 Vendas) → import para entidades locais  
2. **PluggaMob** — read_only (sessões/usuários/locais)  
3. **OMIE** — read_only  
4. **PagBank** — import arquivo (não write API)  
5. **Telegram** — card formal; sem envio  
6. **WhatsApp** — permanece mock/no-op + enriquecer contrato/UI; **sem envio real**  
7. **Brevo (e-mail)** — integração formal de notificação/auth mail (não é CRM)

Cada passo `mock → read_only` (ou “enabled” no caso Brevo) = gate documentado (ADR-0005). Sem `write` em Bitrix/OMIE/WhatsApp neste bloco.

### 4) WhatsApp

- Transição: gateway Plugguinha atrás de port (futuro).
- Direção: Meta Cloud API quando LGPD fechar.
- Bloco B: modelar canal (account/log/opt-out) + UI fila/log; send continua no-op.
- LGPD mínimo: opt-out, máscara, retenção proposta 12 meses (validar com cliente depois — não bloqueia código local).

### 5) Jobs / scheduler

- **BullMQ + Redis** para jobs do **sistema novo**.
- Catálogo read-only dos crons legados (inventário) — **não** pausar/executar produção.
- pause/retry de cron legado = fora do Bloco B.

### 6) Ordem de domínio no Bloco B

- **B1:** Auth self-hosted + Brevo (mail) + Bitrix Migrator read_only + PluggaMob read_only + observabilidade viva  
- **B2:** CRM PluggaMob (segmentos/fila) em dados do OS (sem WhatsApp real)  
- **B3:** PluggaMob Ops read (sessões/locais) + Dashboard/Pendências com `event_log` real  
- Financeiro fechamento / OPM write / Compras nativo = **Bloco C+**  
- Engenharia = V2  

### 7) OpenClaw

- Principals `service:` com secret em env.
- Toda mutação via API → `agent_actions` + `event_log`.

### 8) Segurança (barra mínima — dados sensíveis)

- Secrets só env/secret manager; Gitleaks na CI (já há direção no Bloco A).
- HTTPS em staging/prod; headers de segurança básicos no web.
- Auditoria append-only permanece (triggers).
- Princípio do menor privilégio no RBAC.
- Sem PII completa em logs (mascarar telefone/documento).
- Backups do Postgres entram no runbook (mesmo que implementação full seja depois).

### 9) Dívida

- `page-header` por rota ok.
- 1 agente = 1 worktree.
- Descartar branch morta `docs/block-a-foundation-adrs` (SoT = `main`).

## Objetivo entregável do Bloco B (MVP do bloco)

Planejar **e já implementar** começando por **B1**, com PRs pequenos:

1. ADR(s) Bloco B: Auth self-hosted single-tenant; Bitrix Migrador temporário; Brevo e-mail; ordem de domínio.  
2. Auth real atrás de `AuthContext` (fluxo local documentado no README).  
3. `requested_by` preenchido no caminho humano.  
4. Adapter e-mail Brevo + templates mínimos (convite/reset).  
5. Bitrix Migrator: adapter **read_only** + job de import (credencial só `.env`) para espelhar pipelines prioritários.  
6. PluggaMob reader read_only (mesmo padrão).  
7. UI Integrações: Bitrix como “Migrador (temporário)” + card Brevo; modos/status reais.  
8. Scheduler BullMQ para jobs **novos** (ex.: sync migrator), inventário legado read-only.  
9. Testes: unit + e2e smoke (login real); Docker compose no happy path local.  
10. WhatsApp: sem envio real; opcional tabelas de canal + UI log local.

## Critérios de aceite (B1)

- [ ] `docker compose up -d` + migrate + seed + API/Web sobem no README  
- [ ] Login real self-hosted (não header stub) em local  
- [ ] Convite/reset de senha via e-mail (Brevo ou Mailpit em local)  
- [ ] Guard RBAC com papéis reais  
- [ ] Bitrix como **migrador temporário**, não integração eterna  
- [ ] Pelo menos 1 sync read_only Bitrix → DB local (credencial só `.env`)  
- [ ] Nenhuma chamada write a Bitrix/WhatsApp/OMIE/produção  
- [ ] CI verde  
- [ ] ADRs Bloco B commitados (inclui “não é SaaS” + auth self-hosted)  

## Roster (multi-agente) — só Cursor (sem Codex)

**Decisão de tooling (hoje):** não usar Codex (conta esgotada).  
Todo o Bloco B roda no **Cursor**, com a maior parte das tarefas em:

- **Cloud Opus 4.8**
- **Cloud Sonnet 5**

| Papel | Modelo | Foco Bloco B |
|---|---|---|
| ORCHESTRATOR | Cursor Auto (local) | Epic brief, tasks, gates, merge order, handoffs |
| ARCHITECT | **Cloud Opus 4.8** | ADRs B (Auth self-hosted, Migrador Bitrix, Brevo, segurança), reviews de PR |
| PLATFORM | **Cloud Opus 4.8** (tarefas difíceis) ou **Cloud Sonnet 5** (scaffold/implementação) | Auth, Brevo adapter, BullMQ, migrator infra, Compose |
| FEATURE | **Cloud Sonnet 5** | UI login/convite, Integrações/Migrador, CRM B2 quando liberar |
| UI_QA | **Cloud Sonnet 5** | Smoke e2e login + fluxos auth |

### Como repartir Opus vs Sonnet

- **Opus 4.8:** arquitetura, ADRs, reviews de segurança, auth/sessão, migrator Bitrix (contratos e riscos), qualquer PR que toque auditoria/`agent_actions`.  
- **Sonnet 5:** implementação de telas, wiring API↔UI, e2e, refinos, PRs de feature após ADR aprovado.  
- **Auto:** orquestração apenas — não implementar domínio sozinho.

Não spawnar agentes Codex. Se algum harness antigo apontar Codex, reconfigurar para Cloud Opus/Sonnet.

## Primeira ação do ORCHESTRATOR

1. Confirmar `main` atual e Docker local.  
2. Abrir epic **Bloco B — Auth self-hosted + Migradores read_only (B1)**.  
3. Pedir ADRs ao ARCHITECT em **Cloud Opus 4.8** (Auth self-hosted single-tenant; Bitrix Migrator; Brevo).  
4. Liberar PLATFORM (Opus/Sonnet) após Gate ADRs.  
5. Não autorizar WhatsApp real nem write Bitrix.  
6. Não introduzir Supabase Auth / SaaS de identidade.  
7. Não usar Codex neste epic.

Trabalhem como time sênior: PRs pequenos, Docker local, migração para dentro do Plugga OS, segurança alta, operação real intocável.
