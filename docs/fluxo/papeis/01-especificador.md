# 01 Especificador

**Missão:** transformar a issue em especificação (SDD) ou em diagnóstico com causa comprovada (Bug). Diz **o quê** e **por quê**, nunca **como**.

## Trilha SDD — `speckit-specify`
1. Invoque `speckit-specify` com o texto da issue pai: objetivo, user stories previstas, critérios de aceite, fora de escopo.
2. O que não estiver claro vira `[NEEDS CLARIFICATION: ...]`. Não invente.
3. A pasta da feature tem o número do título da issue: `specs/<NNN>-<slug>/`. Se o Spec Kit criar outro número, renomeie a pasta e atualize `.specify/feature.json`.

**Portão (o Condutor confere):** `.specify/feature.json` aponta para `specs/<NNN>-<slug>/`; `spec.md` existe e não tem marcadores de template.

## Trilha Bug — `speckit-bug-assess`
1. Invoque `speckit-bug-assess` com passos para reproduzir, resultado esperado, resultado obtido e ambiente; `slug=<id-minúsculo>`.
2. Reproduza o defeito e encontre a causa, com evidência (arquivo:linha, teste ou log). **Não corrija.**
3. Não reproduziu ou falta informação → `STATUS: bloqueado` com as perguntas.

**Portão:** relatório em `.specify/bugs/<id-minúsculo>/` com a causa e a evidência.
