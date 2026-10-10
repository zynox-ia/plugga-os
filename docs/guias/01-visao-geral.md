# 01 · Visão geral

## A ideia em uma frase

Você descreve o que quer no Linear; o **00 Condutor** pega uma issue por vez e monta um **time** com um agente para cada etapa do **GitHub Spec Kit**, do 01 Especificador ao 09 Verificador, e passa o bastão de um para o outro; você testa e mescla, ou deixa o Condutor trabalhar sozinho no modo automático.

## Quem faz o quê

| Papel | O que faz |
|---|---|
| **André** | Define prioridades, responde perguntas, testa, mescla, decide releases |
| **Agente do Linear** / skill `registrar-linear` | Transforma o que você fala em issues no padrão (guia 03) |
| **00 Condutor** | Monta a fila, passa o bastão, confere cada portão, abre e fecha as issues |
| **01 Especificador** | Escreve a spec (`specify`); no bug, diagnostica a causa (`bug-assess`) |
| **02 Esclarecedor** | Levanta as dúvidas da spec para você responder (`clarify`) |
| **03 Arquiteto** | Faz o plano técnico, com o que não deve mudar (`plan`) |
| **04 Planejador** | Quebra em tarefas e cria as sub-issues (`tasks`) |
| **05 Analista** | Confere spec, plano e tarefas antes do código (`analyze`) |
| **06 Implementador** | Escreve o código, uma fase por bastão (`implement`; no bug, `bug-fix`) |
| **07 Convergência** | Confere que o código cumpre a spec (`converge`; no bug, `bug-test`) |
| **08 Revisor** | Julga o trabalho, com o modelo que não implementou |
| **09 Verificador** | Atualiza com a develop, verifica, abre o PR e sobe o ambiente de teste |

Cada papel tem um arquivo em `docs/fluxo/papeis/` e um modelo de IA fixo (guia 07, seção 8). Os papéis só falam com o Condutor; o Condutor fala com você.

**O time nasce junto e é trocado a cada issue.** Ao começar uma issue, o Condutor cria de uma vez todos os agentes da trilha, e você vê o time inteiro no painel do Traycer (`01 Especificador` … `09 Verificador`); qual issue ele está fazendo, você vê no Linear e na conversa. Cada um espera o bastão, faz a sua parte e fica disponível para as voltas (uma correção pedida pelo 08 volta para o mesmo 06). Quando a issue é mesclada, o time inteiro é arquivado e a próxima issue começa com um time novo, de memória limpa.

```
André
 └── 00 Condutor ── uma issue por vez
      time da BRU-23: 01 → 02 → 03 → 04 → 05 → 06 (US1, US2…) → 07 → 08 → 09 ── PR
      (mesclada → time arquivado → time novo para a BRU-24)
```

## O ciclo de uma issue

```
Backlog → Ready → In Progress → In Review → Verifying → Done
                     01 a 07       08 e 09    você testa   mesclada na develop
```

1. Você move a issue para **Ready**.
2. O Condutor a pega na vez dela, cria a branch, monta o time e comenta o "bastão" na issue (a lista dos papéis).
3. Os papéis 01 a 07 trabalham; as perguntas do 02 chegam para você.
4. O 08 revisa e o 09 deixa o PR pronto (**In Review**).
5. **Modo manual:** o 09 sobe o ambiente de teste e a issue vai para **Verifying**. Você testa em `teste.localhost:3001` e faz o merge. **Modo automático:** o próprio Condutor mescla, exceto nos casos que exigem você (guia 07).
6. O Condutor limpa o ambiente, atualiza a develop em `develop.localhost:3000` e pega a próxima issue.

## Os três jeitos de trabalhar com o Condutor

| Modo | Quando usar | Comando |
|---|---|---|
| **manual** | No dia a dia, quando você está por perto | `Siga docs/fluxo/02-condutor.md. Modo: manual` |
| **preparar** | Antes de deixar o automático rodando: ele faz 01 a 05 num lote e você responde todas as perguntas de uma vez | `Siga docs/fluxo/02-condutor.md. Modo: preparar` |
| **automático** | Para a noite: ele vai pela fila sem parar e entrega um relatório | `Siga docs/fluxo/02-condutor.md. Modo: automático` |

Para ajustes visuais, sem spec, você conversa direto com um agente: `Siga docs/fluxo/03-visual.md. Assunto: <...>`.

## Princípios que sustentam o desenho

| Princípio | Como aparece no fluxo |
|---|---|
| Contexto é o recurso mais escasso | Um agente por papel e um time novo por issue; o Condutor passa o turno a cada poucas issues |
| O estado vive fora da conversa | `.pipeline/`, artefatos do Spec Kit e o Linear |
| Quem faz não aprova | 08 Revisor de outro modelo; portões conferidos por comando, não por relato |
| Toda mudança passa pelo processo inteiro | Uma trilha SDD para qualquer tamanho; só o visual tem sessão própria |
| Uma coisa de cada vez | Uma issue por vez, sempre a partir da develop atualizada |
| Produção é decisão sua | Merge na `main`, release e hotfix são sempre seus |
