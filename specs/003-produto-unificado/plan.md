# Plano de implementação: Produto unificado

**Branch**: `claude/spec-003-produto-unificado-swvxm1` | **Data**: 2026-10-05 | **Spec**: [spec.md](spec.md)

**Input**: `specs/003-produto-unificado/spec.md` (rascunho realinhado em 2026-10-05; aguarda aprovação). Referência de modelo: ADR-0013. Depende de `specs/002-fundacao-solida` (história 4).

## Resumo

Reorganizar o produto em cima do escopo de empresa que a spec 002 entrega: um menu por área funcional, filtro de empresa em cada tela no lugar do seletor global, etiqueta de empresa nos registros, cadastros únicos de cliente e fornecedor com fila de decisão manual, tela de Equipe por área (só apresentação) e dashboard com filtro de empresa e aviso de exemplo. Não se refaz segurança: toda restrição por empresa vem do `CompanyScope` da 002.

Achados da leitura do código (mapeamento de 2026-10-05) que moldam o plano:

1. **O seletor global vive só na query `?empresa=`** (`app-shell.tsx`, `empresa-switcher.tsx`); não há cookie nem contexto. Só Compras repassa a empresa à API (`?companyId=`). Reaproveitar `?empresa=` como parâmetro do filtro **por tela** mantém links antigos válidos (o cenário "link que dependia do seletor" vira filtro padrão).
2. **O catálogo web (`organizacao.ts`), `departmentIdsByCompany` (shared) e `e2e/shell-navigation.spec.ts` formam um conjunto acoplado.** O menu novo é um segundo catálogo (áreas) derivado do mesmo acesso, atrás de uma chave liga/desliga; o antigo permanece até o fim da transição.
3. **O acesso continua (pessoa, empresa, departamento/papel).** Área funcional é apresentação: um mapa fixo área → departamentos. Nenhuma tabela de acesso muda (nota do ADR-0013 de 2026-10-05).
4. **`clients` não tem documento nem unicidade**; `fornecedores` é único por `(company_id, documento)`. Unificar exige coluna de documento normalizado, índices únicos parciais e tabela de união reversível. Não há "fila de decisão" no código; a detecção `GET /clientes/duplicates` existe e é reaproveitada.
5. **Não existe módulo Financeiro nem lançamento** (`/financeiro` é placeholder). FR-019 vira regra e tipo compartilhados, prontos para quando o módulo existir; o cenário 3 da história 5 só é testável no contrato (ver `analise.md`).
6. **Dashboard e Pendências são 100% mock.** Nesta spec ganham só filtro de empresa e aviso de exemplo; indicadores reais novos ficam para outra feature.
7. **Não há feature flag em tempo de execução** (só env, que exige reiniciar o contêiner). FR-028 pede ligar/desligar sem publicar: tabela pequena `feature_flags` lida pelo web a cada requisição, alternada por admin.

## Dependência da spec 002 (entre agentes)

A 002 entrega a história 4 na **Fatia 3** (T139 a T155). Esta feature consome:

| Entrega da 002 | Tarefa 002 | Usada em (003) |
|---|---|---|
| `AccessScope`/`escopoDe` em shared | T139 | menu, filtro, Equipe |
| `CompanyScope` na API | T140 | filtros de lista |
| `company_id` nos negócios + backfill + NOT NULL | T141 a T145 | etiquetas, filtro, dashboard |
| `RolesGuard` por empresa | T150 | menu e telas por papel |
| limite de concessão | T151 | Equipe |
| teste de equivalência de alcance | T152 | FR-023 |
| `AuditAppender`, envelope de erro | T013 a T016, T020 | auditorias novas |

**Ordem combinada com o dono:** a segurança (002) vem primeiro; menu e filtros só são ativados depois de T145 e T150 da 002.

Regra de sequenciamento: tarefas marcadas **[DEP-002]** só começam depois da tarefa citada estar mergeada na base. O restante (catálogo de áreas e de telas, componente de filtro, menu atrás da chave, esquema de cadastros únicos) pode andar antes.

## Technical Context

**Language/Version**: TypeScript estrito, Node 22, pnpm + Turborepo

**Primary Dependencies**: Next.js App Router, NestJS, Prisma 6 + PostgreSQL 16, zod (`packages/shared`). Nenhuma dependência nova.

**Storage**: PostgreSQL. Tabelas novas: `feature_flags`, `cadastro_decisao`, `cadastro_uniao`. Colunas aditivas em `clients` e `fornecedores`.

**Testing**: `node --test` e Playwright (web), Vitest e `test:db` (API), `test:migrations:from-zero`. Novos: teste do catálogo de telas, contagens antes/depois da união, e2e do menu e do filtro.

**Target Platform**: web desktop-first (mobile fora de escopo), VPS única atrás do Caddy.

**Project Type**: monorepo web + API.

**Performance Goals**: sem meta nova; o filtro não exige consulta extra além do escopo; uma consulta por indicador do dashboard.

**Constraints**: migrações aditivas e reversíveis, sem indisponibilidade (FR-027); nada escreve em sistema externo (FR-029, constituição I); migrações de dados rodam na VPS só com aprovação, backup restaurado e rollback escrito (constituição VI).

**Scale/Scope**: ~35 rotas de tela, 13 telas de lista, 2 cadastros únicos, poucas dezenas de usuários.

## Constitution Check

| # | Princípio | Avaliação | Como o plano atende |
|---|---|---|---|
| I | Fronteira de produção e integrações | PASSA | Nada toca Bitrix, OMIE, PluggaMob etc. A migração de cadastros é só no banco do OS. |
| II | Limites do monorepo e do monólito | PASSA | Catálogo de telas e mapa de áreas em `packages/shared`; web e API só por HTTP; módulo novo `cadastros-unicos` com interface pública. |
| III | Segredos e dados pessoais | PASSA | Fixtures sintéticas; eventos de auditoria sem PII (via `AuditAppender`); a fila mostra documento e e-mail só a quem pode decidir. |
| IV | Auditoria append-only e tempo | PASSA | União, desfazer, troca de empresa e concessão gravam evento na mesma transação; `timestamptz`. |
| V | Verificação antes da entrega | PASSA | Cada história tem teste que falha antes; o teste do catálogo falha se tela de negócio ficar sem filtro; a conferência de contagens falha em entrada vazia. |
| VI | Operação segura e reversível | PASSA, com condições | Backfill e uniões em produção só `[VPS]`, com aprovação, backup restaurado e `rollback.sql`; união desfazível por 30 dias; menu atrás de chave. |
| VII | Simplicidade | PASSA, com um desvio | Reuso de `?empresa=`, do detector de duplicidade e do catálogo de eventos. Desvio: `feature_flags` (D4). |

Reavaliação pós-desenho: mantém-se PASSA.

## Estratégia de entrega: 5 fatias

```text
A  Fundação do produto (sem depender da 002)
   áreas, catálogo de telas, componente de filtro e de etiqueta, chave do menu
   ▼
B  Menu único + redirecionamentos (US1), atrás da chave
   construído antes, mas SÓ ATIVADO depois de 002 T145 e T150 (segurança primeiro, ordem combinada)
   ▼
C  [DEP-002] Filtro por tela + remoção do seletor + empresa na criação + rótulos (US2, US3)
   ▼
D  Cadastros únicos (US4, US5): esquema aditivo cedo; dados na VPS só depois de T145
   ▼
E  Equipe por área, só apresentação (US6), e dashboard só com filtro e aviso de exemplo (US7)
```

Cada fatia é um conjunto de PRs pequenos e publicável sozinho. A remoção do seletor (fatia C) só entra junto com os filtros nas telas, nunca antes.

## Decisões técnicas (detalhe em [research.md](research.md))

| # | Tema | Recomendação | Alternativa rejeitada |
|---|---|---|---|
| D1 | Estado do filtro | `?empresa=todas\|plugga\|waze` por tela, lido no servidor e repassado à API como `companyId` | cookie ou contexto global (é o seletor de volta) |
| D2 | Restrição real | a API interseta o filtro com `CompanyScope`; valor fora do escopo → vazio | confiar no valor da tela |
| D3 | Menu | `areas.ts` em shared (área → departamentos → rotas), mesma fonte do guard | lógica de permissão própria na web (viola FR-002) |
| D4 | Chave do menu (FR-028), vale só para o menu; o seletor sai de vez quando os filtros estiverem em uso | tabela `feature_flags`, `GET /config/flags`, cache de 30 s, alternância por admin; falha de leitura = menu antigo | env var (exige reiniciar contêiner e mexer em `.env` de produção) |
| D5 | Links antigos | mapa em shared + `redirects()` em `next.config.ts`; 90 dias, depois a regra é removida (sem página nova) | redirecionar no middleware (já faz auth e CSP) |
| D6 | Cliente único | documento e e-mail normalizados com índices únicos parciais; união move vínculos e grava `cadastro_uniao` | apagar o duplicado |
| D7 | Fornecedor único | passo aditivo de normalização; unicidade por documento só depois da fila | trocar a chave primária |
| D8 | Fila de decisão | tabela `cadastro_decisao` e tela para o dono | script manual |
| D9 | Etiqueta de empresa | componente com texto e forma, `aria-label` | só cor |
| D10 | Dashboard | só `FiltroEmpresa` próprio e selo "dados de exemplo"; sem endpoint novo de agregação (fora do pedido do dono) | módulo de API de agregação (rejeitado nesta spec) |

### Complexity Tracking

| Desvio | Por quê | Alternativa simples rejeitada |
|---|---|---|
| Tabela `feature_flags` | FR-028 e SC-011 exigem voltar ao menu antigo em menos de 5 min sem publicação; reiniciar contêiner de produção é ação que a constituição manda perguntar | env var |

## Pontos de contato com a 002 (evitar conflito)

- `packages/shared/src/auth.ts` (002: `AccessScope`): a 003 só lê; áreas ficam em arquivo novo `areas.ts`.
- `apps/web/app/lib/organizacao.ts`: a 002 não deve tocar; a 003 mantém o catálogo e adiciona `areas` ao lado até o fim da transição.
- `apps/api/src/clientes/*` e `compras/*`: a 002 (T148, T149) muda os repositórios; a 003 cria arquivos novos (`cadastros-unicos/`) e só altera controllers depois do merge de T148 e T149.
- `schema.prisma`: migrações ordenadas por data; a 003 usa o sufixo `_unificado_` e confere que `prisma migrate diff` fica limpo após cada merge.
- `apps/web/e2e/shell-navigation.spec.ts`: só a 003 altera.

## Project Structure

```text
specs/003-produto-unificado/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
├── contracts/
│   ├── catalogo-telas-filtros.md
│   ├── areas-e-menu.md
│   └── cadastros-unicos.md
├── checklists/requirements.md
├── tasks.md
└── analise.md                      # resultado de /speckit-analyze
packages/shared/src/{areas.ts, catalogo-telas.ts, cadastros.ts}
apps/web/app/{components/filtro-empresa.tsx, components/etiqueta-empresa.tsx, lib/menu-areas.ts}
apps/api/src/{cadastros-unicos/, config/feature-flags*}
apps/api/prisma/migrations/<data>_unificado_*/
```
