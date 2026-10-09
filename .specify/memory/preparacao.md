# Preparação Spec Kit
- data: 2026-10-08
- base: `origin/develop` `cdf9e11` (PR para `develop`, conforme `docs/AGENT.md`)
- specify-cli: 1.1.2
- integração padrão: claude · instaladas: claude, codex
- extensões: bug

## Log
- F0 ok — repositório git, Python 3.14.7 (`python3` é o alias da Microsoft Store; `python` funciona), `uv` 0.12.13, Claude Code 2.1.288, Codex CLI 0.159.2, `gh` autenticado. A árvore do checkout original estava suja (arquivos não versionados), então o trabalho foi feito no worktree limpo `chore/speckit-setup`; o conteúdo sujo ficou guardado num stash local, sem descarte. A branch foi rebaseada sobre `origin/develop` sem conflitos.
- F1 ok — nada removido do repositório. O harness já presente (Spec Kit na `main`, constituição 1.0.0 e specs `001`–`003`) é histórico de produto referenciado por `docs/AGENT.md`; o humano escolheu preservá-lo. Não há `.zynox/`, BMAD, OpenSpec ou similares versionados. Arquivos de instrução: `AGENTS.md` (criado por uma tentativa anterior desta branch, com contexto do projeto) foi removido e o `CLAUDE.md` voltou ao conteúdo de `develop`. Nenhum conteúdo novo foi escrito nesses arquivos.
- F2 ok — Spec Kit atualizado da 1.1.1.dev0 para a 1.1.2 com `specify init --here --force --non-interactive --integration claude --script sh`, `specify integration install codex --script sh` e `specify extension add bug` (v1.0.0). `specify integration status --json`: padrão `claude`, `claude` e `codex` instalados, zero arquivos ausentes. Status `warning` explicado: 10 arquivos gerenciados do Codex aparecem como "modificados" porque `core.autocrlf=true` no Windows os regravou com CRLF; o conteúdo versionado (LF) confere com o hash do manifesto. Não é modificação real. As 11 skills exigidas (`speckit-constitution`, `-specify`, `-clarify`, `-plan`, `-tasks`, `-analyze`, `-implement`, `-converge`, `-bug-assess`, `-bug-fix`, `-bug-test`) existem em `.claude/skills/` e em `.agents/skills/`.
- F3 ok — a constituição 1.0.0, ratificada em 2026-10-05 na `main`, foi preservada por escolha do humano. Cada princípio cita ADR, `docs/AGENT.md` ou CI. `grep -nE '\[[A-Z_]+\]' .specify/memory/constitution.md` não retorna nada.
- F4 ok — `.specify/memory/projeto.md` criado a partir de nova medição em `origin/develop`: instalação, lint e typecheck passam; `pnpm test` tem 1 falha intermitente (timeout de 5 s no `dev-auth-producao.e2e.spec.ts` sob carga; passa sozinho em ~2 s). Substitui o `baseline.md` da tentativa anterior, que fora medido antes do rebase. `pnpm build` quebra localmente no Windows (`EPERM` em symlinks); build, auditoria, suítes com Postgres/Redis e E2E não foram executados localmente e estão listados em `projeto.md`.
- F5 pendente de merge — PR aberto contra `develop`. O Coordenador só roda depois que ele for mesclado.
