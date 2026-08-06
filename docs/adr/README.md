# Architecture Decision Records — Plugga/Waze OS

Este diretório guarda os ADRs (Architecture Decision Records) do Plugga/Waze OS.
Um ADR registra **uma** decisão arquitetural: o contexto, a decisão tomada, as
consequências e as alternativas consideradas. ADRs são curtos, imutáveis depois
de aceitos e superados por um novo ADR quando a decisão muda (nunca editados para
"reescrever a história").

## Escopo destes ADRs (Bloco A — Fundação)

Estes ADRs cobrem **apenas a fundação** do produto (monorepo, API, banco local,
observabilidade, contratos e limites). Eles **não** decidem regras de domínio
(CRM, OPM, PluggaMob, Financeiro, Compras) — essas virão em ADRs próprios por
domínio, quando cada domínio entrar em construção.

### Regra crítica de operação (vale para todos os ADRs)

> Nenhuma decisão aqui autoriza acesso, escrita, configuração, disparo ou cutover
> em Bitrix, OMIE, PluggaMob/OCPP, PagBank, WhatsApp, Telegram, OpenClaw, crons ou
> qualquer serviço em produção. Nenhum segredo no repositório. Sem Kafka, sem
> Kubernetes, sem microserviços no MVP. Cutover só por domínio, com aprovação
> explícita (ver ADR-0005).

## Índice

| ADR | Título | Status |
|---|---|---|
| [0001](0001-monorepo-pnpm-turborepo-boundaries.md) | Monorepo pnpm + Turborepo e boundaries | Aceito |
| [0002](0002-next-nest-modular-monolith.md) | Next.js + NestJS como monólito modular | Aceito |
| [0003](0003-postgresql-prisma-minimal-data-model.md) | PostgreSQL + Prisma e modelo de dados mínimo | Aceito |
| [0004](0004-auth-rbac-stub.md) | Auth/RBAC do Bloco A como stub e evolução futura | Aceito |
| [0005](0005-integrations-readonly-mock-write-gate.md) | Integrações read-only/mock → write por gate/cutover | Aceito |
| [0006](0006-whatsapp-p0-no-real-send.md) | WhatsApp P0 como integração formal sem envio real | Aceito |
| [0007](0007-observability-audit-jobs.md) | Observabilidade: auditoria, event log e jobs | Aceito |

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

Estas decisões **não** são resolvidas por estes ADRs; são mantidas atrás de
abstrações para não travar o Bloco A (ver PRD §19):

- Hospedagem do Postgres: Supabase cloud vs self-hosted na VPS (ADR-0003).
- Provedor de identidade: Supabase Auth vs RBAC próprio (ADR-0004).
- Provedor/gateway de WhatsApp: Plugguinha atual vs oficial Meta, e política
  LGPD/opt-out/retenção (ADR-0006).
- Retenção de `agent_actions`, `event_log` e anexos (ADR-0007).
- Quando Compras entra: MVP tardio vs V1.1 (fora da fundação).
