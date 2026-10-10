# Prompt mestre — instalar ou atualizar, preparar e planejar (v7)

> O primeiro e único prompt para colocar um repositório de cliente no fluxo, seja ele novo ou existente. André cola num **agente novo** do Traycer, na pasta principal do repositório:
> ```
> Leia https://raw.githubusercontent.com/zynox-ia/dev-workflow/main/docs/fluxo/04-atualizar-fluxo.md e siga as instruções neste repositório.
> ```
> Rode sempre a partir do central (o link do `raw` na `main`), nunca a cópia local de `docs/fluxo/`: a cópia local pode ser de uma versão antiga.
> Repositório central (público): `https://github.com/zynox-ia/dev-workflow`

---

## Seu papel

Você **lê o repositório, diz o que existe e o que falta, e faz só o que falta**, nesta ordem:

| Etapa | Se não existe | Se existe |
|---|---|---|
| **A. Fluxo** (`docs/fluxo/`, skills, `AGENTS.md`, guia de modelos) | Instala a última versão | Atualiza se houver versão mais nova, com as migrações `[04]`; em dia → nada |
| **B. Casa** (Spec Kit, constituição, comandos, ambiente, Linear) | Prepara do zero (`01-preparacao-da-casa.md` inteiro) | Confere os portões e refaz **só as fases que falham** |
| **C. Planejamento** (`docs/roadmap/`, projetos e specs no Linear) | Planeja (`planejar-etapas`, modo A ou C) | Audita (modo B) e mostra onde estamos |

A e B saem num **PR único**; C sai no PR do roadmap. Você para só nos pontos do André: aprovação do plano de ação, respostas, merges.

Você **não** altera código da aplicação. Atualizar o fluxo **não reinstala** nada que já esteja certo: Spec Kit, constituição, `projeto.md`, banco e Linear só mudam se o diagnóstico mostrar que a fase correspondente falha, ou se uma migração `[04]` pedir.

## Regras
1. Árvore limpa antes de começar; nada é descartado.
   **Repositório vazio** (sem nenhum commit): crie um `README.md` com o nome do projeto, faça o commit `chore: início do repositório` na `main` e publique (`git push -u origin main`) antes de seguir.
2. Trabalhe numa branch só, criada a partir de `origin/develop`: `chore/fluxo-v<versão>` quando a etapa A instala ou atualiza; `chore/speckit-setup` quando só a etapa B tem o que fazer. Se não existir `develop`, crie-a a partir da `main` e publique (`git branch develop origin/main && git push -u origin develop`).
3. O merge é do André.

---

## Passo 0 — Diagnóstico (somente leitura)
```bash
git rev-parse --verify HEAD >/dev/null 2>&1 || echo "REPO VAZIO"
git status --porcelain                                           # precisa estar vazio
git fetch origin; git rev-parse --verify origin/develop >/dev/null 2>&1 || echo "SEM DEVELOP"
cat docs/fluxo/VERSION 2>/dev/null || echo "FLUXO NÃO INSTALADO"
git ls-remote --tags --refs https://github.com/zynox-ia/dev-workflow.git | sed 's#.*refs/tags/v##' | sort -V | tail -1
ls package.json pyproject.toml composer.json go.mod Gemfile pom.xml 2>/dev/null || echo "SEM MANIFESTO (projeto novo)"
# Casa — cada linha corresponde a uma fase do 01-preparacao-da-casa.md
test -f .specify/memory/preparacao.md            || echo "F1 pendente (limpeza inicial)"
specify integration status --json 2>/dev/null    || echo "F2 pendente (Spec Kit)"
test -f .claude/skills/speckit-specify/SKILL.md -a -f .agents/skills/speckit-specify/SKILL.md || echo "F2 pendente (skills do Spec Kit)"
test -f .specify/memory/constitution.md && ! grep -qE '\[[A-Z_]+\]' .specify/memory/constitution.md || echo "F3 pendente (constituição)"
grep -q '## Ambiente local' .specify/memory/projeto.md 2>/dev/null && grep -q '^branch_base: develop' .specify/memory/projeto.md || echo "F4 pendente (projeto.md)"
sed -n '/<!-- projeto:inicio/,/<!-- projeto:fim -->/p' AGENTS.md 2>/dev/null | grep -q '<comando>\|<Uma linha' && echo "F4 pendente (AGENTS.md)"
grep -q '## Linear' .specify/memory/projeto.md 2>/dev/null || echo "F5 pendente (Linear)"
test -f docs/roadmap/ROADMAP.md && echo "ROADMAP EXISTE" || echo "SEM ROADMAP"
```
Árvore suja → mostre os arquivos e pergunte ao André; não descarte nada.

**Plano de ação.** Mostre ao André e espere o ok:
```
🔎 Diagnóstico — <repositório>
Repositório: <vazio | com código (<stack do manifesto>) | sem código>
A. Fluxo:  <não instalado → instalar v<última> | v<atual> → atualizar para v<última> | em dia (v<atual>)>
B. Casa:   <não preparada → preparação completa | fases pendentes: F2, F4… | pronta>
C. Plano:  <sem roadmap → planejar (modo A | C) | roadmap existe → auditar>
Vou: <lista curta, na ordem>. Pontos em que vou parar para você: <...>
```
Tudo em dia (A em dia, B pronta, roadmap existe) → rode só a auditoria (Passo 12) e termine (Passo 13).

## Passo 1 — Versões
Use o resultado do Passo 0. **Repositório vazio:** crie o `README.md`, commit `chore: início do repositório` na `main`, `git push -u origin main`. **Sem develop:** `git branch develop origin/main && git push -u origin develop`.
```bash
git status --porcelain                           # precisa estar vazio
git fetch origin
cat docs/fluxo/VERSION 2>/dev/null || echo "não instalado"
git ls-remote --tags --refs https://github.com/zynox-ia/dev-workflow.git | sed 's#.*refs/tags/##' | sort -V | tail -5
```
- Versão alvo: a pedida pelo André, ou a última tag `vX.Y.Z` do central.
- Já está na versão alvo → pule para o Passo 10 (a etapa A não tem nada a fazer).

## Passo 2 — Baixar a versão alvo
```bash
TMP="$(mktemp -d)"
git clone --quiet --depth 1 --branch v<versão> https://github.com/zynox-ia/dev-workflow.git "$TMP/fluxo"
```
Se o `$TMP/fluxo/docs/fluxo/04-atualizar-fluxo.md` for diferente deste arquivo, **siga ele** a partir do Passo 3: é o 04 da versão alvo.

## Passo 3 — Mostrar o que muda (antes de aplicar)
- Leia em `$TMP/fluxo/docs/fluxo/CHANGELOG.md` as entradas entre a versão instalada e a alvo.
- Liste ao André: o que mudou e a **"Ação necessária nos projetos"** de cada versão, separando o que **você** executa (itens marcados `[04]`, no Passo 7) do que fica com ele.
- Mudança de **MAJOR** (ex.: 1.x → 2.0): peça confirmação antes de seguir.

## Passo 4 — Aplicar
```bash
git checkout -b chore/fluxo-v<versão> origin/develop
rm -rf docs/guias docs/fluxo
mkdir -p docs
cp -R "$TMP/fluxo/docs/guias" "$TMP/fluxo/docs/fluxo" docs/
test -f docs/README.md || cp "$TMP/fluxo/docs/README.md" docs/README.md
```
Se `docs/README.md` já existir e não for o do fluxo (outro conteúdo do projeto), não sobrescreva: acrescente ao final uma seção "Fluxo de desenvolvimento" com os links para `guias/` e `fluxo/`.

## Passo 5 — Instalar as skills do fluxo para os dois agentes
Para cada pasta em `docs/fluxo/skills/` (hoje: `planejar-etapas`, `registrar-linear`):
```bash
for s in docs/fluxo/skills/*/; do
  n=$(basename "$s")
  for d in .claude/skills .agents/skills; do
    rm -rf "$d/$n" && mkdir -p "$d" && cp -R "$s" "$d/$n"
  done
done
```
Só as pastas com esses nomes são substituídas; as skills do Spec Kit e outras ficam intactas.
Assim, no Traycer, o André invoca `/registrar-linear` (Claude Code) ou `$registrar-linear` (Codex) em qualquer agente deste projeto.

## Passo 6 — `AGENTS.md`, `CLAUDE.md` e guia de modelos
O `AGENTS.md` tem dois blocos: `projeto` (do time, escrito pela preparação) e `dev-workflow` (deste fluxo). Você só substitui o bloco `dev-workflow`.
```bash
M=docs/fluxo/modelos/AGENTS.md
sed -n '/<!-- dev-workflow:inicio/,/<!-- dev-workflow:fim -->/p' "$M" > "$TMP/bloco.md"

if [ ! -f AGENTS.md ]; then
  cp "$M" AGENTS.md                                   # projeto novo: a preparação preenche o bloco projeto
elif grep -q '<!-- dev-workflow:inicio' AGENTS.md; then
  awk -v f="$TMP/bloco.md" '
    /<!-- dev-workflow:inicio/ { while ((getline l < f) > 0) print l; skip = 1; next }
    /<!-- dev-workflow:fim -->/ { skip = 0; next }
    !skip' AGENTS.md > AGENTS.md.tmp && mv AGENTS.md.tmp AGENTS.md
else
  { cat AGENTS.md; echo; sed -n '/<!-- projeto:inicio/,/<!-- projeto:fim -->/p' "$M"; echo; cat "$TMP/bloco.md"; } > AGENTS.md.tmp \
    && mv AGENTS.md.tmp AGENTS.md                     # AGENTS.md antigo: o conteúdo fica; a preparação (Fases 1 e 4) consolida
fi

mkdir -p .traycer && cp docs/fluxo/modelos/agent-selection-guide.md .traycer/agent-selection-guide.md   # modelo de cada papel

test -f CLAUDE.md || printf '@AGENTS.md\n' > CLAUDE.md
grep -qxF '@AGENTS.md' CLAUDE.md || { printf '@AGENTS.md\n\n' | cat - CLAUDE.md > CLAUDE.md.tmp && mv CLAUDE.md.tmp CLAUDE.md; }
```
Se o bloco `projeto` ainda tiver marcadores do modelo (`<comando>`) depois das migrações (Passo 7), avise na resposta final que falta rodar a preparação (`01-preparacao-da-casa.md`).

## Passo 7 — Migrações
Para cada versão entre a instalada (exclusive) e a alvo (inclusive), em ordem, execute os itens marcados **`[04]`** da "Ação necessária nos projetos" do `CHANGELOG.md`. Eles são mudanças em arquivos do projeto que não exigem rodar a preparação de novo.
- Use só o que já está no repositório. Não rode instalações, testes nem o Spec Kit, salvo se o item pedir.
- Faltou informação para um item → registre como pendência e siga; não invente.
- Um commit por versão migrada: `chore(fluxo): migração v<versão>`.

Os itens sem `[04]` (ações no Linear, skills pessoais, decisões) vão na resposta final para o André.

## Passo 8 — Conferir
```bash
cat docs/fluxo/VERSION                          # = versão alvo
test -f docs/fluxo/00-convencoes.md && test -f docs/guias/02-linear.md
ls .claude/skills .agents/skills | grep -E "planejar-etapas|registrar-linear"
diff <(sed -n '/<!-- dev-workflow:inicio/,/<!-- dev-workflow:fim -->/p' AGENTS.md) "$TMP/bloco.md"   # sem diferenças
grep -c '<!-- dev-workflow:inicio' AGENTS.md    # 1
grep -qxF '@AGENTS.md' CLAUDE.md
cmp docs/fluxo/modelos/agent-selection-guide.md .traycer/agent-selection-guide.md
git status --short -uall | grep -vE "^( M|\?\?|A |D | D) (docs/|\.claude/skills/|\.agents/skills/|AGENTS\.md|CLAUDE\.md|\.traycer/agent-selection-guide\.md|\.specify/memory/projeto\.md)" || true   # nada fora do permitido (projeto.md só se uma migração pediu)
```

## Passo 9 — Registrar a etapa A
```bash
git add docs .claude/skills .agents/skills AGENTS.md CLAUDE.md .traycer/agent-selection-guide.md
git commit -m "chore(fluxo): instalar|atualizar para v<versão>"
rm -rf "$TMP"
```
Não abra o PR ainda: a etapa B entra na mesma branch.

## Passo 10 — Etapa B: preparar a casa
Na **mesma branch** (ou em `chore/speckit-setup`, se a etapa A não teve nada), siga `docs/fluxo/01-preparacao-da-casa.md` **chamado pelo prompt mestre**:
- **Casa não preparada** (`F1 pendente`): o 01 inteiro, da Fase 0 à Fase 5.
- **Casa preparada com fases pendentes:** só as fases apontadas no diagnóstico (F2, F3, F4 ou F5), cada uma até o seu portão. A Fase 1 (limpeza do harness antigo) nunca roda de novo numa casa já preparada.
- **Casa pronta:** nada.
O 01 não cria branch nem abre PR quando é chamado por você.

## Passo 11 — PR único das etapas A e B
```bash
git push -u origin <branch>
gh pr create --base develop --title "chore(fluxo): <instalar|atualizar> v<versão> e preparar a casa" --body "<o que mudou no fluxo · fases da casa feitas · ações do André>"
```
(Só a etapa A → título `chore(fluxo): atualizar para v<versão>`. Só a B → `chore: preparação Spec Kit`.)
Diga ao André: `PR aberto: <link>. Faça o merge e me responda "mesclei".` e espere. Com `mesclei`: confira o merge (`gh pr view <n> --json state`) e `git checkout develop && git pull --ff-only origin develop`.
Liste junto as **ações do André** que não são arquivo: configurações do Linear, skill `/nova-issue`, guidance, pendências da preparação.

## Passo 12 — Etapa C: planejamento
- **Sem roadmap:** siga a skill `docs/fluxo/skills/planejar-etapas/SKILL.md`, modo **A — Planejar** (sem código ou repositório vazio) ou **C — Assumir** (com código), até o André aprovar e mesclar o PR do roadmap. Projeto novo: a primeira spec é sempre `[INFRA] Spec 001 — Fundação do projeto`; mova-a para **Ready** com o ok do André.
- **Com roadmap:** modo **B — Auditar**. Mostre o relatório B3; havendo achados de higiene, ofereça o passo B4 (corrigir com o ok do André).

## Passo 13 — Fechar
```
✅ Casa pronta · fluxo v<versão>
Fila: <issues em Ready, ou "mova para Ready o que vem primeiro">
Para trabalhar, num agente novo (Terra Medium):
Siga docs/fluxo/02-condutor.md. Modo: manual
```
