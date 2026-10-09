# Preparação Spec Kit

- data: 2026-10-09
- specify-cli: 1.1.2
- integração padrão: claude · instaladas: claude, codex
- extensões: bug
- branch: `chore/speckit-setup-v2`, agora baseada em `origin/develop` `46b623f`; o sufixo preserva `chore/speckit-setup`, já mesclada no PR #57 e ocupada por outro worktree.

## Log

- F0 ok — repositório Git limpo; Python 3.14.7 via `python` (`python3` aponta para o alias da Microsoft Store), uv 0.12.13, Claude Code 2.1.288, Codex CLI 0.159.2, GitHub CLI autenticado e Docker 29.8.0 disponíveis; branch local rebaseada sobre `origin/develop` com fluxo v1.3.0.
- F1 ok — removidos `.specify/`, as skills `speckit-*` antigas e as instruções antigas do `CLAUDE.md`; preservadas todas as pastas `specs/` por decisão do André, pois `specs/002-fundacao-solida/contracts/inventario-rotas.json` é usado por testes e scripts.
- F2 ok — Spec Kit 1.1.2 instalado para Claude e Codex, extensão `bug` adicionada; as 11 skills obrigatórias estão nas duas integrações. Após o checkout no Windows, `specify integration status --json` mostra `warning` para 32 arquivos por CRLF: todos os hashes batem com os manifestos após normalizar CRLF para LF; nenhum arquivo gerenciado está ausente e o Git está limpo.
- F3 ok — constituição v1.0.0 criada a partir de README, ADRs, CI e `package.json`; sem marcadores de template e sem hooks de extensão configurados.
- F4 ok — instalar, lint, typecheck e testes passaram na medição original; o código da aplicação não mudou entre `e88d19f` e `46b623f`. `DATABASE_URL` no `.env` ignorado foi alinhada à senha já configurada no Postgres local; `migrate status` confirmou autenticação e esquema em dia. Uma cópia local de 172463 bytes foi feita com `pg_dump`/`pg_restore` para `plugga-os-d01` em 55433; `db:migrate:deploy` e `db:seed` passaram nessa cópia. API em 3101 respondeu 200 em `/health`; web em 3100 respondeu 307 para login. Servidores encerrados e o stack isolado removido com volume.
