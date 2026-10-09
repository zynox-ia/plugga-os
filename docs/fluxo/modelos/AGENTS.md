# AGENTS.md

Instruções para agentes de IA neste repositório (Claude Code, Codex e outros). Este arquivo tem **regras e comandos, nunca descrição do código**: a arquitetura se descobre lendo o código que a tarefa exige. Mantenha-o curto.

<!-- projeto:inicio · escrito pela preparação da casa (fase 4); editável pelo time -->
## Projeto

<Uma linha: o que o sistema faz e para quem.> Stack: <linguagem · framework · banco>.

## Comandos

| Ação | Comando |
|---|---|
| Instalar dependências | `<comando>` |
| Subir serviços (Docker) | `<comando>` |
| Migrations | `<comando>` |
| Seed (dados de exemplo) | `<comando>` ou "não há" |
| Subir a aplicação | `<comando>` (porta <porta>) |
| Lint | `<comando>` |
| Typecheck | `<comando>` |
| Testes | `<comando>` |
| Um teste isolado | `<comando> <arquivo>` |

## Regras do projeto

- <Regras curtas que já valiam neste repositório, com evidência. Sem regras: remova esta seção.>
<!-- projeto:fim -->

<!-- dev-workflow:inicio · gerenciado por docs/fluxo/04-atualizar-fluxo.md; não edite neste projeto -->
## Fluxo de trabalho

Este repositório segue o dev-workflow. A regra completa está em `docs/fluxo/00-convencoes.md`; em conflito, ela vence este arquivo. Se você recebeu um papel (Coordenador, Diretor, agente de fase), o prompt do papel vale no que ele define, e este arquivo vale no resto.

### Antes de mudar código
- Leia `.specify/memory/constitution.md`: ela vale para toda mudança.
- Leia só o código que a tarefa exige.
- Faça só o que a issue ou a spec pede. O que encontrar fora do escopo vira observação no PR, não código.
- Dúvida de negócio não se resolve por suposição: vira pergunta.

### Git
- Nunca commite em `main` ou `develop`. Nunca use `push --force` nem `rebase` em branch compartilhada. Merge é sempre humano.
- Branch `<tipo>/<id>-<slug>` a partir da `develop` (hotfix: a partir da `main`).
- Commit: `<tipo>(<domínio>): <resumo no imperativo> (<ID>)` (Conventional Commits; resumo em português).
- PR para a `develop` (hotfix: `main`), título `<tipo>(<domínio>): <título da issue> (<ID>)`, corpo com `Fixes <ID>`.

### Spec Kit
- Specs em `specs/NNN-<slug>/` (`spec.md`, `plan.md`, `tasks.md`); feature ativa em `.specify/feature.json`.
- Skills: `/speckit-<comando>` no Claude Code, `$speckit-<comando>` no Codex. Bugs: `speckit-bug-assess`, `speckit-bug-fix`, `speckit-bug-test`.
- Uma fase por agente, sem pular fases.

### Qualidade
- Antes de declarar pronto: lint, typecheck e testes (seção Comandos) passando.
- Mudança de comportamento vem com teste. Nunca remova, pule ou enfraqueça um teste para fazê-lo passar.
- Falhas que já existiam estão em `.specify/memory/projeto.md` (*Linha de base*) e não são da sua tarefa.

### Dados, segredos e ambiente
- Nunca use dados de produção localmente (LGPD). Banco de teste: cópia do banco local da develop ou seed.
- Nunca commite `.env`, chaves ou credenciais, nem invente valores para eles.
- Não derrube a aplicação da develop (porta em `projeto.md`, padrão 3000) nem use a porta ou o banco de outro Diretor (3001–3003, `<repo>-d0N`).

### Linear
- Issues no padrão de `docs/fluxo/00-convencoes.md` (seções 2 a 6): títulos e descrições em português, prefixo `[TIPO]`.
- Para registrar demandas ou sub-issues: skill `registrar-linear`.

### Onde está o quê
| Caminho | Conteúdo |
|---|---|
| `docs/fluxo/` | Convenções, prompts e skills. Cópia do repositório central: não edite aqui |
| `docs/guias/` | Os padrões explicados |
| `docs/roadmap/` | Roadmap e decisões |
| `.specify/memory/` | Constituição; `projeto.md` (ambiente local, linha de base, time do Linear) |
| `specs/` | Specs do Spec Kit |
| `.pipeline/` | Estado do Coordenador e dos Diretores (não versionado); não altere fora do seu papel |
<!-- dev-workflow:fim -->
