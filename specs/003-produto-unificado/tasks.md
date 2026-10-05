---

description: "Lista de tarefas da spec 003: Produto unificado"
---

# Tarefas: Produto unificado

**Input**: `specs/003-produto-unificado/` (spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md)

**Pré-requisitos**: spec e plano aprovados; spec 002 entrega a história 4 (T139 a T155, Fatia 3) antes das tarefas marcadas **[DEP-002]**; revisão técnica do ADR-0013 (002 T007).

**Testes**: incluídos (constituição V; SC-001 a SC-012).

**Organização**: por história de usuário, executadas na ordem das 5 fatias do plano (A a E).

## Formato: `- [ ] Txxx [P?] [USn?] Descrição com caminho`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência incompleta).
- **[USn]**: história da spec. Setup, Fundação e Acabamento não têm rótulo.
- **`[DEP-002 Txxx]`**: só começa depois da tarefa Txxx da spec 002 mergeada na base.
- **`[DONO]`**: ação ou decisão que só o dono pode tomar.
- **`[VPS]`**: altera produção. Exige aprovação explícita do dono, backup restaurado antes e rollback escrito (constituição VI). Migração e script de dados rodam **na VPS**, no padrão de `ops/deploy.sh`, nunca da máquina de desenvolvimento.

Caminhos: `apps/web/app/`, `apps/web/e2e/`, `apps/api/src/`, `apps/api/prisma/`, `packages/shared/src/`, `ops/`, `scripts/`, `docs/`. Cada tarefa que altera schema cria `rollback.sql` ao lado da migração.

---

## Phase 1: Setup e decisões

- [ ] T301 [DONO] Responder as perguntas de `research.md`: área de Pluggamob/`produto-tecnologia`, quem além do dono resolve a fila de decisão, e se a chave do menu usa `feature_flags` (proposta) ou variável de ambiente
- [ ] T302 [P] Criar `scripts/` e `apps/api/src/cadastros-unicos/` vazios com `.gitkeep` só onde necessário; adicionar ao `package.json` raiz os scripts `test:catalogo-telas` e `test:contagens-cadastros` (stubs que falham com mensagem clara até existirem)
- [ ] T303 Registrar em `docs/adr/0013-empresa-como-atributo-modulos-compartilhados.md` a nota de que a 003 entrega menu por área, filtro por tela e cadastros únicos (referência à pasta da spec, sem repetir a decisão)

---

## Phase 2: Fundação (Fatia A, sem depender da 002)

**⚠️ CRÍTICO**: bloqueia US1 a US7.

- [ ] T304 [P] Criar `packages/shared/src/areas.ts` com `areas` e o mapa área → departamentos → itens de [contracts/areas-e-menu.md](contracts/areas-e-menu.md), mais a verificação de carga (todo `DepartmentId` em exatamente uma área); exportar em `index.ts`
- [ ] T305 [P] Teste `packages/shared/src/areas.spec.ts`: cobertura total dos departamentos, nenhuma área repetida, falha com mapa vazio
- [ ] T306 [P] Criar `packages/shared/src/catalogo-telas.ts` com o catálogo de [contracts/catalogo-telas-filtros.md](contracts/catalogo-telas-filtros.md) e a lista `ISENTAS`
- [ ] T307 Criar `scripts/verifica-catalogo-telas.mjs` (`pnpm test:catalogo-telas`): percorre `apps/web/app/**/page.tsx`; falha se tela fora de `ISENTAS` não estiver no catálogo, se o catálogo estiver vazio ou se uma tela de negócio marcada com filtro não importar `FiltroEmpresa`; ligar ao `pnpm lint` do web e à CI
- [ ] T308 [P] Criar `packages/shared/src/empresa-filtro.ts`: `parseFiltroEmpresa(valor, empresasPermitidas)` devolvendo `{ filtro, efetivas }` (valor inválido ou fora do escopo volta ao padrão), e `padraoFiltro(empresas)`; testes em `empresa-filtro.spec.ts`
- [ ] T309 [P] Criar `apps/web/app/components/filtro-empresa.tsx` conforme o contrato (oculto com uma empresa, `aria-pressed`, escreve só `?empresa=`) e `apps/web/test/filtro-empresa.test.ts`
- [ ] T310 [P] Criar `apps/web/app/components/etiqueta-empresa.tsx` (texto "Plugga"/"Waze" + forma distinta, `aria-label`, sem depender só de cor) e teste de acessibilidade em `apps/web/test/etiqueta-empresa.test.ts`
- [ ] T311 Migração aditiva `feature_flags` (tabela, semente `menu_unificado=false`) com `rollback.sql` em `apps/api/prisma/migrations/<data>_unificado_feature_flags/`; módulo `apps/api/src/config/feature-flags.*` com `GET /config/flags` (autenticado) e `PUT /config/flags/:key` (admin, evento auditado via `AuditAppender`); testes em `apps/api/test/feature-flags.e2e.spec.ts`
- [ ] T312 Ler a chave no web: `apps/web/app/lib/feature-flags.ts` com cache de 30 s e falha segura (erro de leitura = menu antigo); teste em `apps/web/test/feature-flags.test.ts`

**Checkpoint**: áreas, catálogo, filtro, etiqueta e chave existem e estão testados; nenhuma tela mudou.

---

## Phase 3: US1 Um menu único, por função (P1) 🎯 MVP (Fatia B)

**Teste independente**: perfis só Plugga, só Waze, as duas e admin veem o mesmo desenho; cada tela antiga continua alcançável.

- [ ] T313 [US1] Criar `apps/web/app/lib/menu-areas.ts`: monta os grupos do menu a partir de `areas` e do acesso da sessão (`visibleDepartments`, sem regra própria de permissão); itens `em-breve` desabilitados e marcados
- [ ] T314 [US1] Teste `apps/web/test/menu-areas.test.ts`: cada função uma vez para os 4 perfis; só Waze em Financeiro vê "Financeiro" e nada fora de suas áreas; pessoa com áreas diferentes por empresa vê a união
- [ ] T315 [US1] Ligar o menu novo em `apps/web/app/components/app-shell.tsx`: com `menu_unificado` ligada usa `menu-areas` (sem seletor); desligada, mantém `navGroupsForEmpresa` e o seletor atual. Atenção: esta é a única tarefa que edita `app-shell.tsx` até a T328 **A chave só é ligada em produção depois de 002 T145 e T150** (ordem combinada: segurança primeiro)
- [ ] T316 [P] [US1] Criar `packages/shared/src/rotas-antigas.ts` (mapa rota antiga → nova, válido por 90 dias a partir da ativação, quando a regra é removida) e aplicar em `apps/web/next.config.ts` (`redirects()`); preservar `?empresa=`
- [ ] T318 [US1] E2E `apps/web/e2e/menu-unico.spec.ts`: perfis, links antigos redirecionam, nenhuma tela que hoje funciona fica inacessível (lista derivada do catálogo), "em breve" não leva a tela vazia
- [ ] T319 [US1] Adaptar `apps/web/e2e/shell-navigation.spec.ts`, `energia-opm.spec.ts` e `golden-path.spec.ts` ao menu novo e sem seletor; um único teste curto (T320) cobre o modo com a chave desligada
- [ ] T320 [US1] Teste da volta ao desenho anterior em `apps/web/e2e/chave-menu.spec.ts`: alternar a chave e conferir o menu antigo sem nova publicação; leitura falhando = menu antigo (FR-028, SC-011)

**Checkpoint**: menu único funciona atrás da chave; tudo continua alcançável. Pode ser entregue antes da Fatia 3 da 002.

---

## Phase 4: US2 Sem seletor global: filtro por tela (P1) (Fatia C)

**Teste independente**: usuário das duas empresas sem seletor no topo e com filtro em cada tela de negócio; usuário de uma empresa não vê o filtro.

- [ ] T321 [DEP-002 T140] [US2] Auxiliar de API `apps/api/src/core/auth/filtro-empresa.ts`: `empresasEfetivas(principal, companyId?)` = escopo ∩ filtro, vazio se a interseção for vazia; testes em `filtro-empresa.spec.ts` (inclui valor manipulado)
- [ ] T322 [DEP-002 T148] [US2] Aceitar `companyId` opcional e aplicar `empresasEfetivas` em listas, contagens e exportações de Comercial (`apps/api/src/commercial/`) e Clientes (negócios da ficha); testes por rota
- [ ] T323 [DEP-002 T148] [P] [US2] Idem para Energia e Eficiência energética (`apps/api/src/energy/`, `energy-efficiency/`)
- [ ] T324 [DEP-002 T149] [P] [US2] Compras: trocar o uso direto de `companyId` pelo auxiliar compartilhado e aceitar "todas" nas listas, totais e scorecard (`apps/api/src/compras/`)
- [ ] T325 [DEP-002 T148] [P] [US2] Pluggamob: filtro de empresa onde houver listagem; placeholder segue como "em breve"
- [ ] T326 [US2] Web: ler `?empresa=` no servidor com `parseFiltroEmpresa` e repassar `companyId` nos clientes de dados (`apps/web/app/lib/api.ts`, `compras-client.ts`, proxies `apps/web/app/api/*`)
- [ ] T327 [US2] Inserir `FiltroEmpresa` e aplicar o filtro às listas, contagens, exportações e impressões de oportunidades, contratos, compras (+scorecard), ciclos, auditorias, migrações, relatórios e eficiência; uma tarefa por grupo de telas dentro do mesmo PR pequeno de cada grupo (comercial, compras, energia)
- [ ] T328 [US2] Remover o seletor global: apagar `empresa-switcher.tsx`, o `comEmpresa()` e a leitura de `?empresa` no shell em `app-shell.tsx`, tirar a lógica de `dashboard-view.tsx:453` (o visual não depende mais da empresa); assim que T327 estiver em uso (decisão do dono: o seletor sai de vez)
- [ ] T329 [US2] Testes: e2e `apps/web/e2e/filtro-empresa.spec.ts` (sem seletor no topo, padrão "Todas", filtro de uma tela não altera outra, link copiado reproduz a visão, uma empresa só não vê o filtro, valor forçado resulta em vazio); teste por tela de que lista, contagem e exportação coincidem; `pnpm test:catalogo-telas` verde
- [ ] T330 [US2] Atualizar `docs/AGENT.md` com a regra "filtro por tela, nunca global" e o catálogo de telas

**Checkpoint**: nenhum seletor global; cada tela de negócio tem filtro conforme o catálogo.

---

## Phase 5: US3 Cada registro mostra de que empresa é (P1) (Fatia C)

**Teste independente**: criar um registro de cada tipo com o filtro em Todas, Plugga e Waze.

- [ ] T331 [DEP-002 T145] [US3] Expor `companyId` nos DTOs de oportunidade, contrato, ciclo, auditoria, estudo, fechamento, pedido e obra em `packages/shared/src/` e nos mapeadores da API
- [ ] T332 [P] [US3] Mostrar `EtiquetaEmpresa` em listas e fichas desses registros e nos CSV/impressões (coluna "Empresa")
- [ ] T333 [US3] Regra de criação (FR-011) em `apps/web/app/lib/empresa-criacao.ts`: filtro único = pré-preenchida; "Todas" com duas empresas = exige escolha antes de salvar; uma empresa só = automática; aplicar nos formulários de criação dos módulos
- [ ] T334 [DEP-002 T150] [US3] API: rejeitar criação sem empresa e empresa fora do escopo; alteração de empresa só para admin das duas, com evento `registro.empresa.alterada` (via `AuditAppender`); testes em `apps/api/test/empresa-registro.e2e.spec.ts`
- [ ] T335 [US3] E2E `apps/web/e2e/empresa-registro.spec.ts` (3 cenários de criação, etiqueta com texto, tentativa de troca por quem não é admin das duas)

---

## Phase 6: US4 Um cliente, um cadastro (P2) (Fatia D)

**Teste independente**: um cliente com negócios nas duas empresas; fila de duplicidades de teste.

- [ ] T336 [P] [US4] Criar `packages/shared/src/cadastros.ts` (`normalizarDocumento`, `normalizarEmail`, tipos da fila e da união) e `cadastros.spec.ts` (com e sem pontuação, tamanhos inválidos, entrada vazia)
- [ ] T337 [US4] Migração expandir (`clients.documento_normalizado`, `email_normalizado`, `merged_into_id`; tabelas `cadastro_decisao` e `cadastro_uniao`) com `rollback.sql`, **sem** índices únicos ainda, em `apps/api/prisma/migrations/<data>_unificado_cadastros_expandir/`; incluir no `test:migrations:from-zero` e no teste de rollback da 002 (T146) quando existir
- [ ] T338 [US4] Script idempotente `apps/api/prisma/scripts/backfill-cadastros.ts` (preenche normalizados em lotes, abre itens da fila por documento, e-mail e nome parecido, nunca une) e `ops/confere-contagens-cadastros.sh` (`pnpm test:contagens-cadastros`: contagens por cadastro antes/depois; falha em entrada vazia)
- [ ] T339 [US4] Módulo `apps/api/src/cadastros-unicos/` (service, repositório `prisma-cadastros.repository.ts`, controller): fila, unir, manter separados e desfazer conforme [contracts/cadastros-unicos.md](contracts/cadastros-unicos.md); união numa transação e eventos sem PII; testes em `cadastros-unicos.service.spec.ts` (preserva todos os vínculos, auditada, desfaz até 30 dias, recusa depois); um teste lê o `schema.prisma` e falha se existir FK para `clients` ou `fornecedores` que a união não trate
- [ ] T340 [DEP-002 T148] [US4] Criação e edição de cliente: `CONFLITO_UNICIDADE` com `existenteId` por documento ou e-mail; reaproveitar `GET /clientes/duplicates`; visibilidade do cadastro por papel comercial em qualquer empresa e dos negócios por `CompanyScope`; testes em `apps/api/src/clientes/`
- [ ] T341 [US4] Web: tela da fila de decisão (`apps/web/app/clientes/duplicidades/page.tsx`) com comparação lado a lado, confirmar união, manter separados e desfazer; aviso "já existe, usar este cadastro" no formulário de cliente; e2e `apps/web/e2e/clientes-unicos.spec.ts`
- [ ] T342 [US4] Ficha do cliente (`apps/web/app/clientes/[id]/page.tsx`): cadastro visível a quem tem papel comercial; negócios, propostas, contratos, faturas e estudos só da empresa do registro e com `FiltroEmpresa`; teste com usuário só Waze
- [ ] T343 [DONO] [US4] Designar quem resolve a fila e decidir cada item pendente; registrar em `specs/003-produto-unificado/decisoes-cadastros.md`
- [ ] T344 [VPS] [DEP-002 T145] [US4] Rodar a migração e o backfill na VPS depois do backup restaurado e da aprovação do dono; conferir contagens (T338) antes e depois
- [ ] T345 [US4] Migração contrair: índices únicos parciais de documento e e-mail em `clients` (`NOT VALID` e `VALIDATE`) com `rollback.sql`; só depois de T343 e T344

---

## Phase 7: US5 Um fornecedor, um cadastro, e lançamento com empresa (P2) (Fatia D)

**Teste independente**: um fornecedor usado em pedidos das duas empresas; numeração por empresa.

- [ ] T346 [US5] Migração expandir de `fornecedores` (`documento_normalizado`, `merged_into_id`) com `rollback.sql`; estender o backfill (T338) e a fila (T339) a fornecedores
- [ ] T347 [US5] Compras: criação de fornecedor sem `company_id` obrigatório e com checagem por documento normalizado; pedido, cotação e lançamento mantêm a empresa; testes em `apps/api/src/compras/` (dois pedidos de empresas diferentes no mesmo fornecedor, numeração sem lacuna nem repetição por empresa)
- [ ] T348 [US5] Tipo e regra compartilhados "lançamento exige empresa" em `packages/shared/src/` (schema zod `empresa` obrigatório) com teste; o módulo Financeiro ainda não existe, a regra vale quando for construído (ver `analise.md`)
- [ ] T349 [P] [US5] Relatórios e totais de compras por empresa ou consolidados (cobertura de T324); teste de soma por empresa = consolidado
- [ ] T350 [VPS] [US5] Rodar migração e backfill de fornecedores na VPS (mesmas condições de T344)
- [ ] T351 [US5] Migração contrair: unicidade por `documento_normalizado` em `fornecedores`, e retirar `(company_id, documento)` da unicidade, depois da fila e da conferência de contagens; `rollback.sql`

---

## Phase 8: US6 Equipe e acessos em linguagem simples (P2) (Fatia E)

**Teste independente**: gestor concede, altera e revoga pela tela nova; alcance de todos igual antes e depois.

- [ ] T352 [US6] Reorganizar `apps/web/app/configuracoes/equipe-view.tsx` por área e empresas usando `areas` (tradução área → departamentos na gravação; o modelo de acesso não muda), com resumo em português do que a pessoa poderá fazer (depende da confirmação T365)
- [ ] T353 [DEP-002 T151] [US6] Limitar o que o gestor oferece às áreas e empresas que ele administra (usa o escopo do concedente) e mostrar acesso planejado e estado do convite
- [ ] T354 [DEP-002 T152] [US6] Teste de alcance antes/depois: reutilizar o script e o teste da 002 comparando o alcance de todas as pessoas existentes com a tela nova; falha em entrada vazia
- [ ] T355 [US6] E2E `apps/web/e2e/equipe-areas.spec.ts` (conceder, alterar, revogar, convite pendente) e adaptar `equipe.spec.ts`; confirmar evento de auditoria com autor, data e mudança
- [ ] T365 [DONO] [US6] Confirmar que o acesso continua gravado por (pessoa, empresa, departamento) e que "área" é só apresentação na tela de Equipe (decisão da 002 ainda não confirmada por você)

---

## Phase 9: US7 Dashboard por empresa e consolidado (P3) (Fatia E)

**Teste independente**: totais do dashboard batem com a soma das listas.

- [ ] T357 [US7] Web: `FiltroEmpresa` próprio em `dashboard-view.tsx` e em `/pendencias`, escopo respeitado, e selo visível "dados de exemplo" nos blocos sem dado real; sem endpoint novo
- [ ] T358 [US7] Marcar telas sem dados reais como `parcial` ou `em-breve` em `areas.ts` e no catálogo (FR-026, SC-010) e teste que falha se uma tela `pronto` usar mock

---

## Phase 10: Acabamento e verificação final

- [ ] T360 [P] Rodar o contrato de entrega (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`) e as suítes novas; registrar o resultado em `quickstart.md`
- [ ] T361 [P] Atualizar `docs/AGENT.md` e `README` de módulos com menu por área, filtro por tela, cadastros únicos e a chave do menu
- [ ] T362 [DONO] Aprovar a ativação da chave `menu_unificado` em produção e acompanhar duas semanas (SC-012); registrar o resultado
- [ ] T363 Rodar `/speckit-converge` e anexar o que faltar ao fim deste arquivo

---

## Dependências e ordem

- **Fase 1 e 2** não dependem da 002. **Fase 3 (US1)** depende só da Fundação e pode ser entregue antes da Fatia 3 da 002.
- **Fases 4 e 5** dependem de 002 T140, T145, T148, T149, T150.
- **US4/US5** (Fases 6 e 7): o esquema e a API podem avançar cedo; as tarefas `[VPS]` esperam T145 da 002, backup restaurado (002 T012) e aprovação.
- **US6** depende de 002 T151 e T152; **US7** não depende de endpoint novo.
- T328 (remover o seletor) assim que T327 estiver em uso; a chave do menu só é ligada em produção depois de 002 T145 e T150.
- Paralelismo: T304 a T310 entre si; T322 a T325 entre si; T336 com T304 a T310.

## Resumo

- Total: 61 tarefas (T301 a T365; T317, T356, T359 e T364 removidas no realinhamento de 2026-10-05).
- Marcadores: `[DONO]` 4 (T301, T343, T362, T365), `[VPS]` 2 (T344, T350), `[DEP-002]` 11.
- MVP: Fundação + US1 (menu atrás da chave).
