# AGENTS.md

Instruções para agentes de IA neste repositório. Leia apenas o código necessário para a tarefa.

## Projeto e comandos

Sistema operacional interno da Plugga / Waze Energia. Stack: TypeScript · Next.js · NestJS · PostgreSQL · Redis.
Usuário de teste local: `admin@plugga.local`; a senha vem de `SEED_ADMIN_PASSWORD` no `.env` local.

| Ação | Comando |
|---|---|
| Instalar dependências | `pnpm install --frozen-lockfile` |
| Subir PostgreSQL e Redis locais | `docker compose up -d --wait postgres redis` |
| Aplicar migrations | `pnpm db:migrate:deploy` |
| Seed local | `pnpm db:seed` |
| Subir aplicação | `pnpm dev` (web 3000; API 3001, configuráveis) |
| Lint | `pnpm lint` |
| Typecheck | `pnpm typecheck` |
| Testes | `pnpm test` |
| Build | `pnpm build` |
| Teste isolado da API | `pnpm --filter @plugga/api exec vitest run <arquivo>` |
| Teste isolado da web | `pnpm --filter @plugga/web exec node --test <arquivo>` |

## Trabalho

- O Linear é a fonte da verdade para projetos, issues e dependências. Não use milestones. O André definirá o novo método de trabalho por tarefa; não use OpenSpec, Spec Kit ou a antiga cadeia de papéis.
- Dúvida de negócio vira pergunta ao André. Preserve o escopo da tarefa; achados fora dele viram observação.
- Trabalhe em branch própria a partir da `develop` (hotfix a partir da `main`). Não commite em `main` ou `develop`, não force push nem rebase em branch compartilhada. Merge é do André.
- Use Conventional Commits em português. Ao abrir PR, descreva mudanças, verificações executadas e pendências reais.
- Antes de declarar código pronto, rode lint, typecheck, testes e build. Mudança de comportamento exige teste; não remova ou enfraqueça testes para fazê-los passar. Alteração apenas documental pode ser verificada pelo diff e pela CI.
- Mudanças de arquitetura, persistência, autenticação, integrações, auditoria ou jobs exigem ADR. Consulte `docs/adr/` e `docs/AGENT.md` para os limites existentes.

## Segurança e ambiente

- Não acesse ou altere produção nem integrações externas sem ADR aceita e aprovação explícita. Use dados sintéticos e serviços locais.
- Nunca registre `.env`, credenciais, tokens ou dados de clientes em commits, documentação, logs, PRs ou Linear.
- Preserve os limites do monorepo: aplicações podem importar `packages/*`; pacotes não importam aplicações; web e API se comunicam por HTTP e contratos de `packages/shared`.
- Não pare nem apague serviços, bancos, volumes ou arquivos de outro projeto/agente. Suíte pulada por falta de infraestrutura não conta como executada.
