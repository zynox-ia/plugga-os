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

## 2. As trilhas

O Condutor escolhe a trilha pelo prefixo da issue. A estimativa não escolhe trilha: **toda mudança de código do produto passa pelo Spec Kit inteiro, até um botão.** O processo completo custa menos do que uma mudança "rápida" que mexe onde não devia.

| Trilha | Quando | Papéis |
|---|---|---|
| **SDD** | `[FEAT]`, `[REFACTOR]`, `[PERF]`, `[SECURITY]`, `[INFRA]` | 01 Especificador → 02 Esclarecedor → 03 Arquiteto → 04 Planejador → 05 Analista → 06 Implementador (um bastão por fase) → 07 Convergência → 08 Revisor → 09 Verificador |
| **Bug** | `[FIX]`, `[HOTFIX]` | 01 (`bug-assess`) → 06 (`bug-fix`) → 07 (`bug-test`) → 08 → 09 |
| **Manutenção** | `[CHORE]`, `[DOCS]` | 06 → 08 → 09. Se mudar comportamento do produto, vira SDD |
| **Visual** | Ajuste de tela conversado com você | Sessão visual (`03-visual.md`): sem spec, um commit por pedido, revisão rápida, PR |

**Estimativa XL** não é executada: volta para ser quebrada.

**Aprovação do plano:** issues `[SECURITY]` ou com a flag `Breaking Change` param depois do 03 Arquiteto e só seguem com o seu ok.

## 3. Sub-issues na trilha SDD

Depois do `tasks.md`, o 04 Planejador cria uma sub-issue por fase, no padrão do guia 03:

```
BRU-12  [FEAT] Spec 003 — Cadastro e listagem de clientes
├── BRU-13  [FEAT] Spec 003 Setup
├── BRU-14  [FEAT] Spec 003 Fundação
├── BRU-15  [FEAT] Spec 003 US1 Cliente é cadastrado com nome e telefone
├── BRU-16  [FEAT] Spec 003 US2 Lista de clientes pode ser filtrada por etapa
└── BRU-17  [FEAT] Spec 003 Polimento
```

Cada sub-issue é um bastão para o 06 do time e passa por um portão. Quando passa, vai para In Review. Quando a spec inteira é mesclada, as sub-issues fecham junto com a issue pai.

## 4. Portões

Um portão é uma verificação **objetiva, feita pelo Condutor com comandos**, sem confiar no relato do agente. Cada papel descreve o seu em `docs/fluxo/papeis/`.

| Papel | Portão |
|---|---|
| 01 Especificador | `spec.md` na pasta com o número da spec (bug: relatório com a causa) |
| 02 Esclarecedor | Nenhum `NEEDS CLARIFICATION` restante |
| 03 Arquiteto | `plan.md` com "Não deve mudar" e "Arquivos previstos" |
| 04 Planejador | `tasks.md` em fases; uma sub-issue por fase |
| 05 Analista | Nenhum achado CRITICAL |
| 06 Implementador (cada fase) | Nenhuma tarefa da fase pendente; lint, typecheck e testes passando (exceto falhas pré-existentes); commit feito |
| 07 Convergência | "Converged" (no máximo 3 ciclos); bug: veredito `verified` |
| 08 Revisor | `APROVADO`, com evidência por critério de aceite |
| 09 Verificador | Develop incorporada, verificação passando, aplicação respondendo, PR aberto |

Portão que falha: o Condutor substitui o agente daquele papel e refaz uma vez. Falhou de novo: o Condutor te pergunta.

## 5. Modos do Condutor

| Modo | Para onde vai a issue no fim | Quem mescla |
|---|---|---|
| **manual** | Verifying, para você testar | Você |
| **preparar** | Volta para Ready com a label `Preparada` (papéis antes do 06 prontos; plano aprovado quando exigido) | — |
| **automático** | Mesclada na develop | O Condutor, **exceto** `[SECURITY]`, `[HOTFIX]`, `Breaking Change` e `DB Migration`, que param em Verifying com `Aguardando André` |

**Noite produtiva:** de dia, rode o `preparar` num lote e responda as perguntas de uma vez; à noite, o `automático` implementa as issues preparadas. Issue que trava (pergunta nova, portão que falhou duas vezes) ganha a label `Aguardando André` e a fila segue. De manhã, o relatório diz o que entrou, o que espera seu teste e o que espera sua resposta. Não gostou de algo que entrou? Cada issue é um commit na develop: abra o PR de revert (`git revert <commit>`) ou registre um `[FIX]` para o Condutor.

## 6. Revisão independente

Todo trabalho, em qualquer trilha, passa pelo **08 Revisor**, que não participou da implementação, sempre com o outro modelo da tabela de modelos (seção 8): se a implementação foi com Luna Max, a revisão é com Haiku 4.5, e vice-versa. Ele:
- compara o diff com os critérios de aceite, a spec, a seção "Não deve mudar" e a constituição;
- dá PASSA ou FALHA por critério, com evidência (arquivo e linha, ou teste);
- aponta testes removidos ou desativados, escopo além do pedido e complexidade sem justificativa;
- **não corrige nada**.

Reprovado: volta para implementação e passa por nova revisão. Duas reprovações: o Condutor te pergunta.

## 7. Proteções contra os problemas mais comuns

| Problema conhecido em agentes | Proteção no fluxo |
|---|---|
| Pular etapas | Um agente por fase; portões por comando |
| Contexto longo que degrada a qualidade | Um agente por papel, time novo a cada issue; o Condutor passa o turno a cada poucas issues |
| Aprovar o próprio trabalho | Revisor independente, com o outro modelo |
| Apagar ou desativar testes para "passar" | Brief proíbe; revisor procura especificamente isso |
| Fazer mais do que o pedido | "Arquivos previstos" no plano; revisor aponta escopo extra |
| Culpar a issue por falhas antigas | Linha de base de testes registrada na preparação |
| Inventar requisitos | Dúvidas viram perguntas para você, com recomendação |

## 8. Modelos por papel

Cada papel usa um modelo fixo, definido em `.traycer/agent-selection-guide.md`. O Traycer lê esse arquivo antes de criar qualquer agente filho, e o Condutor o segue a cada papel. O primeiro Condutor da sessão é você quem abre: use Terra Medium.

| Papel | Opção 1 | Opção 2 (só se a 1 estiver indisponível) |
|---|---|---|
| 00 Condutor e auxiliares | Terra Medium | Sonnet 5.5 |
| 03 Arquiteto | Sol Max | Opus 5 |
| 01, 02, 04, 05, 06, 07, 09 | Luna Max | Haiku 4.5 |
| 08 Revisor | O modelo que **não** implementou | — |

O 03 Arquiteto usa um modelo mais forte porque um plano ruim contamina tasks, implementação e revisão. Nenhum agente é criado com modelo fora da tabela, ou de outro papel, sem pedido seu. Para mudar a tabela, mude `docs/fluxo/modelos/agent-selection-guide.md` no repositório central e publique uma versão; o 04 instala nos projetos.

