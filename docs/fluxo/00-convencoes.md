# Convenções do fluxo (normativo)

> Regras que todos os agentes seguem. Explicações e exemplos: `docs/guias/`.
> Em caso de conflito, este arquivo vence.

## 1. Papéis

| Papel | Fala com | Nunca |
|---|---|---|
| André | Todos | — |
| Agente do Linear / skill `registrar-linear` | André; o 04 Planejador usa a skill para as sub-issues | Escreve código |
| **00 Condutor** (`02-condutor.md`) | André e os papéis 01 a 09 | Escreve código, spec, plano ou revisão; mescla fora das regras do modo automático; mescla na `main` |
| **01 a 09** (`papeis/`) | Só o Condutor | Faz mais de um papel; toca em outra issue; faz merge |
| Sessão visual (`03-visual.md`) | André | Muda lógica, API, banco ou permissão |

**Uma issue por vez, um time por issue.** Ao começar a issue, o Condutor cria os agentes de todos os papéis da trilha; eles recebem o bastão em sequência e são arquivados juntos quando a issue termina. O Condutor só começa a próxima quando a atual está mesclada ou marcada `Aguardando André`.

**Modos do Condutor:** `manual` (o André testa e mescla cada issue) · `preparar` (papéis antes do 06 num lote; perguntas juntas) · `automático` (fila inteira; o Condutor mescla na `develop` quando o 08 aprovou, a verificação passou e a issue não é `[SECURITY]`, `[HOTFIX]`, nem tem `Breaking Change` ou `DB Migration`).

**Modelo de cada papel:** definido em `.traycer/agent-selection-guide.md` (instalado pelo 04 a partir de `docs/fluxo/modelos/agent-selection-guide.md`). Quem cria um agente usa o modelo daquela tabela; o 08 Revisor nunca usa o modelo que implementou.

| Ambiente | Porta | Banco |
|---|---|---|
| Develop (pasta principal) | 3000 · `develop.localhost` | banco local da develop |
| Teste do Condutor (worktree da issue) | 3001 · `teste.localhost` | `<banco>_teste`, cópia da develop |
| Sessão visual (worktree própria) | 3002 · `visual.localhost` | banco da develop, sem migration |

A develop nunca é derrubada. Os nomes `*.localhost` separam os cookies de cada ambiente no navegador.

## 2. Linear: estrutura

| Nível | Regra |
|---|---|
| Time | 1 cliente/sistema = 1 repositório. Nome `<Cliente> <Sistema>`, identificador de 2 a 4 letras (`BRU`) |
| Projeto | Capacidade do produto. Nome `[<IDENTIFICADOR>] <capacidade>` (`[BRU] Gestão de clientes`): identificador do time entre colchetes (como o `[TIPO]` das issues), espaço, substantivo; sem número de ordem. Nunca um tema transversal (segurança, qualidade, performance): esse trabalho vai como spec no projeto da capacidade que ele toca |
| Status do projeto | `Planned` ao criar · `In Progress` o projeto ativo · `Completed` com o critério de pronto atendido em produção (GA) |
| Milestones | Sempre `Alpha`, `Beta`, `GA`, com critério de saída na descrição. Milestone já atingido antes do fluxo (sistema existente) é removido, e o projeto registra na descrição `Alpha/Beta atingidos antes do fluxo` com a evidência. Milestone sem issues nunca é o milestone ativo |
| Issue pai | Uma spec do Spec Kit. Todo `[FEAT]`, `[REFACTOR]`, `[PERF]`, `[SECURITY]` e `[INFRA]` |
| Sub-issue | Uma por fase do `tasks.md`; criada pelo 04 Planejador |
| Issue avulsa | `[FIX]`, `[HOTFIX]`, `[CHORE]`, `[DOCS]` e as issues da sessão visual (qualquer estimativa até L) |
| Dependências | Projetos: fim → início. Issues: *blocked by*. Issue bloqueada não entra na fila |

## 3. Status

| Status | Categoria | Quem move | Significado |
|---|---|---|---|
| Backlog | Backlog | Agente do Linear / planejar-etapas | Registrada, não preparada |
| Ready | Unstarted | André (sub-issue: 04 Planejador, ao criá-la; issue `Preparada`: Condutor, ao fim do modo preparar) | Issue pai/avulsa: na fila do Condutor. Sub-issue: pronta para a sua fase (não entra na fila) |
| In Progress | Started | Condutor (issue da sessão visual: o agente da sessão) | Papéis trabalhando (inclui esperar o André e os ajustes pedidos em Verifying) |
| In Review | Started | Condutor (issue da sessão visual: o agente da sessão) | 08 Revisor e 09 Verificador. Sub-issue: fase concluída e verificada |
| Verifying | Started | Condutor | André valida em `teste.localhost:3001` (modo manual, ou exceção do modo automático) |
| Done | Completed | Automação do GitHub / Condutor | Mesclada na develop (hotfix: na main) |
| Canceled | Canceled | André (ou planejar-etapas, modo D, com aprovação) | Abandonada ou substituída |

Automações do time: PR aberto → nenhuma ação · merge em `develop` → Done · merge de `hotfix/*` em `main` → Done · sub-issues fecham com a issue pai.

## 4. Prefixos, tipos e trilhas

| Prefixo | Label `Type` | Branch | Commit | Trilha |
|---|---|---|---|---|
| `[FEAT]` | Feature | `feat/` | `feat(<domínio>)` | SDD |
| `[FIX]` | Bug | `fix/` | `fix(<domínio>)` | Bug |
| `[HOTFIX]` | Hotfix | `hotfix/` | `fix(<domínio>)` | Bug, base `main` |
| `[REFACTOR]` | Refactor | `refactor/` | `refactor(<domínio>)` | SDD |
| `[PERF]` | Performance | `perf/` | `perf(<domínio>)` | SDD |
| `[SECURITY]` | Security | `security/` | `fix(security)` / `feat(security)` | SDD + aprovação do plano |
| `[INFRA]` | Infra | `infra/` | `ci(...)` / `build(...)` | SDD |
| `[CHORE]` | Chore | `chore/` | `chore(...)` | Manutenção |
| `[DOCS]` | Docs | `docs/` | `docs(...)` | Manutenção |

| Trilha | Papéis, na ordem |
|---|---|
| **SDD** | 01 Especificador · 02 Esclarecedor · 03 Arquiteto · 04 Planejador · 05 Analista · 06 Implementador (um bastão por fase) · 07 Convergência · 08 Revisor · 09 Verificador |
| **Bug** | 01 Especificador (`bug-assess`) · 06 Implementador (`bug-fix`) · 07 Convergência (`bug-test`) · 08 Revisor · 09 Verificador |
| **Manutenção** | 06 Implementador · 08 Revisor · 09 Verificador. Mudou comportamento do produto → vira SDD |
| **Visual** | Sessão com o André (`03-visual.md`), sem spec; issue com a flag `Visual`, fora da fila do Condutor |

Toda mudança de código do produto passa pela trilha SDD inteira, qualquer que seja o tamanho. A estimativa não escolhe trilha; `XL` não executa (quebrar com `planejar-etapas`).
Aprovação do `plan.md` pelo André antes de implementar: `[SECURITY]` ou flag `Breaking Change`.

## 5. Títulos

| Item | Formato |
|---|---|
| Issue pai | `[TIPO] Spec NNN — <capacidade entregue>` |
| Sub-issue de fase | `[TIPO] Spec NNN Setup` · `Fundação` · `Polimento` · `Convergência` (tarefas acrescentadas pelo converge fora das fases) |
| Sub-issue de US | `[TIPO] Spec NNN USn <comportamento afirmativo e verificável>` |
| Avulsa | `[TIPO] <resultado esperado>` |
| Bug / hotfix | `[FIX]`/`[HOTFIX] <sintoma observado>` |

- Português; até ~80 caracteres; sem ID; sem nome do cliente; sem ponto final.
- `NNN`: número sequencial do time, 3 dígitos, igual à pasta `specs/NNN-<slug>/`. Quem cria a issue pai reserva o próximo número (maior `Spec NNN` do time + 1).
- Intervalo de tasks **não** vai no título; vai na primeira linha da descrição da sub-issue: `Tasks: T034–T049 · Spec: specs/NNN-<slug>/`.

## 6. Campos e labels

| Campo | Valores |
|---|---|
| `Type` (grupo exclusivo, workspace) | Feature · Bug · Hotfix · Refactor · Performance · Security · Infra · Chore · Docs |
| Estimate (nativo, T-shirt) | XS · S · M · L · XL |
| Priority (nativo) | Urgent · High · Medium · Low |
| `Severity` (grupo exclusivo, workspace; só bugs) | S1 · S2 · S3 · S4 |
| Domínio (labels do time) | Definidas por projeto (ex.: Autenticação, Clientes, Funil) |
| Flags (workspace) | Breaking Change · DB Migration · Needs Design · Blocked: Client · Preparada (papéis antes do 06 prontos, pode rodar no automático) · Plano aprovado (André aprovou o `plan.md` de `[SECURITY]`/`Breaking Change`) · Aguardando André · Visual |

## 7. Git

| Item | Formato |
|---|---|
| Branch | `<tipo>/<id-minúsculo>-<slug>` |
| Commit | `<tipo>(<domínio>): <resumo no imperativo>`; nas fases da spec, citar a sub-issue: `(<ID>)` |
| PR | Título `<tipo>(<domínio>): <título da issue sem o prefixo [TIPO] e sem "Spec NNN —", iniciando em minúscula> (<ID>)`; corpo com `Fixes <ID>`; base `develop` (hotfix: `main`) |
| Merge | Squash na develop. Merge commit em: release develop → main e back-merge do hotfix main → develop |
| Release | 1) branch `release/vX.Y.Z` da develop só com o `CHANGELOG.md` (Keep a Changelog), PR para a develop; 2) PR `release: vX.Y.Z` de `develop` para `main` (merge commit); 3) tag `vX.Y.Z`. SemVer; em `0.x` (antes do primeiro GA) mudança incompatível sobe MINOR |
| Hotfix | Após o merge na main: back-merge `main → develop` |
| Exceções de branch sem ID | `chore/speckit-setup` (preparação), `chore/fluxo-vX.Y.Z` (atualização do fluxo), `docs/roadmap-<data>` (planejar-etapas), `release/vX.Y.Z` (release) |
| Proibido | Commit direto em `main`/`develop`; `rebase` e `push --force` em branches compartilhadas; merge por agente, exceto o Condutor no modo automático, só na `develop` |

`<domínio>` = label de domínio da issue, minúscula e sem acento.

## 8. Arquivos

| Caminho | Conteúdo | Versionado |
|---|---|---|
| `docs/guias/` | Documentação explicativa | sim |
| `docs/fluxo/` | Prompts, convenções, skills, guidance do Linear; `VERSION` e `CHANGELOG.md`. Cópia do repositório central: nunca editar no projeto | sim |
| `AGENTS.md` | Regras e comandos para qualquer agente. Bloco `projeto` (escrito pela preparação, editável) e bloco `dev-workflow` (gerenciado pelo `04-atualizar-fluxo`, nunca editar no projeto). Sem descrição do código; menos de 120 linhas | sim |
| `CLAUDE.md` | Importa o `AGENTS.md` (`@AGENTS.md`) para o Claude Code | sim |
| `.traycer/agent-selection-guide.md` | Modelo de cada papel, lido pelo Traycer ao criar agentes. Gerenciado pelo `04-atualizar-fluxo` | sim |
| `.claude/skills/`, `.agents/skills/` | Skills do Spec Kit e do fluxo (`planejar-etapas`, `registrar-linear`), instaladas pelo `04-atualizar-fluxo` | sim |
| `docs/roadmap/ROADMAP.md`, `decisoes.md` | Plano e decisões | sim |
| `.specify/memory/` | Constituição, `projeto.md` (verificação, linha de base, ambiente local, Linear), `preparacao.md` | sim |
| `docs/fluxo/papeis/` | Um arquivo por papel (01 a 09) | sim |
| `.pipeline/` | `condutor.md`, `<ID>.md`, revisões, auditorias, relatórios | não (`.git/info/exclude`) |
