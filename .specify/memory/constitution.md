# Constituição do Plugga OS

## Core Principles

### I. Limites de produção e integrações

Todo trabalho respeita os limites operacionais documentados: nenhuma mudança acessa,
escreve, envia, configura ou faz cutover em Bitrix, OMIE, PluggaMob/OCPP, PagBank,
WhatsApp, Telegram, OpenClaw ou crons de terceiros sem ADR aceita e aprovação explícita.
Integrações seguem o modo e os gates definidos pelos ADRs. Isso preserva a operação em
produção e impede que uma mudança local alcance sistemas externos sem decisão revisada.

### II. Limites do monorepo

Aplicações podem importar `packages/*`; pacotes não importam `apps/*`. A web e a API
se comunicam por HTTP e pelos contratos de `packages/shared`. Módulos da API mantêm
interfaces públicas em vez de importar detalhes internos de outros módulos. Esses limites
mantêm as responsabilidades do monorepo verificáveis e evitam acoplamento entre aplicações.

### III. Dados, segredos e auditoria

O repositório contém somente dados sintéticos e placeholders: `.env`, credenciais, tokens,
webhooks, endpoints reais e dados pessoais não são versionados. Logs e artefatos de entrega
preservam essa regra. Registros de auditoria são append-only. A CI verifica segredos e dados
de clientes para proteger material que não pode ser revogado depois de um commit.

### IV. Verificação antes da entrega

Cada mudança de comportamento vem acompanhada da verificação apropriada. Pull requests
executam a CI com dependências bloqueadas pelo lockfile, auditoria de dependências, migrações,
testes e os comandos `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build`. Uma entrega
não é concluída enquanto suas verificações exigidas não estiverem verdes.

### V. Especificação e decisões duráveis

Cada feature tem sua pasta em `specs/`, com especificação, plano e tarefas quando aplicáveis.
Uma mudança de limites arquiteturais, persistência, autenticação, integrações, auditoria ou
jobs é registrada em ADR. Isso deixa a intenção revisável e evita que uma mudança futura
redefina decisões já aceitas sem evidência.

## Restrições técnicas

- Monorepo pnpm + Turborepo; Node conforme `.nvmrc` e pnpm conforme `package.json`.
- Web em Next.js, API em NestJS e contratos TypeScript sem framework em `packages/shared`.
- Ambiente local usa Docker Compose para PostgreSQL, Redis e armazenamento de objetos.
- Produção é publicada pelo fluxo de deploy após a CI verde na `main`.

## Fluxo de desenvolvimento

- Cada pull request roda a CI; pushes para `main` e `develop` também são verificados.
- A spec descreve o que e o porquê; o plano descreve como a mudança respeita esta constituição.
- Os templates e scripts do Spec Kit sustentam a criação, o planejamento e a execução de
  features sem alterar decisões já registradas em ADR.

## Governance

Esta constituição prevalece sobre práticas de desenvolvimento que divirjam de seus princípios.
Emendas entram por pull request, explicam a mudança e atualizam a versão conforme SemVer:
MAJOR para redefinições incompatíveis, MINOR para novos princípios ou ampliações materiais e
PATCH para esclarecimentos. Cada revisão de spec e plano verifica conformidade com este arquivo;
o guia operacional complementar é `docs/AGENT.md`.

**Version**: 1.0.0 | **Ratified**: 2026-10-09 | **Last Amended**: 2026-10-09
