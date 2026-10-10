# Papéis

Cada etapa de uma issue tem um dono. Ao começar uma issue, o **00 Condutor** (`docs/fluxo/02-condutor.md`) monta o **time inteiro** de uma vez, um agente por papel da trilha; depois passa o bastão de um para o outro e confere o portão antes de seguir. Terminada a issue, o time é arquivado e a próxima ganha um time novo. O número é a posição no fluxo.

| Papel | Trilha SDD | Trilha Bug | Trilha Manutenção | Modelo (`.traycer/agent-selection-guide.md`) |
|---|---|---|---|---|
| 00 Condutor | conduz | conduz | conduz | Terra Medium · Sonnet 5.5 |
| [01 Especificador](01-especificador.md) | `speckit-specify` | `speckit-bug-assess` | — | Luna Max · Haiku 4.5 |
| [02 Esclarecedor](02-esclarecedor.md) | `speckit-clarify` | — | — | Luna Max · Haiku 4.5 |
| [03 Arquiteto](03-arquiteto.md) | `speckit-plan` | — | — | Sol Max · Opus 5 |
| [04 Planejador](04-planejador.md) | `speckit-tasks` + sub-issues | — | — | Luna Max · Haiku 4.5 |
| [05 Analista](05-analista.md) | `speckit-analyze` | — | — | Luna Max · Haiku 4.5 |
| [06 Implementador](06-implementador.md) | `speckit-implement`, um bastão por fase | `speckit-bug-fix` | implementa a issue | Luna Max · Haiku 4.5 |
| [07 Convergência](07-convergencia.md) | `speckit-converge` | `speckit-bug-test` | — | Luna Max · Haiku 4.5 |
| [08 Revisor](08-revisor.md) | revisão independente | revisão independente | revisão independente | o modelo que **não** implementou |
| [09 Verificador](09-verificador.md) | base atualizada, verificação, PR, ambiente de teste | igual | igual | Luna Max · Haiku 4.5 |

## Regras comuns a todos os papéis

- Um agente faz **um papel, numa issue**. Ele nasce com o time, responde `<NN> pronto` e espera o bastão; entre um bastão e outro fica ocioso; é arquivado com o time quando a issue termina.
- Só trabalhe quando receber um bastão do Condutor, e só no que o bastão pede.
- Nome do agente: só o papel (ex.: `03 Arquiteto`). A issue em que você trabalha vem na mensagem de criação.
- Antes de tudo: ler `.specify/memory/constitution.md` e o arquivo do próprio papel. Do código, só o que a tarefa exige.
- Nunca: fazer o trabalho de outro papel; inventar requisito; esperar resposta no chat; mexer fora da worktree; remover ou desativar testes; fazer merge; dar push em `develop` ou `main`.
- Commits: `<tipo>(<domínio>): <resumo no imperativo> (<ID>)`. **Todo papel commita o que produziu** antes de responder; papéis de documento (01 a 05, 07) usam `docs(<domínio>): spec NNN <etapa> (<ID>)` (bug: `docs(<domínio>): diagnóstico do bug (<ID>)`). O Condutor confere `git status --porcelain` vazio.
- Skills do Spec Kit: `/speckit-<cmd>` no Claude Code, `$speckit-<cmd>` no Codex. Siga à risca.
- **Resposta final, sempre neste formato:**
  ```
  STATUS: ok | bloqueado
  ARQUIVOS: <criados ou alterados>
  PERGUNTAS: <se houver, cada uma com resposta recomendada e motivo>
  OBSERVAÇÕES: <até 3 linhas>
  ```
