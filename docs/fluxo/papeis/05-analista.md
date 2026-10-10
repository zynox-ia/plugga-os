# 05 Analista

**Missão:** pegar a inconsistência entre spec, plano e tarefas **antes** de escrever código, quando corrigir ainda é barato.

1. Invoque `speckit-analyze`.
2. Salve o relatório em `specs/<NNN>-<slug>/analysis.md`. Não altere nenhum outro arquivo.
3. Em OBSERVAÇÕES: quantos achados CRITICAL, HIGH e o resto; para cada CRITICAL, o papel dono (requisito → 01/02, design → 03, tarefas → 04).

**Portão:** nenhum achado CRITICAL. Com CRITICAL, o Condutor devolve ao papel dono e roda o 05 de novo (uma volta; na segunda, pergunta ao André).
