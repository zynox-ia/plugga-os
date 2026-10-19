# AGENTS.md

Instruções para agentes de IA neste repositório. Este arquivo contém regras e comandos; leia apenas o código necessário para a tarefa.

## Projeto

Sistema operacional interno da Plugga / Waze Energia. Stack: TypeScript · Next.js · NestJS · PostgreSQL · Redis.
Usuário de teste: a definir; o seed não registra senha de desenvolvimento.
Planejamento: projetos, issues e dependências no Linear, sem marcos/milestones. Decisão do André em 2026-10-18.

## Comandos

| Ação | Comando |
|---|---|
| Instalar dependências | `pnpm install --frozen-lockfile` |
| Subir serviços locais | `docker compose up -d` |
| Migrations locais | `pnpm db:migrate` |
| Seed sintético | `pnpm db:seed` |
| Subir aplicação | `pnpm dev` (web 3000; API 3001) |
| Lint | `pnpm lint` |
| Typecheck | `pnpm typecheck` |
| Testes | `pnpm test` |
| Build | `pnpm build` |
| Teste isolado da API | `pnpm --filter @plugga/api exec vitest run <arquivo>` |
| Teste isolado da web | `pnpm --filter @plugga/web exec node --test <arquivo>` |

## Regras do projeto

- Leia `.specify/memory/constitution.md` antes de mudar código. Mudanças de arquitetura, persistência, autenticação, integrações, auditoria ou jobs exigem ADR.
- Não acesse nem altere sistemas externos ou produção sem ADR aceita e aprovação explícita, conforme a constituição. Use apenas dados sintéticos ou banco local de teste.
- Preserve os limites do monorepo: `apps/*` pode importar `packages/*`; pacotes não importam aplicações; web e API se comunicam por HTTP e contratos de `packages/shared`.
- Nunca registre `.env`, credenciais, tokens ou dados de clientes em commits, documentação, logs, PRs ou Linear.
- Não retome marcos Alpha/Beta/GA nem a condução por papéis de `docs/fluxo/`. Essas regras são legado até serem atualizadas.

## Fluxo de trabalho

Spec-Driven Development com GitHub Spec Kit. Sem papéis fixos, time obrigatório de agentes ou Condutor. Toda mudança que não é pequena passa pelo Spec Kit; não escreva `spec.md`, `plan.md` ou `tasks.md` à mão fora dele.

### Antes de mudar código

- Leia só o código que a tarefa exige e faça apenas o que a issue ou spec pede. Fora do escopo vira observação no PR.
- Dúvida de negócio vira pergunta ao André; não resolva por suposição.

### Spec Kit

- Specs em `specs/NNN-<slug>/` (`spec.md`, `plan.md`, `tasks.md`); feature ativa em `.specify/feature.json`.
- Sequência: `speckit-specify` → `speckit-clarify` (se houver dúvida real) → `speckit-plan` → `speckit-tasks` → `speckit-analyze` → `speckit-implement`. No Codex, use `$speckit-<comando>`; no Claude Code, `/speckit-<comando>`.
- Bugs: `speckit-bug-assess`, `speckit-bug-fix`, `speckit-bug-test`. Mudança pequena de texto, tela ou correção óbvia dispensa spec; mudança de comportamento exige teste.
- Tarefas `[P]` em arquivos distintos podem ser delegadas a subagentes em paralelo. Só o agente principal commita. Mudanças em arquivos compartilhados são serializadas.

### Git e pasta base

- Nunca commite em `main` ou `develop`; nunca use `push --force` nem rebase em branch compartilhada. Merge é do André.
- Trabalhe em branch `<tipo>/<slug>` a partir da `develop` (hotfix a partir da `main`). Use Conventional Commits com resumo em português.
- Faça um commit por task ou pequeno grupo relacionado, marcando `[X]` no mesmo commit. Cada commit deixa o typecheck e os testes da área passando. Só o agente principal faz commits.
- Ao concluir, faça push com o nome explícito da branch e abra PR para `develop` (hotfix: `main`). Relate mudanças, verificações executadas, verificações não executadas e riscos. Não encerre trabalho de implementação sem commit.
- A pasta base na `develop` é para consulta. Trabalhe em branch/worktree própria. Após merge, atualize a pasta base apenas com `git fetch origin` e `git merge --ff-only origin/develop`, preservando arquivos locais.

### Linear

- Use projetos, issues e relações `blocked by`; não crie nem use marcos/milestones.
- Ao iniciar uma issue, mova para `In Progress`; ao abrir o PR, mova para `In Review` e anexe o link. Só o André conclui a issue após o merge.
- Em cada fase concluída, registre o que foi feito, testes realmente executados, decisões e pendências. Registre decisões de produto do André na issue e na spec. Não crie issues fora do escopo sem pedido do André.

### Revisão e qualidade

- Quem implementa não revisa nem aprova o próprio PR. Outro agente ou sessão lê spec, plano e diff sem herdar o contexto da implementação; achados voltam para correção na mesma branch.
- Mudanças `[SECURITY]` exigem aprovação humana do plano antes da implementação e revisão independente antes do merge.
- Antes de declarar pronto: `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build` passando. Mudança de comportamento exige teste; nunca remova, pule ou enfraqueça teste para fazê-lo passar.
- Suíte que pulou por falta de ambiente não conta como executada. Para alterações só de documentação, não rode suítes integrais sem motivo; valide o diff e deixe a CI do PR verificar o restante.

### Testes com serviços locais

- Para mudanças em migrations, autenticação persistida, permissões, jobs ou armazenamento, use as suítes pertinentes em `apps/api/package.json` e a infraestrutura isolada de `pnpm test:infra:up`; encerre com `pnpm test:infra:down` apenas os recursos criados para a tarefa.
- Nunca aponte testes para produção nem pare containers ou bancos de outros agentes. Registre quais suítes rodaram de fato e quais ficaram pendentes.
