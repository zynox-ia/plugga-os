# Convenções do fluxo (normativo)

> Regras que todos os agentes seguem. Explicações e exemplos: `docs/guias/`.
> Em caso de conflito, este arquivo vence.

## 1. Papéis e vagas

| Papel | Fala com | Nunca |
|---|---|---|
| André | Todos | — |
| Agente do Linear | André | Escreve código |
| Skill `registrar-linear` | André (no Traycer) e Diretor (sub-issues) | Escreve código |
| Coordenador | André e Diretores | Fala com agentes de fase; escreve código; faz merge |
| Diretor 01/02/03 | Coordenador, André e o próprio time | Toca em outra issue; faz merge |
| Agente de fase | Só o Diretor | Faz mais de uma fase |
| Revisor independente | Só o Diretor | Corrige o que revisa |

Máximo de **3 issues em andamento** (uma por Diretor).

| Diretor | Porta | Banco isolado |
|---|---|---|
| 01 | 3001 | `<repo>-d01` |
| 02 | 3002 | `<repo>-d02` |
| 03 | 3003 | `<repo>-d03` |

A develop roda na porta do `projeto.md` (padrão 3000) e nunca é derrubada por um Diretor.

## 2. Linear: estrutura

| Nível | Regra |
|---|---|
| Time | 1 cliente/sistema = 1 repositório. Nome `<Cliente> <Sistema>`, identificador de 3 letras |
| Projeto | Capacidade do produto; substantivo, sem número de ordem, sem nome do cliente |
| Milestones | Sempre `Alpha`, `Beta`, `GA`, com critério de saída na descrição |
| Issue pai | Uma spec do Spec Kit. Obrigatória para estimativa M/L (exceto `[FIX]`/`[HOTFIX]`) e para todo `[SECURITY]` |
| Sub-issue | Uma por fase do `tasks.md`; criada pelo Diretor após a fase de tasks |
| Issue avulsa | `[FIX]` e `[HOTFIX]` (qualquer estimativa até L), ou estimativa XS/S de qualquer outro tipo, exceto `[SECURITY]` |
| Dependências | Projetos: fim → início. Issues: *blocked by*. Issue bloqueada não é despachada |

## 3. Status

| Status | Categoria | Quem move | Significado |
|---|---|---|---|
| Backlog | Backlog | Agente do Linear / planejar-etapas | Registrada, não preparada |
| Ready | Unstarted | André (sub-issue: Diretor, ao criá-la) | Issue pai/avulsa: na fila do Coordenador. Sub-issue: pronta para a sua fase (não entra na fila) |
| In Progress | Started | Diretor | Time trabalhando (inclui esperar o André e os ajustes pedidos em Verifying) |
| In Review | Started | Diretor | PR aberto; revisão independente. Sub-issue: fase concluída e verificada |
| Verifying | Started | Diretor | André valida em `localhost:300N` |
| Done | Completed | Automação do GitHub / Coordenador | Mesclada na develop (hotfix: na main) |
| Canceled | Canceled | André (ou planejar-etapas, modo D, com aprovação) | Abandonada ou substituída |

Automações do time: PR aberto → nenhuma ação · merge em `develop` → Done · merge de `hotfix/*` em `main` → Done · sub-issues fecham com a issue pai.

## 4. Prefixos, tipos e trilhas

| Prefixo | Label `Type` | Branch | Commit | Trilha |
|---|---|---|---|---|
| `[FEAT]` | Feature | `feat/` | `feat(<domínio>)` | Pela estimativa |
| `[FIX]` | Bug | `fix/` | `fix(<domínio>)` | Bug |
| `[HOTFIX]` | Hotfix | `hotfix/` | `fix(<domínio>)` | Bug, base `main` |
| `[REFACTOR]` | Refactor | `refactor/` | `refactor(<domínio>)` | Pela estimativa |
| `[PERF]` | Performance | `perf/` | `perf(<domínio>)` | Pela estimativa |
| `[SECURITY]` | Security | `security/` | `fix(security)` / `feat(security)` | SDD + aprovação do plano |
| `[INFRA]` | Infra | `infra/` | `ci(...)` / `build(...)` | Pela estimativa |
| `[CHORE]` | Chore | `chore/` | `chore(...)` | Pela estimativa |
| `[DOCS]` | Docs | `docs/` | `docs(...)` | Pela estimativa |

| Estimate | Trilha |
|---|---|
| XS, S | Rápida (avulsa), exceto `[SECURITY]`, que é sempre spec |
| M, L | SDD (spec) |
| XL | Não executa: quebrar com planejar-etapas |

`[FIX]` e `[HOTFIX]` sempre na trilha Bug, qualquer estimativa (XL: quebrar).
Aprovação do `plan.md` pelo André antes de implementar: `[SECURITY]` ou flag `Breaking Change`.
Escalada: trilha rápida que passar dos limites de S (arquivo novo de domínio, migration, dependência nova, mais de ~3 arquivos) para e pede reclassificação para M. Nunca rebaixar.

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
| Flags (workspace) | Breaking Change · DB Migration · Needs Design · Blocked: Client |

## 7. Git

| Item | Formato |
|---|---|
| Branch | `<tipo>/<id-minúsculo>-<slug>` |
| Commit | `<tipo>(<domínio>): <resumo no imperativo>`; nas fases da spec, citar a sub-issue: `(<ID>)` |
| PR | Título `<tipo>(<domínio>): <título da issue sem o prefixo [TIPO] e sem "Spec NNN —", iniciando em minúscula> (<ID>)`; corpo com `Fixes <ID>`; base `develop` (hotfix: `main`) |
| Merge | Squash na develop. Release: merge commit develop → main |
| Release | 1) branch `release/vX.Y.Z` da develop só com o `CHANGELOG.md` (Keep a Changelog), PR para a develop; 2) PR `release: vX.Y.Z` de `develop` para `main` (merge commit); 3) tag `vX.Y.Z`. SemVer; em `0.x` (antes do primeiro GA) mudança incompatível sobe MINOR |
| Hotfix | Após o merge na main: back-merge `main → develop` |
| Exceções de branch sem ID | `chore/speckit-setup` (preparação), `chore/fluxo-vX.Y.Z` (atualização do fluxo), `docs/roadmap-<data>` (planejar-etapas), `release/vX.Y.Z` (release) |
| Proibido | Commit direto em `main`/`develop`; `rebase` e `push --force` em branches compartilhadas; merge por agente |

`<domínio>` = label de domínio da issue, minúscula e sem acento.

## 8. Arquivos

| Caminho | Conteúdo | Versionado |
|---|---|---|
| `docs/guias/` | Documentação explicativa | sim |
| `docs/fluxo/` | Prompts, convenções, skills, guidance do Linear; `VERSION` e `CHANGELOG.md`. Cópia do repositório central: nunca editar no projeto | sim |
| `AGENTS.md` | Regras e comandos para qualquer agente. Bloco `projeto` (escrito pela preparação, editável) e bloco `dev-workflow` (gerenciado pelo `04-atualizar-fluxo`, nunca editar no projeto). Sem descrição do código; menos de 120 linhas | sim |
| `CLAUDE.md` | Importa o `AGENTS.md` (`@AGENTS.md`) para o Claude Code | sim |
| `.claude/skills/`, `.agents/skills/` | Skills do Spec Kit e do fluxo (`planejar-etapas`, `registrar-linear`), instaladas pelo `04-atualizar-fluxo` | sim |
| `docs/roadmap/ROADMAP.md`, `decisoes.md` | Plano e decisões | sim |
| `.specify/memory/` | Constituição, `projeto.md` (verificação, linha de base, ambiente local, Linear), `preparacao.md` | sim |
| `.pipeline/` | `coordenacao.md`, `<ID>.md`, revisões, auditorias | não (`.git/info/exclude`) |
