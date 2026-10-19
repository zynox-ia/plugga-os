# Guia de contribuição — Plugga OS

As regras de execução para agentes estão em [AGENTS.md](../AGENTS.md). Este guia registra limites técnicos e operacionais do produto; decisões de arquitetura ficam em [ADR](adr/README.md).

## Segurança e produção

O Plugga OS está em produção. Trabalho local usa dados sintéticos e serviços locais. Não acesse, envie, configure nem faça cutover em Bitrix, OMIE, PluggaMob/OCPP, PagBank, WhatsApp, Telegram, OpenClaw ou crons externos sem ADR aceita e aprovação explícita do André. Segredos, endpoints reais e dados pessoais não entram no Git, em logs, PRs ou documentos.

## Limites do monorepo

- `apps/*` pode importar `packages/*`; pacotes não importam aplicações.
- Web e API se comunicam por HTTP e pelos contratos em `packages/shared`.
- Módulos da API expõem interfaces públicas; não importe controllers, repositórios ou implementações internas de outro módulo.
- Auditoria (`event_log` e `agent_actions`) é append-only.
- Persistência, autenticação, integrações, auditoria, jobs e limites arquiteturais exigem ADR para mudanças.

## Git e publicação

Trabalho começa em branch da `develop` e entra por PR com CI verde. A `main` é produção e só recebe promoção aprovada pelo André; o merge em `main` inicia o deploy. Hotfix urgente pode partir da `main`; depois, traga-o de volta para `develop`. Não faça merge sem autorização do André.

## Rotas e verificação

Toda rota HTTP declara `@Public()`, `@Authenticated()`, `@Roles(...)` ou `@Permissions(...)`; rota sem declaração é recusada pelo guard global. Parâmetros de identificador usam `ParseUUIDPipe`. Se uma rota mudar, atualize e revise o inventário de segurança em `apps/api/test/fixtures/inventario-rotas.json` com:

```bash
ATUALIZA_INVENTARIO=1 pnpm test:routes-inventory
```

Antes de entregar código, rode `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build`; relate verificações puladas. Os comandos locais e o procedimento de publicação estão em [ops/GUIA.md](../ops/GUIA.md).
