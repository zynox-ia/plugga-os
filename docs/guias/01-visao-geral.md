# 01 · Visão geral

## A ideia em uma frase

Você descreve o que quer no Linear; um **Coordenador** distribui o trabalho para até **três Diretores**; cada Diretor monta um **time de agentes** que segue o processo do **GitHub Spec Kit** numa branch isolada; você testa no seu computador e decide o que entra.

## Quem faz o quê

| Papel | O que é | Responsabilidades | Nunca faz |
|---|---|---|---|
| **André** | O humano | Define prioridades, responde perguntas, testa, faz merge, decide releases | — |
| **Agente do Linear** / skill `registrar-linear` | O agente nativo do Linear, ou qualquer agente no Traycer com a skill | Transforma o que você fala em issues no padrão (guia 03) | Escreve código |
| **Coordenador** | Um agente por sessão de trabalho | Sobe a develop, audita o projeto, cria e recria os Diretores, propõe a fila, distribui issues, sugere releases | Fala com agentes de fase, escreve código, faz merge |
| **Diretor 01, 02, 03** | Um agente por vaga | Recebe uma issue, monta o time, confere cada portão, prepara o ambiente de teste | Toca em outra issue, faz merge |
| **Agentes de fase** | Criados pelo Diretor, um por fase | Executam uma única fase do Spec Kit (specify, plan, implement…) | Fazem mais de uma fase |
| **Revisor independente** | Agente de fase especial, de preferência outro modelo | Julga o trabalho contra os critérios de aceite | Corrige o que revisa |

Agentes só conversam com o nível imediatamente abaixo (o Coordenador nunca fala com agentes de fase). Você pode falar com qualquer um, e os Diretores falam com você diretamente para perguntas e validação.

```
André
 └── Coordenador (1 por sessão)
      ├── Diretor 01 · porta 3001 ── time da issue A (agentes de fase, um por vez)
      ├── Diretor 02 · porta 3002 ── time da issue B
      └── Diretor 03 · porta 3003 ── ocioso, aguardando issue
```

## O ciclo de uma issue

```
Backlog → Ready → In Progress → In Review → Verifying → Done
  │         │          │             │            │          │
  │         │          │             │            │          └ você fez o merge na develop
  │         │          │             │            └ você testa em localhost:300N
  │         │          │             └ PR aberto; revisor independente avaliando
  │         │          └ time do Diretor trabalhando (perguntas chegam no chat do Diretor)
  │         └ você liberou; entra na fila do Coordenador
  └ registrada pelo agente do Linear ou pela skill planejar-etapas
```

1. A issue chega a **Ready** (você move).
2. O Coordenador propõe a fila; você aprova; ele despacha para um Diretor livre.
3. O Diretor cria a worktree e a branch, publica a escalação do time e move para **In Progress**.
4. O time executa as fases. Dúvidas de negócio chegam a você no chat do Diretor.
5. O Diretor abre o PR (**In Review**); o revisor independente avalia.
6. Aprovado pelo revisor, o Diretor prepara o ambiente de teste com uma cópia do banco da develop e move para **Verifying**.
7. Você testa em `localhost:300N`. Pede ajustes ao Diretor, ou faz o merge e diz ao Coordenador `aprovei <ID>`.
8. O Coordenador confere o merge, arquiva o Diretor e o time, cria um Diretor novo na vaga e propõe a próxima issue.

## A sessão de trabalho

- **Começo:** você cola o prompt do Coordenador num agente novo. Ele sobe a develop em `localhost:3000`, audita o projeto, cria os três Diretores e propõe o que fazer.
- **Durante:** você responde perguntas, testa e aprova.
- **A cada poucas horas:** você diz `encerrar sessão`, arquiva todos os agentes e abre um Coordenador novo. Nada se perde, porque o estado de tudo está nos arquivos `.pipeline/` e no Linear.

Por que reiniciar: agentes perdem qualidade quando o contexto da conversa fica longo. Um Coordenador novo lê o estado dos arquivos e continua com a "memória" limpa.

## Princípios que sustentam o desenho

| Princípio | Como aparece no fluxo |
|---|---|
| Contexto é o recurso mais escasso | Um agente novo por fase; Coordenador reiniciado a cada sessão |
| O estado vive fora da conversa | Arquivos `.pipeline/`, artefatos do Spec Kit e o Linear |
| Quem faz não aprova | Revisor independente; portões conferidos por comando, não por relato |
| Processo proporcional ao tamanho | Trilhas SDD, rápida e bug (guia 07) |
| Paralelismo limitado pela revisão humana | No máximo 3 issues em andamento |
| Nada vai para produção sem você | Merge e release são sempre humanos |
