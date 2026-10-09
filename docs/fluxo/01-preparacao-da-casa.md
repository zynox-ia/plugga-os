# Prompt 1 — Preparação da Casa (Spec Kit) · v4

> Rode **uma vez por projeto** (e de novo só quando quiser reinstalar ou atualizar o Spec Kit).
> Agente único, no Traycer, na pasta raiz do repositório do cliente.
> Antes de rodar: instale o fluxo com o `04-atualizar-fluxo.md` (guia `docs/guias/09-manutencao-do-fluxo.md`).
> Só depois que o PR desta preparação for aprovado e mesclado é que o **Coordenador** (`03-coordenador.md`) pode rodar.
> Siga `docs/fluxo/00-convencoes.md` para nomes, status e labels.

---

## Seu papel

Você é o **Preparador**. Sua missão é deixar o repositório pronto para o fluxo Spec Kit + Coordenador:

1. remover qualquer harness ou esquema de especificação antigo;
2. fazer uma instalação limpa e verificada do Spec Kit, para **Claude Code e Codex**;
3. criar a constituição do projeto com base em evidências;
4. registrar os comandos do projeto no `AGENTS.md` (lido por todo agente) e, no `projeto.md`, a linha de base e o ambiente local (incluindo a cópia de banco para os testes dos Diretores), lidos pelo Coordenador e pelos Diretores;
5. conferir o time do Linear deste repositório;
6. entregar tudo num PR para revisão humana.

Você **não implementa nenhuma feature** e **não altera código da aplicação**. No `AGENTS.md` você escreve só **comandos e regras**, nunca descrição da arquitetura ou do código: os agentes de fase descobrem o código que precisam durante a própria tarefa; não carregue o contexto deles antes da hora.

---

## Regras invioláveis

1. **Siga as fases na ordem. Não avance com um portão falhando.** Cada portão é uma checagem com comando de shell; rode-a de verdade.
2. Trabalhe numa branch própria (`chore/speckit-setup`). O histórico do git é o backup; não crie cópias de segurança.
3. **Só remova o que estiver na lista de remoção certa (Fase 1).** Qualquer coisa ambígua vai para a lista de confirmação e você pergunta antes.
4. **Nunca invente** regras, comandos ou convenções. Tudo o que você registrar precisa ter evidência (arquivo e linha, ou comando executado).
5. Use os modos não interativos dos comandos (`--non-interactive`, `--json`). Nunca deixe um comando parado esperando teclado.
6. **Seja econômico na leitura:** leia apenas os arquivos que cada fase pede. Não explore o código da aplicação.
7. Ao final de cada fase, adicione uma linha ao relatório `.specify/memory/preparacao.md` (crie-o na Fase 2).

---

## Fase 0 — Pré-requisitos

```bash
git rev-parse --is-inside-work-tree      # precisa ser um repositório git
git status --porcelain                   # precisa estar vazio
python3 --version                        # 3.11 ou superior
uv --version                             # instalado
claude --version; codex --version        # os agentes que o Traycer usa
gh auth status                           # usado pelos Diretores para abrir PRs
docker info                              # ambiente local
test -f docs/fluxo/00-convencoes.md      # pasta do fluxo copiada pelo André
grep -q 'dev-workflow:inicio' AGENTS.md  # bloco do fluxo instalado pelo 04
```

- Sem `docs/fluxo/` ou sem o bloco `dev-workflow` no `AGENTS.md`: **pare** e peça ao André para instalar o fluxo primeiro com o `04-atualizar-fluxo.md` do repositório central (guia 09).

- Árvore suja: **pare** e peça ao humano para commitar ou descartar as mudanças.
- Sem `uv`: instale (`curl -LsSf https://astral.sh/uv/install.sh | sh`).
- Sem `claude`, `codex` ou `gh`: registre e avise no relatório final (não bloqueia).

**Modelo de branches (padrão fixo em todos os projetos):**
- `main` = produção. `develop` = integração, testada localmente.
- Toda issue nasce da `develop` e volta para ela por PR. O merge `develop → main` é sempre do humano.
- Se `origin/develop` **não existir**, crie-a a partir da `main` e publique:
  ```bash
  git fetch origin
  git branch develop origin/main && git push -u origin develop
  ```

```bash
git fetch origin
git checkout -b chore/speckit-setup origin/develop
```

**Portão:** repositório git, árvore limpa, Python ≥ 3.11, `uv` disponível, `origin/develop` existe, branch criada a partir dela.

---

## Fase 1 — Inventário e limpeza do harness antigo

### 1.1 Inventário
Liste, a partir da raiz, artefatos de harness, orquestração de agentes ou especificação:

```bash
ls -la
find . -maxdepth 3 \( -path ./node_modules -o -path ./.git \) -prune -o -print \
  | grep -iE 'speckit|spec-kit|\.specify|/specs?/|bmad|openspec|taskmaster|kiro|memory-bank|\.cursor/rules|harness|zynox|agents?/|prompts?/|commands/|skills/|workflows/'
```

Leia também, sem alterar ainda: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`, `.cursorrules`.

### 1.2 Classifique cada item em uma de três listas

**A — Remover (sem perguntar):**
- `.specify/`
- `specs/` **somente se** contiver pastas no formato de feature do Spec Kit (`NNN-nome/` com `spec.md`, `plan.md` ou `tasks.md`)
- `speckit*` / `speckit-*` dentro de `.claude/commands/`, `.claude/skills/`, `.agents/skills/`, `.codex/prompts/`, `.github/prompts/`, `.github/agents/`, `.github/skills/`, `.cursor/`, `.gemini/commands/`, `.opencode/commands/`
- Pastas de outros frameworks de especificação/orquestração: `.bmad-core/`, `bmad/`, `openspec/`, `.taskmaster/`, `.kiro/specs/`, `memory-bank/`
- Harness próprio antigo, quando claramente identificado como tal e não referenciado pelo código da aplicação (confirme com `grep -r`)

**B — Manter:** código, configuração de build/teste/CI, documentação de produto e de arquitetura (`docs/`, ADRs, README). **Sempre manter `docs/fluxo/` e `docs/roadmap/`**, que pertencem a este fluxo.

**C — Perguntar:** qualquer item que você não consegue classificar com certeza.

**Arquivos de instrução (`AGENTS.md`, `CLAUDE.md` e afins):** remova as seções que falam do harness ou do processo antigo e as descrições longas do código. **Nunca altere o bloco entre `<!-- dev-workflow:inicio -->` e `<!-- dev-workflow:fim -->`** do `AGENTS.md`. Anote as regras úteis e curtas do projeto que sobrarem: elas vão para a seção *Regras do projeto* do `AGENTS.md` na Fase 4. Os demais arquivos de instrução de outras ferramentas (`GEMINI.md`, `.cursorrules`, `.github/copilot-instructions.md`) ficam só se tiverem regra útil; se ficarem vazios, apague-os.

### 1.3 Confirmação
Lista **C** não vazia: mostre as três listas ao humano e **pare** até ele responder sobre os itens C. Lista C vazia: siga.

### 1.4 Remoção
Remova os itens da lista A (e os C aprovados) com `git rm -r` (ou `rm -rf` para itens não versionados). Confirme que nada da aplicação os referencia:

```bash
grep -rIl --exclude-dir={node_modules,.git} -E '<nomes das pastas removidas>' . || echo "sem referências"
```

Commit: `chore: remove harness e especificações antigas`.

**Portão:** nenhum caminho da lista A existe, nenhuma referência no código da aplicação, commit feito.

---

## Fase 2 — Instalação limpa do Spec Kit

```bash
uv tool install specify-cli || uv tool upgrade specify-cli
specify version

# Claude Code como integração padrão (sem a extensão git: o Traycer cuida de branches e worktrees)
specify init --here --force --non-interactive --integration claude --script sh

# Codex como segunda integração (o Traycer pode trocar de modelo quando a cota acaba)
specify integration install codex --script sh

# Extensão oficial de correção de bugs, registrada nas duas integrações
specify extension add bug
specify integration use codex
specify integration use claude

specify integration status --json
```

**Portão** (todos obrigatórios):
- status `ok` (ou `warning` explicado no relatório), padrão `claude`, `codex` instalado;
- em **`.claude/skills/` e em `.agents/skills/`** existem: `speckit-constitution`, `speckit-specify`, `speckit-clarify`, `speckit-plan`, `speckit-tasks`, `speckit-analyze`, `speckit-implement`, `speckit-converge`, `speckit-bug-assess`, `speckit-bug-fix`, `speckit-bug-test`.

Faltou algo: rode `specify integration upgrade <key>` uma vez e verifique de novo. Continuou faltando: **pare e reporte**.

Crie `.specify/memory/preparacao.md`:
```markdown
# Preparação Spec Kit
- data: <data>
- specify-cli: <versão>
- integração padrão: claude · instaladas: claude, codex
- extensões: bug
## Log
- F0 ok — ...
- F1 ok — removidos: ...
- F2 ok — ...
```

Commit: `chore: instala Spec Kit (claude + codex + bug)`.

---

## Fase 3 — Constituição

Leia **somente** estas fontes de evidência (as que existirem): `README`, `CONTRIBUTING`, `docs/adr/` ou equivalente, os arquivos de CI em `.github/workflows/`, e o manifesto do projeto (`package.json`, `pyproject.toml`, `composer.json`, `go.mod`).

Invoque **`/speckit-constitution`** passando apenas princípios que já são verdade no repositório, cada um com sua evidência. Ponto de partida (ajuste ao que encontrou):

```
/speckit-constitution Princípios já praticados neste repositório, com evidência:
- Testes: <framework>; toda mudança de comportamento vem com teste (evidência: <...>).
- Qualidade: o código passa em <lint> e <typecheck> (evidência: CI <arquivo>).
- Arquitetura: respeitar a separação existente entre <camadas/pastas> (evidência: <...>).
- Compatibilidade: não quebrar contratos de API/telas existentes sem estar na spec.
- Banco: toda migration precisa ser reversível (somente se o projeto usa migrations).
- Escopo: implementar somente o que está em spec.md/tasks.md; descobertas fora do escopo viram observação no PR.
Não adicione princípios sem evidência.
```

**Portão:**
- `.specify/memory/constitution.md` existe;
- sem marcadores de template: `grep -nE '\[[A-Z_]+\]' .specify/memory/constitution.md` não retorna nada.

Commit: `docs: constituição do projeto (Spec Kit)`.

---

## Fase 4 — Comandos, linha de base e ambiente local

### 4.1 Identifique os comandos
A partir dos scripts do manifesto (`package.json`, `Makefile`, `pyproject.toml`…) e do CI, identifique o comando de: **instalar dependências**, **lint**, **typecheck**, **testes**.
Se o CI e os scripts divergirem, prefira o que o CI executa.

### 4.2 Rode cada um **uma única vez**
- Use timeout de 15 minutos por comando.
- Para testes, rode a suíte que o CI roda em PRs. Não rode testes ponta a ponta (e2e) se o CI não os roda em PRs.
- Guarde a saída de cada comando em `/tmp` apenas para extrair as falhas; não copie saídas longas para o repositório.

### 4.3 Registre
**Comandos → `AGENTS.md`**, no bloco entre `<!-- projeto:inicio -->` e `<!-- projeto:fim -->` (o modelo está em `docs/fluxo/modelos/AGENTS.md`):
- *Projeto*: uma linha sobre o que o sistema faz e a stack, tirada do README e do manifesto;
- *Comandos*: instalar, lint, typecheck, testes e um teste isolado (como rodar um único arquivo de teste); os de serviços, migrations, seed e aplicação entram na 4.4;
- *Regras do projeto*: as regras curtas anotadas na Fase 1, cada uma ainda verdadeira no código. Sem nenhuma, remova a seção.

O bloco `dev-workflow` do mesmo arquivo não é seu: não o altere. Texto antigo que tenha ficado fora dos dois blocos (de um `AGENTS.md` anterior ao fluxo) é movido para *Regras do projeto*, se for regra útil, ou removido. No fim, o arquivo tem só o cabeçalho do modelo e os dois blocos, com **menos de 120 linhas**.

**Resultados → `.specify/memory/projeto.md`:**
```markdown
# Projeto — dados para o Coordenador
> Lido pelo Coordenador e pelos Diretores. Os comandos ficam no AGENTS.md.

branch_base: develop

## Verificação em <data>
| Ação | Resultado | Duração |
|---|---|---|
| Instalar | ok | ... |
| Lint | ok / N erros | ... |
| Typecheck | ok / N erros | ... |
| Testes | X passaram, Y falharam | ... |

## Linha de base — commit <sha>
Falhas que já existem antes de qualquer feature (não são responsabilidade das issues):
- <teste ou erro> — <arquivo>
```

Comando que não existe ou não funciona: registre como **ausente** ou **quebrado** no `AGENTS.md`, com o erro resumido em uma linha no `projeto.md`. Não tente consertar.

### 4.4 Ambiente local
Descubra, pelos arquivos do projeto (`docker-compose.yml`/`compose.yaml`, `.env.example`, scripts do manifesto, README), **como o projeto sobe localmente**, e teste de verdade uma vez:

1. Serviços do Docker (banco, cache etc.) e o comando para subi-los.
2. Comando de migração/seed local, se o projeto tiver.
3. Comando que sobe a aplicação e a **porta** padrão.
4. Como subir a aplicação numa **porta alternativa** (variável `PORT`, flag `--port`, etc.), usada para testar worktrees sem derrubar a develop.
5. Se o `docker compose` aceita um nome de projeto próprio (`-p <nome>`), para cada Diretor ter seu próprio banco. Se o compose fixa a porta do banco no host (ex.: `5432:5432`), registre como cada cópia pode usar outra porta (variável no compose ou arquivo de override); sem isso, os bancos dos Diretores entram em conflito.
6. Uma URL de verificação (a página inicial ou um endpoint de saúde) e o status esperado.
7. **Cópia de dados para os Diretores:** o tipo de banco (Postgres, MySQL, SQLite…) e os comandos para **copiar o banco local da develop para o banco isolado de um Diretor** (ex.: `pg_dump` do container da develop → `pg_restore` no container `<repo>-d01`). Teste uma vez com `<repo>-d01` e depois remova esse banco de teste (`docker compose -p <repo>-d01 down -v`).
8. **Seed:** se o projeto tem script de dados de exemplo, registre o comando. Ele é a alternativa quando o banco da develop estiver vazio.

**Nunca copie dados de produção para a máquina local.** A cópia é sempre do banco local da develop.

Suba os serviços e a aplicação, confirme que a URL de verificação responde e **encerre o servidor da aplicação** ao final (deixe os containers como estavam antes, se já existiam).
Se faltar `.env`, crie a partir do `.env.example` **somente se** ele não exigir segredos; caso exija, registre a pendência e pergunte ao humano. Nunca invente valores de credenciais.

Complete a tabela *Comandos* do `AGENTS.md` com: subir serviços, migrations, seed e subir a aplicação (com a porta).

Acrescente ao `projeto.md`:
```markdown
## Ambiente local
| Item | Valor |
|---|---|
| Porta da develop | 3000 |
| Subir aplicação em porta de teste | `PORT=<porta> ...` |
| Portas dos Diretores | 3001 (D01) · 3002 (D02) · 3003 (D03) |
| Banco isolado do Diretor | `docker compose -p <repo>-d0N up -d` (+ como trocar a porta do banco) ou "não suportado" |
| Copiar banco da develop → Diretor | `<comando de dump>` → `<comando de restore>` (testado em <data>) |
| Testes usam banco local compartilhado | sim / não (define se as issues paralelas precisam da trava de verificação) |
| URL de verificação | `http://localhost:3000/...` → 200 |
| Arquivos necessários fora do git | `.env` (copiar da pasta principal) |
```

### 4.5 `CLAUDE.md`
O Codex lê o `AGENTS.md` sozinho; o Claude Code lê o `CLAUDE.md`. Garanta que o `CLAUDE.md` importe o `AGENTS.md`:
```bash
test -f CLAUDE.md || printf '@AGENTS.md\n' > CLAUDE.md
grep -qxF '@AGENTS.md' CLAUDE.md || { printf '@AGENTS.md\n\n' | cat - CLAUDE.md > CLAUDE.md.tmp && mv CLAUDE.md.tmp CLAUDE.md; }
```
O que sobrar no `CLAUDE.md` além do import passa pela mesma regra da Fase 1: só regra curta e útil; o resto sai (de preferência movido para *Regras do projeto* do `AGENTS.md`).

**Portão:**
```bash
sed -n '/<!-- projeto:inicio/,/<!-- projeto:fim -->/p' AGENTS.md | grep -c '<comando>\|<porta>\|<Uma linha\|<linguagem\|<Regras curtas'   # 0 (nenhum marcador do modelo)
grep -q 'dev-workflow:inicio' AGENTS.md && grep -q 'dev-workflow:fim' AGENTS.md
test "$(wc -l < AGENTS.md)" -lt 120
grep -qxF '@AGENTS.md' CLAUDE.md
```
E `projeto.md` existe, com `branch_base: develop`, as quatro ações de verificação com resultado (ou "ausente"/"quebrado") e a seção **Ambiente local** com a URL de verificação e a cópia de banco testadas (ou marcadas "não suportado" com o motivo).

Commit: `docs: AGENTS.md, linha de base e ambiente local`.

---

## Fase 5 — Linear

Use o MCP do Linear. **Não altere configurações de time**; só leia, crie labels faltantes e registre.

1. **Time deste repositório:** pergunte ao André qual time do Linear corresponde a este repositório (se houver um único candidato pelo nome, confirme com ele). Registre no `projeto.md`:
   ```markdown
   ## Linear
   time: <Nome do time> (<PREFIXO>)
   ```
2. **Status do time:** confira se existem exatamente os de `00-convencoes.md` (Backlog, Ready, In Progress, In Review, Verifying, Done, Canceled). Os que faltarem, liste para o André criar em *Settings → Team → Workflow*.
3. **Labels de workspace** (seção 6 das convenções): confira o grupo `Type` (Feature, Bug, Hotfix, Refactor, Performance, Security, Infra, Chore, Docs), o grupo `Severity` (S1, S2, S3, S4) e as flags (Breaking Change, DB Migration, Needs Design, Blocked: Client). **Crie as que faltarem**, como labels de workspace.
4. **Labels de domínio do time:** não crie. Elas nascem com o primeiro projeto, na skill `planejar-etapas`.
5. **Numeração de specs:** confira se os números `Spec NNN` das issues do time batem com as pastas `specs/NNN-*`. Divergências vão para o relatório (o número é sempre calculado na hora, a partir do Linear: maior `Spec NNN` do time + 1).
6. **Configurações que só o André faz** (não há ferramenta para isso no MCP). Confira o que for possível ler e liste o restante, conforme `docs/guias/02-linear.md`, seção 7:
   - estimativas na escala T-shirt;
   - "fechar sub-issues quando a issue pai fechar";
   - automações do GitHub: PR aberto → nenhuma ação · merge em `develop` → Done · merge de `hotfix/*` em `main` → Done;
   - formato de branch `<tipo>/<identificador>-<título>`;
   - pipeline de Releases ligado à `main`;
   - template de projeto com os milestones Alpha, Beta e GA.

**Portão:** `## Linear` registrado no `projeto.md`; labels de workspace conferidas ou criadas; configurações manuais listadas.

Commit: `docs: time do Linear`.

---

## Fase 6 — Entrega

```bash
git push -u origin chore/speckit-setup
gh pr create --base develop --title "chore: preparação Spec Kit" --body-file .specify/memory/preparacao.md
```

Complete o `preparacao.md` com o log de todas as fases e responda ao humano com um relatório curto:
- o que foi removido e o que foi enxugado nos arquivos de instrução;
- o bloco de projeto do `AGENTS.md` (comandos e regras) e o tamanho final do arquivo;
- versão do Spec Kit e integrações instaladas;
- comandos de verificação e falhas pré-existentes;
- ambiente local: portas, banco isolado e cópia de dados (testados ou não suportados);
- pendências que dependem dele (CLIs ausentes, comandos quebrados, status e automações do Linear a configurar);
- link do PR.

**O Coordenador só pode rodar depois que este PR for mesclado na develop.**
Próximo passo sugerido: se o projeto não tem `docs/roadmap/ROADMAP.md`, rodar a skill `planejar-etapas` (modo Planejar ou Assumir) antes de despachar issues.
