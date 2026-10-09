# 03 · Nomenclatura

Nomes padronizados servem para três coisas: **ler rápido** uma lista de issues, **rastrear** do Linear até o código e de volta, e **gerar automaticamente** changelog e notas de release.

Regra geral: **títulos e descrições em português; prefixos, tipos, branches e commits no padrão em inglês do mercado** (Conventional Commits).

## 1. Prefixos de tipo

Todo título de issue começa com o prefixo do tipo, entre colchetes e em maiúsculas.

| Prefixo | Quando usar | Label `Type` | Branch | Commit | Trilha |
|---|---|---|---|---|---|
| `[FEAT]` | Capacidade nova ou melhoria visível ao usuário | Feature | `feat/` | `feat(...)` | Pela estimativa (M/L = spec) |
| `[FIX]` | Defeito encontrado na develop ou ainda não liberado | Bug | `fix/` | `fix(...)` | Bug |
| `[HOTFIX]` | Defeito **em produção**; sai da `main` e volta para `main` e `develop` | Hotfix | `hotfix/` | `fix(...)` | Bug, prioridade máxima |
| `[REFACTOR]` | Muda a estrutura sem mudar o comportamento | Refactor | `refactor/` | `refactor(...)` | Pela estimativa |
| `[PERF]` | Melhora desempenho | Performance | `perf/` | `perf(...)` | Pela estimativa |
| `[SECURITY]` | Segurança: autenticação, permissões, dados pessoais | Security | `security/` | `fix(security)` ou `feat(security)` | SDD, com aprovação do plano |
| `[INFRA]` | Deploy, CI, servidores, ambiente | Infra | `infra/` | `ci(...)` ou `build(...)` | Pela estimativa |
| `[CHORE]` | Dependências, configuração, limpeza | Chore | `chore/` | `chore(...)` | Pela estimativa |
| `[DOCS]` | Documentação | Docs | `docs/` | `docs(...)` | Pela estimativa |

**FIX ou HOTFIX?** A pergunta é "isso já está quebrado em produção?". Sim → `[HOTFIX]`. Não (só na develop ou numa feature ainda não liberada) → `[FIX]`.

**FEAT ou REFACTOR?** "O usuário percebe a diferença?" Sim → `[FEAT]`. Não → `[REFACTOR]`.

## 2. Projeto

| Regra | Certo | Errado |
|---|---|---|
| `[<IDENTIFICADOR>] <capacidade>`: identificador do time entre colchetes, como o `[TIPO]` das issues, para reconhecer o cliente em qualquer lista, busca ou notificação | `[BRU] Gestão de clientes` | `Gestão de clientes` |
| Substantivo que nomeia a capacidade | `[BRU] Gestão de clientes` | `[BRU] Fazer o CRM` |
| Sem número de ordem (a ordem está na linha do tempo) | `[BRU] Faturamento` | `[BRU] E3 · Faturamento` |
| Identificador do time, não o nome do cliente (curto e igual ao das issues) | `[BRU] Funil de vendas` | `Bruno - Funil de vendas` |
| Capacidade, nunca tema transversal: segurança, qualidade e performance viram specs no projeto que elas tocam | `[BRU] Gestão de clientes` com `[SECURITY] Spec 007 — …` | `[BRU] Segurança` |

Descrição do projeto: **Objetivo** (1–2 linhas), **Critério de pronto** (lista verificável) e **Fora de escopo**.

## 3. Milestone

Sempre `Alpha`, `Beta` e `GA`, com o critério de saída na descrição (guia 02, seção 3).

## 4. Issue pai (spec)

```
[TIPO] Spec NNN — <capacidade entregue>
```

| Parte | Regra |
|---|---|
| `[TIPO]` | Quase sempre `[FEAT]`; `[SECURITY]`, `[INFRA]` ou `[REFACTOR]` quando a spec é desse tipo |
| `Spec NNN` | Número sequencial do time, com 3 dígitos, igual à pasta `specs/NNN-...` do Spec Kit |
| `—` | Travessão separa a identificação do nome |
| Nome | A capacidade entregue, como substantivo ou frase curta; até ~60 caracteres |

Exemplos:
- `[FEAT] Spec 003 — Cadastro e listagem de clientes`
- `[SECURITY] Spec 007 — Sessões revogáveis e bloqueio de força bruta`
- `[INFRA] Spec 002 — Fundação de segurança, arquitetura e operação`

**Numeração:** quem cria a issue pai reserva o próximo número livre do time (maior `Spec NNN` existente + 1). O Diretor garante que a pasta do Spec Kit use o mesmo número.

## 5. Sub-issues (fases e user stories)

Criadas pelo Diretor depois que o `tasks.md` existe, uma por fase do `tasks.md`.

```
[TIPO] Spec NNN <Fase>                     fases técnicas
[TIPO] Spec NNN USn <comportamento>        user stories
```

| Fase do tasks.md | Título da sub-issue |
|---|---|
| Setup | `[FEAT] Spec 003 Setup` |
| Foundational | `[FEAT] Spec 003 Fundação` |
| User Story 1 | `[FEAT] Spec 003 US1 Cliente é cadastrado com nome e telefone` |
| User Story 2 | `[FEAT] Spec 003 US2 Lista de clientes pode ser filtrada por etapa` |
| Polish | `[FEAT] Spec 003 Polimento` |
| Tarefas do converge fora das fases | `[FEAT] Spec 003 Convergência` |

**O comportamento da US é uma frase afirmativa e verificável**, no presente, do ponto de vista de quem usa:

| Certo | Errado | Por quê |
|---|---|---|
| `Toda rota é fechada por padrão` | `Implementar middleware de auth` | Descreve o resultado, não a técnica |
| `Login resiste a abuso e sessões são revogáveis` | `Melhorias no login` | É verificável |
| `Cliente é criado direto do funil` | `Botão novo cliente` | Diz o que o usuário consegue fazer |

**O intervalo de tasks não vai no título.** Ele vai na primeira linha da descrição (`Tasks: T034–T049`), porque o `converge` acrescenta tasks e o intervalo do título ficaria desatualizado. O contador de progresso do Linear já mostra o andamento.

**Por que repetir `[TIPO] Spec NNN` em toda sub-issue:** nas listas planas (a fila, "minhas issues", a busca) a issue pai não aparece. O prefixo dá contexto sem precisar abrir nada.

## 6. Issue avulsa

```
[TIPO] <resultado esperado>        para FEAT, REFACTOR, PERF, INFRA, CHORE ou DOCS de estimativa XS/S
[TIPO] <sintoma observado>         para FIX e HOTFIX
```

| Tipo | Exemplo |
|---|---|
| `[FIX]` | `[FIX] Etapa do cliente não persiste ao fechar o modal` |
| `[HOTFIX]` | `[HOTFIX] Checkout retorna erro 500 para cartões internacionais` |
| `[CHORE]` | `[CHORE] Atualizar Next.js para a versão 16` |
| `[PERF]` | `[PERF] Lista de clientes carrega em menos de 1 segundo com 10 mil registros` |
| `[INFRA]` | `[INFRA] Backups diários do banco com restauração testada` |
| `[DOCS]` | `[DOCS] Documentar variáveis de ambiente do deploy` |

**Bug: o título descreve o sintoma, não a correção.** `Etapa do cliente não persiste ao fechar o modal`, e não `Corrigir modal`. O sintoma é o que você observou e é o que o teste vai provar que acabou.

**Regras gerais de título:** até ~80 caracteres; sem ID (o Linear já mostra); sem nome do cliente; sem ponto final; sem jargão desnecessário.

## 7. Descrição das issues

Os modelos oficiais, com todos os campos, estão em [`fluxo/linear/templates.md`](../fluxo/linear/templates.md) e são os mesmos configurados como templates no Linear. Resumo das seções de cada um:

| Template | Seções |
|---|---|
| Issue pai (spec) | Contexto · Objetivo · User stories previstas · Critérios de aceite · Fora de escopo · Dúvidas em aberto · Notas |
| Sub-issue | `Tasks: T0xx–T0yy · Spec: specs/NNN-<slug>/` · Comportamento · Critérios de aceite |
| Avulsa | Contexto · Objetivo · Critérios de aceite · Fora de escopo |
| Bug | Passos para reproduzir · Esperado · Obtido · Ambiente · Severidade · Critérios de aceite · Fora de escopo |
| Hotfix | Igual ao Bug, com Ambiente "produção" e uma seção de Impacto |

Critérios de aceite sempre no formato **Dado / Quando / Então**, verificáveis por alguém usando o sistema. Num bug, um dos critérios é sempre "um teste automatizado reproduz o defeito e passa após a correção".

## 8. Git

| Item | Formato | Exemplo |
|---|---|---|
| Branch | `<tipo>/<id-minúsculo>-<slug>` | `feat/bru-12-cadastro-de-clientes` · `hotfix/bru-40-checkout-erro-500` |
| Commit | `<tipo>(<domínio>): <resumo no imperativo>` | `feat(clientes): cadastrar cliente com nome e telefone` |
| Commit de fase | Mesmo formato, citando a sub-issue | `feat(clientes): US1 cadastro de cliente (BRU-14)` |
| PR | `<tipo>(<domínio>): <título sem [TIPO] e sem "Spec NNN —", em minúscula> (<ID>)` + `Fixes <ID>` no corpo | `feat(clientes): cadastro e listagem de clientes (BRU-12)` |
| Merge | Squash merge (um commit por PR na develop) | — |
| Release | Branch `release/vX.Y.Z` com o changelog → PR na develop; depois PR `release: vX.Y.Z` de `develop` para `main` + tag | `release: v1.4.0` |
| Branches sem ID (exceções) | `chore/speckit-setup` · `docs/roadmap-<data>` · `release/vX.Y.Z` | — |

O **domínio** do commit é a label de domínio da issue, em minúsculas e sem acento: `clientes`, `funil`, `financeiro`, `auth`.

## 9. Exemplo completo

```
Time: Bruno CRM (BRU)
└── Projeto: [BRU] Gestão de clientes
    ├── Milestones: Alpha · Beta · GA
    ├── BRU-12  [FEAT] Spec 003 — Cadastro e listagem de clientes          (Alpha · M · Clientes)
    │   ├── BRU-13  [FEAT] Spec 003 Setup
    │   ├── BRU-14  [FEAT] Spec 003 Fundação
    │   ├── BRU-15  [FEAT] Spec 003 US1 Cliente é cadastrado com nome e telefone
    │   ├── BRU-16  [FEAT] Spec 003 US2 Lista de clientes pode ser filtrada por etapa
    │   └── BRU-17  [FEAT] Spec 003 Polimento
    ├── BRU-20  [FEAT] Spec 004 — Edição e histórico do cliente            (Beta · M · Clientes) · blocked by BRU-12
    └── BRU-31  [FIX] Telefone com DDD é rejeitado no cadastro             (Beta · S · Clientes · S3)

Branch: feat/bru-12-cadastro-e-listagem-de-clientes
PR:     feat(clientes): cadastro e listagem de clientes (BRU-12) — Fixes BRU-12
```
