# Roadmap — Plugga OS (Plugga / Waze Energia)

- **Destino:** sistema interno único para Plugga e Waze, organizado por função, com dados de negócio associados à empresa responsável; substituir controles operacionais dispersos por etapas e com cutover externo explícito.
- **Primeiro horizonte aprovado:** MVP operacional com produto unificado, integrações governadas, reativação e operação PluggaMob, fechamentos e OPM.
- **Time no Linear:** [Plugga OS](https://linear.app/zynox-dev/team/PLU) (`PLU`).
- **Versão em produção:** não confirmada nesta revisão; o repositório não tem tag `vX.Y.Z` local.
- **Última revisão:** 2026-10-09, com aprovação do André para o horizonte MVP e divisão da Spec 003 em 003–005.

## Perfis e fluxo principal

- **Operação PluggaMob:** consultar usuários/sessões e trabalhar uma fila de reativação com histórico e opt-out.
- **Financeiro PluggaMob:** reconciliar divergências e submeter fechamento à aprovação humana.
- **OPM:** acompanhar ciclos, documentos, auditoria, relatório e aprovação.
- **Gestores:** conceder acessos, ver pendências e indicadores dentro do alcance de cada empresa.
- **Fluxo principal do primeiro horizonte:** dado externo lido com origem e modo explícitos → registro operacional no sistema → ação humana registrada → aprovação auditada → acompanhamento por empresa.

O [PRD](../PRD-plugga-os.md) permanece rascunho sem assinatura. Este roadmap usa o MVP aprovado pelo André em 2026-10-09, as decisões aceitas da [ADR-0013](../adr/0013-empresa-como-atributo-modulos-compartilhados.md) e evidência do checkout. Nenhum envio, escrita ou cutover externo decorre da aprovação do roadmap.

## Decisões pendentes

- [ ] Confirmar quais capacidades já têm aceite em produção para reconhecer Alpha/Beta atingidos antes do fluxo ou projeto `Completed`.
- [ ] Reconciliar os sete milestones legados e as issues da Fundação com Alpha/Beta/GA, sem perder histórico; aprovar tabela de renomeações antes de aplicá-la.
- [ ] Definir o tratamento das fatias ainda XL de [PLU-1](https://linear.app/zynox-dev/issue/PLU-1/infra-spec-002-fundacao-solida-do-plugga-os-seguranca-arquitetura-e) pelo modo D antes de qualquer despacho novo.
- [ ] Configurar e confirmar a escala nativa T-shirt no time PLU. O Linear apresentou `5 Points`, não `L`; as issues PLU-264–266 estão sem estimativa nativa até essa configuração.
- [ ] Concluir a revisão técnica da ADR-0013 e adaptar `specs/003-produto-unificado/spec.md` à divisão 003–005 antes de mover uma dessas issues para `Ready`.
- [ ] Confirmar fonte, permissão de leitura, responsáveis por aprovação e regras de fechamento de PluggaMob/OPM antes das próximas specs.

## Projetos na ordem de dependência

### 1. [Etapa 1 · Fundação](https://linear.app/zynox-dev/project/etapa-1-fundacao-414aa82b1869) — projeto existente; nome proposto: `[PLU] Fundação`

**Estado:** há trabalho em andamento, embora o status do projeto no Linear ainda seja `Backlog`. Renomeação, status e mapeamento dos milestones aguardam aprovação específica. **Depende de:** —.

**Objetivo:** estabelecer segurança, dados, deploy, backup, escopo por empresa e operação confiável para as capacidades do sistema.

**Critério de pronto:**

- [ ] Checkpoints reais da migração para SeaweedFS e retirada do MinIO comprovados.
- [ ] Escopo por empresa aplicado e testado sem ampliar o acesso atual.
- [ ] Backup externo restaurável, publicação reversível e gates de qualidade comprovados.
- [ ] Aceite em produção registrado pelo André.

**Fora de escopo:** novas capacidades de negócio, unificação da navegação e cutover externo implícito.

| Estrutura atual no Linear | Estado observado em 2026-10-09 | Próximo tratamento |
|---|---|---|
| Fase 1 — Repositório e ensaio local | 4/5 issues `Done`; PLU-262 aberto | Confirmar checkpoint A e mapear para Alpha/Beta |
| Fase 2 — VPS | 4/5 `Done`; PLU-260 aberto | Confirmar checkpoint B e evidência de produção |
| Fase 3 — Fechamento | 1/2 `Done`; PLU-238 aberto | Concluir ou corrigir registro da retirada do MinIO |
| Spec 002 — Fatias 1–4 | [PLU-1](https://linear.app/zynox-dev/issue/PLU-1/infra-spec-002-fundacao-solida-do-plugga-os-seguranca-arquitetura-e) em andamento, com 20 sub-issues diretas | Reconciliar o que foi entregue; quebrar o restante XL pelo modo D |

O projeto possui sete milestones anteriores ao fluxo atual. Não foram renomeados nem encerrados. `specs/001-migracao-storage-seaweedfs/` e `specs/002-fundacao-solida/` são fontes existentes; não criar cópias de suas issues.

### 2. [[PLU] Produto unificado](https://linear.app/zynox-dev/project/plu-produto-unificado-e64435a421c5) — Planned

**Depende de:** `[PLU] Fundação`, especialmente a história de escopo por empresa [PLU-133](https://linear.app/zynox-dev/issue/PLU-133/infra-spec-002-us4-cada-registro-tem-empresa-e-o-acesso-respeita-o). Criar a dependência entre projetos manualmente no Linear, em *Dependencies → Blocked by*.

**Objetivo:** um módulo por função, filtro de empresa em cada tela e cadastros compartilhados sem mistura de dados de negócio.

**Critério de pronto:** menu único, filtros limitados ao alcance, cadastros únicos com histórico preservado, concessão de acesso auditada e indicadores coerentes, validados em produção.

**Fora de escopo:** novas integrações, cutover externo e redesign amplo.

| Milestone | Critério de saída | Spec | Estimativa planejada |
|---|---|---|---|
| Alpha | Navegar por função e filtrar por empresa sem ampliar acesso | [PLU-264 · Spec 003 — Navegação única e filtros por empresa](https://linear.app/zynox-dev/issue/PLU-264/feat-spec-003-navegacao-unica-e-filtros-por-empresa) | L |
| Beta | Cliente e fornecedor únicos servem negócios das duas empresas com histórico íntegro | [PLU-265 · Spec 004 — Cadastros únicos de clientes e fornecedores](https://linear.app/zynox-dev/issue/PLU-265/feat-spec-004-cadastros-unicos-de-clientes-e-fornecedores) | L |
| GA | Equipe concede acesso corretamente; indicadores conferem com listas e exemplos são identificados | [PLU-266 · Spec 005 — Equipe e indicadores do produto unificado](https://linear.app/zynox-dev/issue/PLU-266/feat-spec-005-equipe-e-indicadores-do-produto-unificado) | M |

As três issues estão em `Backlog`; PLU-264 é bloqueada por PLU-133, PLU-265 por PLU-264, e PLU-266 por PLU-264 e PLU-265. Nenhuma sub-issue foi criada.

### 3. [[PLU] Integrações operacionais](https://linear.app/zynox-dev/project/plu-integracoes-operacionais-47d73a0230d4) — Planned

**Depende de:** `[PLU] Fundação`. Criar a relação entre projetos manualmente no Linear.

**Objetivo:** leitura externa governada, saúde das integrações e jobs observáveis, preservando sistemas externos como fonte oficial até decisão de cutover por domínio.

**Critério de pronto:** modo/saúde/última execução visíveis, repetição segura e recuperação documentada, validação em produção.

**Fora de escopo:** write externo presumido, envio WhatsApp real sem política e substituição integral de Bitrix/OMIE/PagBank.

| Milestone | Critério de saída | Specs |
|---|---|---|
| Alpha | Inventário e saúde reais em tela | A detalhar após reconciliar Bitrix/Jobs já implementados |
| Beta | Leitura confiável do primeiro domínio do MVP | A detalhar após validação da fonte e permissão |
| GA | Operação/recuperação verificadas | A detalhar; sem write implícito |

Os milestones estão planejados e ainda vazios; nenhum deles é o milestone ativo.

### 4. [[PLU] Eletromobilidade](https://linear.app/zynox-dev/project/plu-eletromobilidade-092569f7d0cd) — Planned

**Depende de:** `[PLU] Produto unificado` e `[PLU] Integrações operacionais`. Criar as relações entre projetos manualmente no Linear.

**Objetivo:** operar reativação, sessões e fechamentos PluggaMob com dados reais e aprovação humana.

**Critério de pronto:** fila real com histórico e opt-out, sessões/locais consultáveis, divergências bloqueando aprovação e atos auditados em produção.

**Fora de escopo:** OCPP próprio, cobranças ou envios automáticos e cutover não aprovado.

| Milestone | Critério de saída | Specs |
|---|---|---|
| Alpha | Fila de reativação real trabalhada de ponta a ponta | A detalhar após validar regras e fonte de dados |
| Beta | Sessões e locais consultáveis com atualização visível | A detalhar |
| GA | Fechamento e repasse com divergências e aprovação auditada | A detalhar com Financeiro |

Os milestones estão planejados e ainda vazios; nenhum deles é o milestone ativo.

## Capacidades existentes a reconciliar

- **Clientes e comercial:** cadastro, oportunidades e contratos têm API e telas. Confirmar uso/aceite em produção antes de criar projeto separado ou classificar milestone como atingido antes do fluxo.
- **Energia e OPM:** ciclos, auditorias e migrações têm API e telas; relatórios ainda recorrem a dados de exemplo. OPM integra o primeiro horizonte, mas as specs novas dependem do aceite do fluxo e dos responsáveis.
- **Compras:** o processo nativo segue `docs/processos/compras-suprimentos.md`, cuja fonte é o POP, não o PRD rascunho. Confirmar uso em produção antes de criar projeto ou trabalho duplicado.
- **Financeiro operacional e Engenharia/Obras:** horizonte posterior ao MVP; confirmar escopo antes de estruturar specs.

## Fora do escopo do primeiro horizonte

- Substituição completa de Bitrix, OMIE, PagBank ou OpenClaw.
- Portal de cliente/parceiro, OCPP próprio, BI avançado, Engenharia/Obras completa e financeiro geral.
- Envio externo ou cutover sem aprovação específica, backup/restauração e plano de reversão.
