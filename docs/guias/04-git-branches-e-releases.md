# 04 · Git, branches e releases

## 1. Conceitos

| Termo | O que é | Analogia |
|---|---|---|
| **Repositório** | Todo o código e o histórico de mudanças. Existe no GitHub (*origin*) e na sua máquina (*local*) | O arquivo completo de um livro, com todas as revisões |
| **Branch** | Uma linha de histórico paralela. A `main` também é uma branch | Um rascunho que começa como cópia da edição oficial |
| **Commit** | Um ponto salvo, com uma mensagem | Um "salvar" com nota explicativa |
| **Pasta de trabalho** | Onde os arquivos de **uma** branch aparecem para editar e rodar | A mesa onde o rascunho está aberto |
| **Worktree** | Uma pasta de trabalho extra, ligada ao mesmo repositório, com outra branch aberta ao mesmo tempo | Uma segunda mesa, com outro rascunho aberto |
| **Push / Pull** | Enviar commits para o GitHub / trazer do GitHub | Sincronizar com o arquivo central |
| **Pull Request (PR)** | Pedido formal para incorporar uma branch em outra, com revisão | "Por favor, inclua este rascunho na edição" |
| **Merge** | Incorporar uma branch em outra | Publicar o rascunho na edição |
| **Conflito** | Duas branches mudaram as mesmas linhas de formas diferentes | Dois revisores reescreveram o mesmo parágrafo |

## 2. Modelo de branches (padrão em todos os projetos)

```
main     ────────────────────────────────●────────────●──────▶  produção
                                          ↑ release    ↑ hotfix
develop  ───●──────────●──────────●───────┴──────●─────┴──────▶  integração (testada localmente)
             \        ↑ \        ↑               ↑
              ●──●──●─┘  ●──●──●─┘               │
       feat/bru-12-...   fix/bru-31-...      (hotfix também volta para a develop)
```

| Branch | Vida | Papel | Quem escreve |
|---|---|---|---|
| `main` | Permanente | Produção. Só recebe releases e hotfixes | Só merge de PR, feito por você |
| `develop` | Permanente | Integração. Tudo aprovado entra aqui primeiro | Só merge de PR, feito por você |
| `<tipo>/<id>-<slug>` | Temporária | Uma issue. Nasce da develop (ou da main, se hotfix) e é apagada após o merge | Agentes |

**Regras de ouro**
1. Ninguém faz commit direto na `main` nem na `develop`. Tudo entra por PR.
2. Uma issue = uma branch = uma worktree.
3. Quem faz merge é você.
4. Não usamos `rebase` nem `push --force` em branches compartilhadas.
5. Squash merge: cada PR vira um único commit na develop, com o título no padrão do guia 03.

Projetos que já estão em produção também ganham a `develop`. O deploy de produção continua saindo da `main`.

## 3. Worktrees na prática

Sem worktree, trocar de branch troca os arquivos da mesma pasta, e só dá para ter uma branch aberta por vez. Com worktree, cada issue tem a sua própria pasta, ao mesmo tempo.

| Pasta | Branch | Criada por | Porta | Vida |
|---|---|---|---|---|
| Pasta principal | `develop` | você, uma vez | 3000 | Permanente |
| Worktree do Diretor 01 | `feat/bru-12-...` | Diretor 01 | 3001 | Até o merge |
| Worktree do Diretor 02 | `fix/bru-31-...` | Diretor 02 | 3002 | Até o merge |
| Worktree de hotfix | `hotfix/bru-40-...` | Diretor livre | 300N | Até o merge |

**Cuidados**
- Uma worktree nova nasce do **último commit** da branch de origem. Alterações não commitadas na pasta principal **não** vão junto.
- Arquivos fora do git (`.env`, `node_modules`) não vêm na worktree; o Diretor copia ou instala.
- A mesma branch não pode estar aberta em duas pastas ao mesmo tempo.
- Ciclo de vida: **cria → usa → merge → apaga**. O Diretor remove a worktree ao ser encerrado; o Sweep do Traycer limpa o que sobrar.

## 4. Ciclo de uma issue no git

1. O Diretor cria a branch `feat/bru-12-cadastro-de-clientes` a partir de `origin/develop`, numa worktree.
2. Os agentes fazem commits por fase (`feat(clientes): US1 cadastro de cliente (BRU-14)`).
3. Antes do PR, o Diretor traz a develop mais recente para a branch (`git merge origin/develop`) e roda os testes de novo.
4. PR para a `develop`, com `Fixes BRU-12` no corpo.
5. Você testa e faz o **squash merge**. O Linear move a issue para Done.

## 5. Hotfix

Usado só para defeito **em produção** (`[HOTFIX]`, normalmente `S1` ou `S2`).

1. Branch `hotfix/bru-40-<slug>` criada a partir de `origin/main`.
2. Correção com teste que reproduz o defeito.
3. PR para a **`main`**. Você testa, faz o merge e publica uma release de patch (`v1.4.1`).
4. **Back-merge:** PR de `main` para `develop`, para a correção não se perder na próxima release.

## 6. Releases e versões

### Quando fazer
- Ao fechar um milestone (Alpha, Beta, GA) de um projeto;
- ou sempre que houver na develop um conjunto de mudanças que você quer levar ao cliente.

O Coordenador sugere a release quando um milestone fecha.

### Como fazer
1. Branch `release/vX.Y.Z` a partir da develop, só com o `CHANGELOG.md` atualizado (seção abaixo); PR para a develop e merge.
2. PR de `develop` para `main` com título `release: vX.Y.Z` e o changelog da versão no corpo.
3. Merge (merge commit, não squash, para preservar os commits da develop).
4. Tag `vX.Y.Z` na `main` e release no GitHub.
5. No Linear: a release no pipeline do repositório e o *project update* com o resumo para o cliente.

### Número da versão (SemVer: `MAJOR.MINOR.PATCH`)

| Mudou o quê | Sobe | Exemplo |
|---|---|---|
| Algo incompatível (flag `Breaking Change`) | MAJOR | `1.4.2` → `2.0.0` |
| Nova capacidade (`feat`) | MINOR | `1.4.2` → `1.5.0` |
| Só `fix`, `perf`, `refactor`, `chore`, `docs`, `ci`, `build` (inclui hotfix) | PATCH | `1.4.2` → `1.4.3` |

Antes do primeiro GA em produção, o produto fica em `0.x.y` (ex.: `0.3.0`); nessa fase, mudança incompatível sobe MINOR, não MAJOR. O primeiro GA vira `1.0.0`.

### Changelog (formato Keep a Changelog)

Arquivo `CHANGELOG.md` na raiz, gerado a partir dos commits da develop desde a última tag:

```markdown
## [1.5.0] — 2026-10-20
### Adicionado
- Cadastro e listagem de clientes (BRU-12)
### Corrigido
- Telefone com DDD era rejeitado no cadastro (BRU-31)
### Segurança
- Sessões revogáveis e bloqueio de força bruta (BRU-25)
```

Mapa de commits para seções: `feat` → Adicionado · `fix` → Corrigido · `perf`/`refactor` → Alterado · `fix(security)`/`feat(security)` → Segurança. `chore`, `docs`, `ci` e `build` não entram no changelog.

## 7. Cenário de um dia

| Hora | Acontecimento | Git |
|---|---|---|
| 09:00 | Coordenador sobe a develop em `localhost:3000` e cria 3 Diretores | Pasta principal na `develop` atualizada |
| 09:10 | Diretor 01 recebe BRU-12; Diretor 02 recebe BRU-31 | Worktrees `feat/bru-12-...` e `fix/bru-31-...` |
| 11:00 | Cliente avisa: checkout quebrado em produção | Você cria BRU-40 `[HOTFIX]`; Diretor 03 trabalha em `hotfix/bru-40-...` a partir da `main` |
| 12:00 | Hotfix testado e mesclado | PR para `main` → `v1.4.1`; back-merge para `develop` |
| 15:00 | BRU-12 em Verifying | Você testa em `localhost:3001` |
| 15:30 | Aprovado | Squash merge na develop; Coordenador arquiva o Diretor 01 e cria outro |
| 17:00 | Milestone Alpha de "Gestão de clientes" fechado | Coordenador sugere `release: v1.5.0` |
