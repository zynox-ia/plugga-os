# Prompt 4 — Instalar ou atualizar o fluxo (v2)

> Rode num **agente novo** do Traycer, na pasta principal de um repositório de cliente, para:
> - **instalar** o fluxo num projeto que ainda não tem `docs/fluxo/`; ou
> - **atualizar** o fluxo para uma versão nova do repositório central.
>
> Repositório central (público): `https://github.com/zynox-ia/dev-workflow`

---

## Seu papel

Você copia `docs/guias/` e `docs/fluxo/` do repositório central para este projeto, na versão pedida, instala as skills do fluxo para os dois agentes, atualiza o bloco `dev-workflow` do `AGENTS.md` e entrega tudo num PR para a develop. Você **não** altera código da aplicação, `docs/roadmap/`, `.specify/`, o bloco `projeto` do `AGENTS.md` nem nada fora do que este prompt lista.

## Regras
1. Árvore limpa antes de começar; nada é descartado.
2. Trabalhe na branch `chore/fluxo-v<versão>`, criada a partir de `origin/develop`. Se não existir `develop`, crie-a a partir da `main` e publique (`git branch develop origin/main && git push -u origin develop`).
3. O merge é do André.

---

## Passo 1 — Versões
```bash
git status --porcelain                           # precisa estar vazio
git fetch origin
cat docs/fluxo/VERSION 2>/dev/null || echo "não instalado"
git ls-remote --tags --refs https://github.com/zynox-ia/dev-workflow.git | sed 's#.*refs/tags/##' | sort -V | tail -5
```
- Versão alvo: a pedida pelo André, ou a última tag `vX.Y.Z` do central.
- Já está na versão alvo → informe e encerre.

## Passo 2 — Baixar a versão alvo
```bash
TMP="$(mktemp -d)"
git clone --quiet --depth 1 --branch v<versão> https://github.com/zynox-ia/dev-workflow.git "$TMP/fluxo"
```

## Passo 3 — Mostrar o que muda (antes de aplicar)
- Leia em `$TMP/fluxo/docs/fluxo/CHANGELOG.md` as entradas entre a versão instalada e a alvo.
- Liste ao André: o que mudou e, principalmente, a **"Ação necessária nos projetos"** de cada versão.
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

## Passo 6 — `AGENTS.md` e `CLAUDE.md`
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

test -f CLAUDE.md || printf '@AGENTS.md\n' > CLAUDE.md
grep -qxF '@AGENTS.md' CLAUDE.md || { printf '@AGENTS.md\n\n' | cat - CLAUDE.md > CLAUDE.md.tmp && mv CLAUDE.md.tmp CLAUDE.md; }
```
Se o bloco `projeto` ainda tiver marcadores do modelo (`<comando>`), avise na resposta final que falta rodar a preparação (`01-preparacao-da-casa.md`) ou, num projeto já preparado, as seções 4.3 e 4.5 dela.

## Passo 7 — Conferir
```bash
cat docs/fluxo/VERSION                          # = versão alvo
test -f docs/fluxo/00-convencoes.md && test -f docs/guias/02-linear.md
ls .claude/skills .agents/skills | grep -E "planejar-etapas|registrar-linear"
diff <(sed -n '/<!-- dev-workflow:inicio/,/<!-- dev-workflow:fim -->/p' AGENTS.md) "$TMP/bloco.md"   # sem diferenças
grep -c '<!-- dev-workflow:inicio' AGENTS.md    # 1
grep -qxF '@AGENTS.md' CLAUDE.md
git status --short | grep -vE "^( M|\?\?|A |D | D) (docs/|\.claude/skills/|\.agents/skills/|AGENTS\.md|CLAUDE\.md)" || true   # nada fora do permitido
```

## Passo 8 — Entregar
```bash
git add docs .claude/skills .agents/skills AGENTS.md CLAUDE.md
git commit -m "chore(fluxo): atualizar para v<versão>"
git push -u origin chore/fluxo-v<versão>
gh pr create --base develop --title "chore(fluxo): atualizar para v<versão>" --body "<resumo do changelog e ações necessárias>"
rm -rf "$TMP"
```
Responda ao André: versão anterior → nova, link do PR e a lista de **ações necessárias** (por exemplo: rodar uma fase da preparação, mudar algo no Linear).
