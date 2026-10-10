# Documentação do fluxo de desenvolvimento

Esta pasta fica na raiz de cada repositório de cliente (`docs/`). Ela tem duas partes:

| Pasta | Para quem | O que tem |
|---|---|---|
| [`guias/`](guias/) | Pessoas (você, colaboradores, clientes técnicos) | Os padrões explicados, com o porquê e exemplos |
| [`fluxo/`](fluxo/) | Agentes (Condutor, papéis 01 a 09, agente do Linear) | Prompts operacionais, convenções normativas e skills |

Os guias explicam; o arquivo [`fluxo/00-convencoes.md`](fluxo/00-convencoes.md) é a regra. Se algum guia e as convenções divergirem, as convenções valem.

## Guias

| # | Guia | Responde |
|---|---|---|
| 01 | [Visão geral](guias/01-visao-geral.md) | Como o trabalho funciona de ponta a ponta, quem faz o quê |
| 02 | [Linear](guias/02-linear.md) | Estrutura de times, projetos, milestones, specs e sub-issues; status; campos e labels |
| 03 | [Nomenclatura](guias/03-nomenclatura.md) | Como nomear projetos, issues, sub-issues, branches, commits, PRs e releases |
| 04 | [Git, branches e releases](guias/04-git-branches-e-releases.md) | main, develop, worktrees, merge, hotfix, versões |
| 05 | [Ordem de construção](guias/05-ordem-de-construcao.md) | O que construir primeiro, como fatiar e como decidir a ordem |
| 06 | [Ambiente local e testes](guias/06-ambiente-local-e-testes.md) | Portas, bancos isolados, dados de teste, como validar uma issue |
| 07 | [Trilhas e qualidade](guias/07-trilhas-e-qualidade.md) | Spec Kit, trilhas SDD/Bug/Manutenção/Visual, portões, modos do Condutor, modelos |
| 08 | [Glossário](guias/08-glossario.md) | Os termos usados em todo o resto |
| 09 | [Manutenção do fluxo](guias/09-manutencao-do-fluxo.md) | Repositório central, versões, como atualizar os projetos, onde vive cada skill |

## Fluxo (operacional)

| Arquivo | Uso |
|---|---|
| [`fluxo/00-convencoes.md`](fluxo/00-convencoes.md) | Regras normativas que todos os agentes seguem |
| [`fluxo/01-preparacao-da-casa.md`](fluxo/01-preparacao-da-casa.md) | Uma vez por projeto: Spec Kit, constituição, ambiente local, Linear |
| [`fluxo/02-condutor.md`](fluxo/02-condutor.md) | Conduz as issues, uma por vez: modos manual, preparar e automático |
| [`fluxo/03-visual.md`](fluxo/03-visual.md) | Sessão visual conversada, sem spec |
| [`fluxo/papeis/`](fluxo/papeis/) | Os papéis 01 a 09, um arquivo cada |
| [`fluxo/04-atualizar-fluxo.md`](fluxo/04-atualizar-fluxo.md) | Prompt mestre: instala ou atualiza o fluxo, prepara a casa e planeja (ou audita) |
| [`fluxo/modelos/AGENTS.md`](fluxo/modelos/AGENTS.md) | Modelo do `AGENTS.md` da raiz dos projetos (regras e comandos para qualquer agente) |
| [`fluxo/modelos/agent-selection-guide.md`](fluxo/modelos/agent-selection-guide.md) | Modelo de IA de cada papel, instalado em `.traycer/` |
| [`fluxo/skills/registrar-linear/`](fluxo/skills/registrar-linear/) | Registrar demandas no padrão pelo Traycer; sub-issues das specs |
| [`fluxo/skills/planejar-etapas/`](fluxo/skills/planejar-etapas/) | Planejar e auditar projetos, specs e a ordem do trabalho |
| [`fluxo/linear/`](fluxo/linear/) | Guidance, templates e skills (`/nova-issue`) para o agente do Linear |

## Começo rápido

**Projeto novo, existente ou atualização** — um prompt só:
```
Leia https://raw.githubusercontent.com/zynox-ia/dev-workflow/main/docs/fluxo/04-atualizar-fluxo.md e siga as instruções neste repositório.
```
O **prompt mestre** lê o repositório, mostra um diagnóstico e faz só o que falta:

| Etapa | Não existe | Existe |
|---|---|---|
| Fluxo | Instala | Atualiza se houver versão nova (com as migrações) |
| Casa (Spec Kit, constituição, comandos, ambiente, Linear) | Prepara do zero | Refaz só as fases que falham |
| Planejamento | Planeja o roadmap | Audita: onde estamos e o que vem |

Fluxo e casa saem num PR único; o roadmap, em outro. Ele para só no plano de ação, nas suas respostas e nos merges. O mesmo prompt serve para projeto novo, projeto existente e atualização. Antes, configure o time no Linear ([guia 02, seção 7](guias/02-linear.md#7-configuração-de-um-time-novo)).

**Trabalhar** (num agente novo, com Terra Medium):
```
Siga docs/fluxo/02-condutor.md. Modo: manual
```
Troque `manual` por `preparar` (lote de 01 a 05, perguntas juntas) ou `automático` (fila inteira, com relatório no fim).

**Ajuste visual** (num agente novo):
```
Siga docs/fluxo/03-visual.md. Assunto: <o que vamos ajustar>
```
