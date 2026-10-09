# Linha de base — 2026-10-08 — commit 5e79275ee4ddd4e2de0daa7e43f8d20396754642

Base `main`: `a356d95755c38b62efa1ee25d7c07d27b5ba5ec6`. O diff até o commit testado contém apenas Spec Kit e documentação; `apps/` e `packages/` não mudaram.

| Verificação | Comando | Resultado | Falhas pré-existentes |
|---|---|---|---|
| Lint | `pnpm lint` | PASS — 5/5 pacotes, exit 0 | Nenhuma. |
| Typecheck | `pnpm typecheck` | PASS — 7/7 tarefas, exit 0 | Nenhuma. Na primeira execução sem cache, Turbo avisou que `@plugga/config#build` não declara arquivos de saída. |
| Testes | `pnpm test` | FAIL — exit 1; Turbo reportou 5 tarefas bem-sucedidas e `@plugga/auditoria-oraculo#test` falhou | `packages/auditoria-oraculo/src/manifesto.test.ts`: `cobre os 141 arquivos normativos e confere com a árvore` e `o arquivo em disco é exatamente o que o gerador produz`. O pacote registrou 30 testes aprovados e 2 reprovados; os hashes do manifesto congelado divergem da árvore atual. |
