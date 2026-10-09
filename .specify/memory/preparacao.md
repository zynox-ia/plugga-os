# Preparação Spec Kit

- data: 2026-10-08
- specify-cli: 1.1.2
- integração padrão: claude · instaladas: claude, codex
- extensões: bug

## Log

- F0 ok — worktree limpa `chore/speckit-setup` criada a partir de `main` (commit `a356d95755c38b62efa1ee25d7c07d27b5ba5ec6`); Python 3.14.7 via `python --version` e `py --version` (o alias `python3 --version` apontou para a Microsoft Store); uv 0.12.13; Claude Code 2.1.288; Codex CLI 0.159.2; `gh auth status` autenticado.
- F1 ok — inventário na branch `main`: nenhum harness/spec framework antigo versionado encontrado; nenhuma referência em `apps/` ou `packages/`; mantidos workflows de CI, documentação do produto (`SPEC.md`, `tasks/`) e guia de arquitetura (`docs/AGENT.md`). Nada removido; sem commit de remoção porque não houve mudança nessa fase.
- F2 ok — `uv tool install specify-cli --no-progress`, `specify version` e `specify self check` executados; CLI 1.1.2; `specify integration status --json` retornou `ok`, Claude padrão, Claude e Codex instalados; extensão bug registrada para ambos; skills e diretórios `.specify/memory/` e `.specify/templates/` verificados.
- F3 ok — `AGENTS.md` criado com stack, mapa, convenções, variáveis e comandos baseados em arquivos do projeto. `pnpm install --frozen-lockfile`, `pnpm lint` e `pnpm typecheck` passaram; `pnpm test` falhou em 2 casos de `packages/auditoria-oraculo/src/manifesto.test.ts`; `pnpm build` falhou ao criar symlinks no Windows (`EPERM`); `corepack enable` também falhou por permissão. `pnpm dev` não foi executado porque inicia os serviços locais Docker.
- F4 ok — `.specify/memory/constitution.md` criada como v1.0.0 a partir de princípios sustentados por ADRs, `docs/AGENT.md` e CI; template resolvido, hooks verificados (nenhum), zero marcadores de template. A ratificação fica pendente da aprovação humana do PR.
