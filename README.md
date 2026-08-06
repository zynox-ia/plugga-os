# Plugga OS

Sistema operacional interno da **Plugga / Waze Energia** (CRM, PluggaMob, OPM, financeiro operacional, integrações e API para agentes).

## Status

Planejamento e PRD em andamento. **Nenhuma alteração na operação atual** (OpenClaw / Bitrix / crons) até cutover explícito por domínio.

## Documentos principais

| Doc | Descrição |
|---|---|
| [`docs/PRD-plugga-waze-os.md`](docs/PRD-plugga-waze-os.md) | PRD completo (v1.1) |
| [`docs/mapa-produto-mvp.md`](docs/mapa-produto-mvp.md) | Mapa de telas resumido |
| [`docs/mockup/index.html`](docs/mockup/index.html) | Mockup visual (marca Plugga) |

## Regra crítica

Não desativar jobs, crons, integrações ou serviços em produção a partir deste repositório sem aprovação de go-live por domínio.

## Stack prevista (MVP)

- Frontend: Next.js  
- Backend: NestJS (alt. FastAPI)  
- DB: PostgreSQL / Supabase  
- Jobs: BullMQ + Redis  

Detalhes no PRD.
