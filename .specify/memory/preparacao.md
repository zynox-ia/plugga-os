# Preparação Spec Kit

- data: 2026-10-08
- base atualizada: `origin/main` `48883b053df802709d00c0841036dbb6fe70e42d`
- specify-cli: 1.1.2
- integração padrão: claude · instaladas: claude, codex
- extensões: bug

## Log

- F0 ok — worktree limpa `chore/speckit-setup` criada a partir da `main` local e, após pedido humano para atualizar a base, rebaseada sobre `origin/main` `48883b0`. `python3 --version` encontrou o alias da Microsoft Store; `python --version` e `py --version` confirmaram Python 3.14.7. `uv` 0.12.13, Claude Code 2.1.288, Codex CLI 0.159.2 e `gh auth status` autenticado.
- F1 ok — inventário refeito na Main atual. Main já tinha Spec Kit 1.1.1.dev0, integração Claude, constituição e specs históricas `001`–`003`; não há `.zynox/` versionado nem referência ao Kernel em `apps/` ou `packages/`. A decisão entre remover ou preservar os artefatos existentes foi apresentada ao humano; ele escolheu preservá-los porque são histórico de produto (`docs/AGENT.md`). Nenhum artefato da Main foi removido; a instalação existente foi atualizada para Spec Kit 1.1.2.
- F2 ok — `uv tool install specify-cli --no-progress`, `specify version`, `specify self check`, `specify init --here --force --non-interactive --integration claude --script sh`, `specify integration install codex --script sh` e `specify extension add bug` executados. Após atualizar a base, `specify integration upgrade codex --force --script sh` alinhou os arquivos gerenciados; `specify integration status --json` final retornou `ok`, padrão Claude, Claude/Codex instalados, zero arquivos ausentes/modificados e zero findings. Skills SDD e bug existem nas duas pastas; `.specify/memory/` e `.specify/templates/` existem.
- F3 ok — `AGENTS.md` atualizado com o contexto da Main `48883b0`; `CLAUDE.md` aponta para `@AGENTS.md`. Instalação congelada, lint, typecheck e testes passaram. O typecheck precisou de remoção controlada do cache gerado obsoleto `apps/web/.next/types` e `next typegen`. Build local compilou, mas falhou ao criar symlink no Windows (`EPERM`); CI executa em Ubuntu. Fluxo local com Docker e E2E não foram executados.
- F4 ok — constituição `1.0.0` já existente na Main foi preservada por escolha humana; nenhum marcador de template foi encontrado e os princípios estão documentados em ADRs, `docs/AGENT.md` e CI. Ratificada em 2026-10-05 na Main.
- F5 ok — `.specify/memory/baseline.md` registra lint PASS, typecheck PASS e testes PASS em `94684c11af72a09464063b86d4e8a72949f240d0`, sobre a base `origin/main` `48883b053df802709d00c0841036dbb6fe70e42d`; nenhuma falha preexistente nos três gates.
- F6 pendente — ferramenta MCP do Linear não está disponível nesta sessão. A solicitação de instalação do plugin Linear ainda aguarda confirmação; time, projeto, status e labels não foram verificados nem presumidos.
- F7 pendente — push e PR aguardam a conclusão do portão F6.
