# Preparação Spec Kit

- data: 2026-10-09
- specify-cli: 1.1.2
- integração padrão: claude · instaladas: claude, codex
- extensões: bug
- branch: `chore/speckit-setup-v2`, criada de `origin/develop` `e88d19f`; o sufixo foi necessário porque `chore/speckit-setup` já existe e está em outro worktree.

## Log

- F0 ok — repositório Git limpo; Python 3.14.7, uv 0.12.13, Claude Code 2.1.288, Codex CLI 0.159.2, GitHub CLI autenticado e Docker 29.8.0 disponíveis; fluxo v1.1.0 presente em `develop`.
- F1 ok — removidos `.specify/`, as skills `speckit-*` antigas e as instruções antigas do `CLAUDE.md`; preservadas todas as pastas `specs/` por decisão do André, pois `specs/002-fundacao-solida/contracts/inventario-rotas.json` é usado por testes e scripts.
- F2 ok — Spec Kit 1.1.2 instalado para Claude e Codex, extensão `bug` adicionada; `specify integration status --json` retornou `ok` e as 11 skills obrigatórias estão presentes nas duas integrações.
