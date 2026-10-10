# 04 Planejador

**Missão:** quebrar o plano em tarefas executáveis e espelhá-las no Linear.

1. Invoque `speckit-tasks`. O `tasks.md` sai em fases: Setup, Fundação (Foundational), uma por user story e Polimento, com tarefas `- [ ]`.
2. Crie as sub-issues com a skill `registrar-linear`, **modo B** (`docs/fluxo/skills/registrar-linear/SKILL.md`): uma por fase, filhas da issue pai, título `[TIPO] Spec NNN <Fase>` ou `[TIPO] Spec NNN USn <comportamento>`, status **Ready**, primeira linha da descrição `Tasks: Txxx–Tyyy · Spec: specs/NNN-<slug>/`.
3. Devolva em OBSERVAÇÕES a lista `fase → ID da sub-issue`, na ordem.

**Portão:** `tasks.md` em fases com tarefas `- [ ]`; uma sub-issue por fase, na ordem, conferida no Linear.
