# Architecture Decision Records — plugga-os

Este diretório guarda os ADRs (Architecture Decision Records) do plugga-os.
Um ADR registra **uma** decisão arquitetural: o contexto, a decisão tomada, as
consequências e as alternativas consideradas. ADRs são curtos, imutáveis depois
de aceitos e superados por um novo ADR quando a decisão muda (nunca editados para
"reescrever a história").

## Escopo destes ADRs

**Bloco A (0001–0007)** cobre a **fundação** (monorepo, API, banco local,
observabilidade, contratos e limites). **Bloco B (0008–0012)** tira o OS do
stub/mock: auth real self-hosted, e-mail transacional, Bitrix como Migrador
temporário read_only, o sequenciamento/limites do bloco e a exposição de rede. Nenhum deles decide
regras de **domínio** (CRM, OPM, PluggaMob, Financeiro, Compras) — essas virão em
ADRs próprios por domínio, quando cada domínio entrar em construção.

### Regra crítica de operação (vale para todos os ADRs)

> Nenhuma decisão aqui autoriza acesso, escrita, configuração, disparo ou cutover
> em Bitrix, OMIE, PluggaMob/OCPP, PagBank, WhatsApp, Telegram, OpenClaw, crons ou
> qualquer serviço em produção. Nenhum segredo no repositório. Sem Kafka, sem
> Kubernetes, sem microserviços no MVP. Cutover só por domínio, com aprovação
> explícita (ver ADR-0005).

## Índice

### Bloco A — Fundação

| ADR | Título | Status |
|---|---|---|
| [0001](0001-monorepo-pnpm-turborepo-boundaries.md) | Monorepo pnpm + Turborepo e boundaries | Aceito |
| [0002](0002-next-nest-modular-monolith.md) | Next.js + NestJS como monólito modular | Aceito |
| [0003](0003-postgresql-prisma-minimal-data-model.md) | PostgreSQL + Prisma e modelo de dados mínimo | Aceito |
| [0004](0004-auth-rbac-stub.md) | Auth/RBAC do Bloco A como stub e evolução futura | Aceito (superado parc. por 0008) |
| [0005](0005-integrations-readonly-mock-write-gate.md) | Integrações read-only/mock → write por gate/cutover | Aceito |
| [0006](0006-whatsapp-p0-no-real-send.md) | WhatsApp P0 como integração formal sem envio real | Aceito |
| [0007](0007-observability-audit-jobs.md) | Observabilidade: auditoria, event log e jobs | Aceito (emenda Bloco B) |

### Bloco B — Auth real + Migradores read_only

| ADR | Título | Status |
|---|---|---|
| [0008](0008-auth-self-hosted-single-tenant.md) | Auth self-hosted single-tenant (Nest + sessão + Prisma; **não** SaaS) | Aceito |
| [0009](0009-bitrix-migrator-temporary.md) | Bitrix como Migrador temporário (não integração eterna) | Aceito |
| [0010](0010-brevo-email-emailport.md) | E-mail transacional: Brevo atrás de `EmailPort` + Mailpit local | Aceito |
| [0011](0011-block-b-sequencing-and-limits.md) | Bloco B: ordem B1/B2/B3 e limites não negociáveis | Aceito |
| [0012](0012-network-exposure-trust-proxy.md) | Exposição de rede: bind privado, `trust proxy` explícito, XFF validado | Aceito |

## Formato de um ADR

```
# ADR-NNNN — Título curto
- Status · Data · Decisores · Contexto do bloco
## Contexto
## Decisão
## Consequências (positivas / negativas / neutras)
## Alternativas consideradas
## Gatilhos de revisão
## Guardas de escopo (o que este ADR NÃO autoriza)
```

## Decisões deliberadamente adiadas (fora do Bloco A)

Estas decisões seguem mantidas atrás de abstrações para não travar o produto
(ver PRD §19):

- Hospedagem do Postgres: Supabase cloud vs self-hosted na VPS (ADR-0003). Nota:
  identidade e dados são single-tenant no Postgres do cliente (ADR-0008).
- Provedor/gateway de WhatsApp: Plugguinha atual vs oficial Meta, e política
  LGPD/opt-out/retenção (ADR-0006) — WhatsApp segue no-op no Bloco B (ADR-0011).
- Retenção de `agent_actions`, `event_log` e anexos (ADR-0007).
- Quando Compras entra: MVP tardio vs V1.1 (fora da fundação).

**Resolvidas desde a fundação:**

- Provedor de identidade: **auth self-hosted (Nest + sessão + Prisma)**, não SaaS
  (ADR-0008, supera parcialmente o stub do ADR-0004).
