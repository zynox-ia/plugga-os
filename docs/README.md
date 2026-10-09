# Documentação do fluxo de desenvolvimento

Esta pasta fica na raiz de cada repositório de cliente (`docs/`). Ela tem duas partes:

| Pasta | Para quem | O que tem |
|---|---|---|
| [`guias/`](guias/) | Pessoas (você, colaboradores, clientes técnicos) | Os padrões explicados, com o porquê e exemplos |
| [`fluxo/`](fluxo/) | Agentes (Coordenador, Diretores, agente do Linear) | Prompts operacionais, convenções normativas e skills |

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
| 07 | [Trilhas e qualidade](guias/07-trilhas-e-qualidade.md) | Spec Kit, trilhas SDD/rápida/bug, portões, revisão independente |
| 08 | [Glossário](guias/08-glossario.md) | Os termos usados em todo o resto |
| 09 | [Manutenção do fluxo](guias/09-manutencao-do-fluxo.md) | Repositório central, versões, como atualizar os projetos, onde vive cada skill |

## Fluxo (operacional)

| Arquivo | Uso |
|---|---|
| [`fluxo/00-convencoes.md`](fluxo/00-convencoes.md) | Regras normativas que todos os agentes seguem |
| [`fluxo/01-preparacao-da-casa.md`](fluxo/01-preparacao-da-casa.md) | Uma vez por projeto: Spec Kit, constituição, ambiente local, Linear |
| [`fluxo/02-diretor.md`](fluxo/02-diretor.md) | Enviado pelo Coordenador a cada Diretor |
| [`fluxo/03-coordenador.md`](fluxo/03-coordenador.md) | Início de cada sessão de trabalho |
| [`fluxo/04-atualizar-fluxo.md`](fluxo/04-atualizar-fluxo.md) | Instalar ou atualizar o fluxo a partir do repositório central |
| [`fluxo/modelos/AGENTS.md`](fluxo/modelos/AGENTS.md) | Modelo do `AGENTS.md` da raiz dos projetos (regras e comandos para qualquer agente) |
| [`fluxo/skills/registrar-linear/`](fluxo/skills/registrar-linear/) | Registrar demandas no padrão pelo Traycer; sub-issues das specs |
| [`fluxo/skills/planejar-etapas/`](fluxo/skills/planejar-etapas/) | Planejar e auditar projetos, specs e a ordem do trabalho |
| [`fluxo/linear/`](fluxo/linear/) | Guidance, templates e skills (`/nova-issue`) para o agente do Linear |

## Começo rápido

**Projeto novo**
1. Instalar o fluxo com o `04-atualizar-fluxo.md` do repositório central ([guia 09](guias/09-manutencao-do-fluxo.md)).
2. Configurar o time no Linear ([guia 02, seção 7](guias/02-linear.md#7-configuração-de-um-time-novo)).
3. Rodar `docs/fluxo/01-preparacao-da-casa.md` num agente novo → mesclar o PR na develop.
4. Rodar a skill `planejar-etapas` (modo Planejar ou Assumir) → aprovar o roadmap.
5. Mover para **Ready** o que deve ser feito primeiro.
6. Rodar `docs/fluxo/03-coordenador.md` e trabalhar.

**Toda sessão de trabalho**
```
Siga as instruções do arquivo docs/fluxo/03-coordenador.md.
```
