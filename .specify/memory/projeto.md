# Projeto — dados para o Coordenador
> Este arquivo é lido apenas pelo Coordenador, que repassa aos agentes de fase só o comando que cada fase precisa.

Medido em 2026-10-08, no Windows 11, Node 24, pnpm 11.20.0, a partir de `origin/develop` `cdf9e11`.
O código de `apps/` e `packages/` do commit testado é idêntico ao de `origin/develop` (`git diff` vazio);
a diferença são só arquivos do Spec Kit.

## Comandos de verificação
| Ação | Comando | Resultado em 2026-10-08 | Duração |
|---|---|---|---|
| Instalar | `pnpm install --frozen-lockfile` | ok | 12 s |
| Lint | `pnpm lint` | ok — 4 tarefas Turbo | 18 s |
| Typecheck | `pnpm typecheck` | ok — 6 tarefas Turbo | 15 s |
| Testes | `pnpm test` | 883 passaram, 1 falhou, 75 ignorados (API); config, shared e web sem falhas | 29 s |

Lint, typecheck e testes são os mesmos comandos que o CI roda em PRs (`.github/workflows/ci.yml`).

## Linha de base — commit 578fedd (sobre `origin/develop` cdf9e11)
Falhas que já existem antes de qualquer feature (não são responsabilidade das issues):
- `apps/api/test/dev-auth-producao.e2e.spec.ts` › "fora de produção o atalho liga, mas o aviso aparece no log" —
  estourou o timeout de 5 s na suíte completa (levou ~7 s). Rodando o arquivo sozinho
  (`pnpm exec vitest run test/dev-auth-producao.e2e.spec.ts`, em `apps/api`) passa em ~2 s.
  Intermitente sob carga; não é regressão de código.

## Comandos do CI que não foram executados localmente
Exigem Postgres, Redis, Ubuntu ou Chromium; o Coordenador não deve tratá-los como parte da linha de base local.
| Comando | Motivo |
|---|---|
| `pnpm build` | Compila, mas falha no Windows ao criar symlinks em `apps/web/.next/standalone` (`EPERM`) — **quebrado** localmente; o CI roda em Ubuntu. Medido em 2026-10-08 sobre `origin/main` `48883b0`, antes do rebase. |
| `pnpm audit --prod --audit-level high` | Não executado (depende de rede). |
| `pnpm test:db`, `pnpm --filter @plugga/api test:{jobs,bitrix,seed,integrations,atomicidade,eventos-pii,redis}` | **Não executado** — exigem Postgres e Redis. |
| `pnpm test:scripts`, `bash ops/*.test.sh` | **Não executado** — o CI roda em Ubuntu (usa `age`). |
| `pnpm test:e2e` | **Não executado** — exige serviços e Chromium. |

## Observação
Se `pnpm typecheck` acusar rotas que não existem mais, o `apps/web/.next/types` está obsoleto
(cache gerado, não versionado): apague-o e rode `pnpm --filter @plugga/web exec next typegen`.
