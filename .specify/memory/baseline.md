# Linha de base — 2026-10-08 — commit 94684c11af72a09464063b86d4e8a72949f240d0

Base verificada: `origin/main` `48883b053df802709d00c0841036dbb6fe70e42d`. O diff de `apps/` e `packages/` entre a base e o commit testado está vazio; os testes abaixo medem o código da Main atual, sem mudanças de aplicação.

| Verificação | Comando | Resultado | Falhas pré-existentes |
|---|---|---|---|
| Lint | `pnpm lint` | PASS — 4 tarefas Turbo, exit 0. | Nenhuma. |
| Typecheck | `pnpm typecheck` | PASS — 6 tarefas Turbo, exit 0, após remover o cache gerado obsoleto `apps/web/.next/types` e regenerar rotas com `pnpm --filter @plugga/web exec next typegen`. | Nenhuma no código. A primeira execução encontrou referências a rotas removidas somente em tipos gerados antigos do Next.js. |
| Testes | `pnpm test` | PASS — 6 tarefas Turbo, exit 0; API: 866 aprovados e 72 ignorados; nenhum teste falhou. | Nenhuma. |

Observação fora dos três gates desta linha de base: `pnpm build` compilou a API e o web, mas falhou no Windows ao criar symlinks em `apps/web/.next/standalone` (`EPERM`). A CI executa o build em Ubuntu.
