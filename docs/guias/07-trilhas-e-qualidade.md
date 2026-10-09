# 07 · Trilhas e qualidade

## 1. O GitHub Spec Kit em uma página

O Spec Kit é um processo de *spec-driven development*: primeiro se define **o quê e por quê**, depois **como**, depois as tarefas, e só então o código. Cada etapa é uma skill que o agente executa.

| Comando | O que faz | Artefato |
|---|---|---|
| `speckit-constitution` | Princípios do projeto (uma vez por projeto) | `.specify/memory/constitution.md` |
| `speckit-specify` | Especificação: requisitos e user stories | `specs/NNN-nome/spec.md` |
| `speckit-clarify` | Até 5 perguntas sobre pontos ambíguos; respostas entram na spec | `spec.md` atualizado |
| `speckit-plan` | Plano técnico: stack, arquitetura, modelo de dados | `plan.md` (+ `data-model.md`, `quickstart.md`…) |
| `speckit-tasks` | Lista de tarefas em fases: Setup, Foundational, uma por user story, Polish | `tasks.md` |
| `speckit-analyze` | Confere a coerência entre spec, plano e tarefas (somente leitura) | Relatório |
| `speckit-implement` | Executa as tarefas, fase por fase | Código e testes |
| `speckit-converge` | Confere o código contra os artefatos; acrescenta tarefas se faltar algo | `tasks.md` atualizado |
| `speckit-bug-assess` / `-fix` / `-test` | Trilha de bugs: diagnóstico, correção, verificação | `.specify/bugs/<slug>/` |

Invocação: no Claude Code `/speckit-<comando>`; no Codex `$speckit-<comando>`. Os dois ficam instalados em todo projeto.

## 2. As três trilhas

O Diretor escolhe a trilha pelo tipo e pela estimativa da issue.

| Trilha | Quando | Fases |
|---|---|---|
| **SDD** | Issue pai (spec): estimativa M/L ou qualquer `[SECURITY]` | specify → clarify → plan → tasks → *cria sub-issues* → analyze → implement (por sub-issue) → converge → revisão |
| **Rápida** | Avulsa com estimativa XS/S (exceto bugs e `[SECURITY]`) | implementar → verificar → revisão |
| **Bug** | `[FIX]` e `[HOTFIX]` | bug-assess → bug-fix → bug-test → revisão |

**Estimativa XL** não é executada: volta para ser quebrada.

**Escalada:** se uma issue da trilha rápida passa do tamanho previsto durante a implementação (arquivo novo de domínio, migration, dependência nova, mais de ~3 arquivos), o Diretor para e pede a reclassificação para M, que vira spec. A trilha nunca é rebaixada.

**Aprovação do plano:** issues `[SECURITY]` ou com a flag `Breaking Change` param depois do `plan.md` e só seguem com o seu ok.

## 3. Sub-issues na trilha SDD

Depois do `tasks.md`, o Diretor cria uma sub-issue por fase, no padrão do guia 03:

```
BRU-12  [FEAT] Spec 003 — Cadastro e listagem de clientes
├── BRU-13  [FEAT] Spec 003 Setup
├── BRU-14  [FEAT] Spec 003 Fundação
├── BRU-15  [FEAT] Spec 003 US1 Cliente é cadastrado com nome e telefone
├── BRU-16  [FEAT] Spec 003 US2 Lista de clientes pode ser filtrada por etapa
└── BRU-17  [FEAT] Spec 003 Polimento
```

Cada sub-issue é implementada por um agente novo e passa por um portão. Quando passa, vai para In Review. Quando a spec inteira é mesclada, as sub-issues fecham junto com a issue pai.

## 4. Portões

Um portão é uma verificação **objetiva, feita pelo Diretor com comandos**, sem confiar no relato do agente. Exemplos:

| Fase | Portão |
|---|---|
| Specify | `spec.md` existe na pasta com o número da spec |
| Clarify | Nenhum `NEEDS CLARIFICATION` restante |
| Plan | `plan.md` com as seções "Não deve mudar" e "Arquivos previstos" |
| Tasks | `tasks.md` com tarefas pendentes; sub-issues criadas |
| Analyze | Nenhum achado CRITICAL |
| Implement (cada sub-issue) | Nenhuma tarefa da fase pendente; lint, typecheck e testes passando (exceto falhas pré-existentes); commit feito |
| Converge | Resultado "Converged" (no máximo 3 ciclos) |
| Bug test | Veredito `verified` |

Portão que falha: a fase é refeita uma vez, com um agente novo. Falhou de novo: o Diretor te pergunta.

## 5. Revisão independente

Todo trabalho, em qualquer trilha, passa por um **revisor que não participou da implementação**, sempre com o outro modelo da tabela de modelos (seção 6): se a implementação foi com Luna Max, a revisão é com Haiku 4.5, e vice-versa. Ele:
- compara o diff com os critérios de aceite, a spec, a seção "Não deve mudar" e a constituição;
- dá PASSA ou FALHA por critério, com evidência (arquivo e linha, ou teste);
- aponta testes removidos ou desativados, escopo além do pedido e complexidade sem justificativa;
- **não corrige nada**.

Reprovado: volta para implementação e passa por nova revisão. Duas reprovações: o Diretor te pergunta.

## 6. Proteções contra os problemas mais comuns

| Problema conhecido em agentes | Proteção no fluxo |
|---|---|
| Pular etapas | Um agente por fase; portões por comando |
| Contexto longo que degrada a qualidade | Agentes novos por fase; Coordenador reiniciado por sessão |
| Aprovar o próprio trabalho | Revisor independente, com o outro modelo |
| Apagar ou desativar testes para "passar" | Brief proíbe; revisor procura especificamente isso |
| Fazer mais do que o pedido | "Arquivos previstos" no plano; revisor aponta escopo extra |
| Culpar a issue por falhas antigas | Linha de base de testes registrada na preparação |
| Inventar requisitos | Dúvidas viram perguntas para você, com recomendação |

## 6. Modelos por papel

Cada papel usa um modelo fixo, definido em `.traycer/agent-selection-guide.md`. O Traycer lê esse arquivo antes de criar qualquer agente filho, e o Coordenador e o Diretor o seguem ao criar seu time.

| Papel | Opção 1 | Opção 2 (só se a 1 estiver indisponível) |
|---|---|---|
| Coordenador | Você escolhe ao abrir a sessão | — |
| Diretores e auxiliares do Coordenador | Terra Medium | Sonnet 5.5 |
| Agente da fase plan | Sol Max | Opus 5 |
| Demais agentes de fase | Luna Max | Haiku 4.5 |
| Revisor independente | O modelo que **não** implementou | — |

O plan usa um modelo mais forte porque um plano ruim contamina tasks, implementação e revisão. Nenhum agente é criado com modelo fora da tabela, ou de outro papel, sem pedido seu. Para mudar a tabela, mude `docs/fluxo/modelos/agent-selection-guide.md` no repositório central e publique uma versão; o 04 instala nos projetos.

