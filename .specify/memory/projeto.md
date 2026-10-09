# Projeto — dados para o Coordenador
> Este arquivo é lido apenas pelo Coordenador, que repassa aos agentes de fase só o comando que cada fase precisa.

Medido em 2026-10-08, no Windows 11, Node 24, pnpm 11.20.0, a partir de `origin/develop` `a06d478` (já com o PR #58, `sharp` 0.35.5).
O código de `apps/` e `packages/` do commit testado é idêntico ao de `origin/develop` (`git diff` vazio);
a diferença são só arquivos do Spec Kit.

## Comandos de verificação
| Ação | Comando | Resultado em 2026-10-08 | Duração |
|---|---|---|---|
| Instalar | `pnpm install --frozen-lockfile` | ok | 3 s (cache local; ~12 s a frio) |
| Auditoria | `pnpm audit --prod --audit-level high` | ok — 6 moderadas e 1 alta já ignorada (`braces`) | 1 s |
| Lint | `pnpm lint` | ok — 4 tarefas Turbo | 4 s (cache do Turbo; ~18 s a frio) |
| Typecheck | `pnpm typecheck` | ok — 6 tarefas Turbo | 4 s (cache do Turbo; ~15 s a frio) |
| Testes | `pnpm test` | ok — 884 passaram, 75 ignorados, 0 falhas | 17 s |

Auditoria, lint, typecheck e testes são os mesmos comandos que o CI roda em PRs (`.github/workflows/ci.yml`).

## Linha de base — sobre `origin/develop` a06d478
Falhas que já existem antes de qualquer feature (não são responsabilidade das issues):
- Nenhuma falha determinística. Um teste é **intermitente**: `apps/api/test/dev-auth-producao.e2e.spec.ts` ›
  "fora de produção o atalho liga, mas o aviso aparece no log" estourou o timeout de 5 s numa execução da suíte
  completa (~7 s) e passou nas execuções seguintes (~2 s sozinho). Se falhar por timeout, rode o arquivo isolado
  (`pnpm exec vitest run test/dev-auth-producao.e2e.spec.ts`, em `apps/api`) antes de tratar como regressão.

## Comandos do CI que não foram executados localmente
Exigem Postgres, Redis, Ubuntu ou Chromium; o Coordenador não deve tratá-los como parte da linha de base local.
| Comando | Motivo |
|---|---|
| `pnpm build` | Compila, mas falha no Windows ao criar symlinks em `apps/web/.next/standalone` (`EPERM`) — **quebrado** localmente; o CI roda em Ubuntu. Medido em 2026-10-08 sobre `origin/main` `48883b0`; não repetido depois. |
| `pnpm test:db`, `pnpm --filter @plugga/api test:{jobs,bitrix,seed,integrations,atomicidade,eventos-pii,redis}` | **Não executado** — exigem Postgres e Redis. |
| `pnpm test:scripts`, `bash ops/*.test.sh` | **Não executado** — o CI roda em Ubuntu (usa `age`). |
| `pnpm test:e2e` | **Não executado** — exige serviços e Chromium. |

## Observação
Se `pnpm typecheck` acusar rotas que não existem mais, o `apps/web/.next/types` está obsoleto
(cache gerado, não versionado): apague-o e rode `pnpm --filter @plugga/web exec next typegen`.
