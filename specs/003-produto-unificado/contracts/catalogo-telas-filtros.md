# Contrato: catálogo de telas e filtros

Arquivo versionado `packages/shared/src/catalogo-telas.ts`, uma linha por tela de negócio. O teste percorre `apps/web/app/**/page.tsx` e falha se uma tela fora da lista `ISENTAS` (login, auth, privacidade, termos, design-system, jobs, integracoes, estrutura, configuracoes) não constar aqui, ou se o catálogo estiver vazio.

| Rota | Área | Filtro de empresa | Padrão (duas empresas) | Fonte | Estado |
|---|---|---|---|---|---|
| `/` (dashboard) | Visão geral | sim | Todas | agregação | parcial (exemplo) |
| `/pendencias` | Visão geral | sim | Todas | mock | exemplo |
| `/clientes`, `/clientes/[id]` | Comercial e Clientes | cadastro: não; negócios da ficha: sim | Todas | clientes + negócios | pronto |
| `/comercial/oportunidades` (+id) | Comercial e Clientes | sim | Todas | API | pronto |
| `/comercial/contratos` (+id) | Comercial e Clientes | sim | Todas | API | pronto |
| `/crm` | Comercial e Clientes | sim | Todas | placeholder | em breve |
| `/compras`, `/compras/novo`, `/compras/[id]`, `/compras/scorecard` | Compras | sim | Todas (novo exige escolher) | API | pronto |
| `/energia-opm/ciclos`, `auditorias`, `migracoes`, `relatorios`, `eficiencia` (+id) | Energia | sim | Todas | API | pronto |
| `/pluggamob` | Eletromobilidade | sim | Todas | placeholder | em breve |
| `/financeiro` | Financeiro | sim | Todas | placeholder | em breve |
| `/engenharia` | Engenharia e Obras | sim | Todas | placeholder | em breve |
| `/configuracoes` (Equipe) | Equipe e acessos | não | n/a | acesso | pronto |

## Componente `FiltroEmpresa`

- Opções "Todas", "Plugga" e "Waze" limitadas ao escopo; não renderiza se a pessoa alcança uma empresa só (FR-006).
- Valor em `?empresa=`; trocar o valor só afeta a própria tela.
- `role="group"`, `aria-pressed`, texto em português.
- Valor fora do escopo: volta ao padrão, sem erro.

## Contrato com a API

Listas, contagens, indicadores, exportações e impressões aceitam `companyId` opcional (`plugga`|`waze`). O servidor usa `empresasPermitidas ∩ companyId`; interseção vazia devolve lista vazia. Nunca amplia.
