# Constituição do Plugga OS

Regras que valem para toda feature especificada com o Spec Kit. Elas resumem o que já
está decidido no repositório (ADRs em `docs/adr/`, `docs/AGENT.md`, CI e template de PR).
Quando houver detalhe, a ADR citada é a fonte; esta constituição é o gate que `/speckit-plan`
e `/speckit-analyze` checam.

## Core Principles

### I. Fronteira de produção e integrações (NÃO NEGOCIÁVEL)

- Nenhuma feature lê, escreve, envia, pausa, reconfigura ou faz cutover em Bitrix, OMIE,
  PluggaMob/OCPP, PagBank, WhatsApp, Telegram, OpenClaw ou crons de terceiros sem uma ADR
  aceita que autorize exatamente aquele modo (ADR-0005, 0006, 0009, 0011).
- Toda integração passa por port/adapter com modo explícito (`mock`, `read_only`, `bridge`,
  `write`). O default é `mock`; capacidade de escrita só existe atrás de feature flag por
  integração e domínio mais aprovação de go-live.
- Canais (WhatsApp, Telegram) seguem no-op até decisão própria. E-mail transacional só pelo
  `EmailPort`, com default seguro que loga e não envia (ADR-0010).
- Spec ou plano que cruze esta fronteira para e pede decisão do dono antes de seguir.

Razão: o sistema está em produção e convive com sistemas legados de clientes; um envio ou
escrita acidental não tem desfazer.

### II. Limites do monorepo e do monólito modular

- `apps/*` podem depender de `packages/*`; `packages/*` nunca importam `apps/*` (ADR-0001).
- `apps/web` e `apps/api` só conversam por HTTP, com contratos em `packages/shared`. Mudança de
  contrato começa em `packages/shared` e depois atualiza os consumidores.
- A API é um monólito modular NestJS (ADR-0002): módulos expõem interface pública; ninguém
  importa controller, repositório ou Prisma de outro módulo. Só implementações `*repository*`
  importam `PrismaService`.
- Sem Kafka, Kubernetes, microsserviços ou broker externo. Jobs usam BullMQ sobre o Redis local.
- Domínio de negócio novo só entra com spec aprovada; decisão arquitetural nova vira ADR.

Razão: fronteiras explícitas mantêm o produto revisável por uma equipe pequena e por agentes.

### III. Segredos e dados pessoais fora do repositório

- Nenhum segredo, credencial, endpoint real, payload de produção ou dado pessoal sem máscara
  é commitado. Só placeholders em `.env.example`. A CI roda gitleaks e falha se encontrar.
- Seed e fixtures são sintéticos. Corpus com dado real de cliente mora no armazenamento de
  objetos e é baixado sob demanda, nunca versionado.
- Logs, prints e handoffs são sanitizados antes de serem compartilhados; scripts nunca
  imprimem chaves.

Razão: git é permanente e replicado; não existe revogação de um commit vazado.

### IV. Auditoria append-only e tempo consistente

- `event_log` e `agent_actions` são append-only (gatilho no banco, ADR-0007). Correção é um
  registro novo, nunca mutação do histórico.
- Toda mutação originada por agente é auditada pelos contratos acordados.
- Datas são gravadas em UTC (`timestamptz`); regras de calendário e apresentação usam
  `America/Manaus` (ADR-0003).

Razão: o OS é a fonte de verdade operacional e precisa explicar quem fez o quê e quando.

### V. Verificação antes da entrega

- O contrato de entrega é `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build` verdes,
  mais os testes específicos que a mudança tocar (`test:db`, `test:jobs`, `test:e2e` etc.).
- Todo requisito funcional da spec tem critério de aceite verificável e um teste ou checagem
  que o prova. Bug corrigido ganha teste que falhava antes da correção.
- A configuração de produção é a que os testes exercitam: proteção de bootstrap (cookies,
  `trust proxy`, auth) fica em código compartilhado com a suíte (ADR-0012).
- Verificação que pode "passar sem comparar nada" é defeito: checagens falham em entrada vazia.

Razão: deploy da `main` é automático; o CI é o último revisor antes da produção.

### VI. Operação segura e reversível

- Antes de alterar qualquer ambiente, ler o estado atual e registrar o que foi visto.
- Mudança operacional tem backup verificado (restaurado, não só gerado), passos com
  verificação própria e plano de rollback escrito na spec ou no plano.
- Perguntar antes de: apagar volumes, imagens ou dados; parar serviços; alterar `.env` de
  produção; fazer merge na `main` (dispara deploy real).
- Nunca rodar migração contra banco não local a partir da máquina de desenvolvimento, nunca
  `docker compose down -v` em servidor, nunca `up -d` amplo sem nomear serviços na VPS.

Razão: há um único ambiente de produção e ele hospeda outros projetos.

### VII. Simplicidade e mudanças pequenas

- Cada feature resolve um problema delimitado; "documentar o sistema inteiro" não é feature.
- Commits e PRs pequenos, um pacote ou preocupação por vez; trabalho alheio na árvore é
  preservado.
- Complexidade extra (dependência nova, camada nova, serviço novo) é justificada na tabela
  *Complexity Tracking* do plano, com a alternativa simples rejeitada e o porquê.

Razão: menos partes móveis significa menos coisa para auditar, operar e migrar depois.

## Restrições técnicas

- Monorepo pnpm + Turborepo; Node na versão de `.nvmrc`; pnpm fixado em `package.json`.
- Web: Next.js (App Router), desktop-first. API: NestJS. Contratos: TypeScript sem framework
  em `packages/shared`.
- Dados: PostgreSQL + Prisma, sem depender de recursos exclusivos de um provedor. Redis para
  jobs. Armazenamento de objetos via S3 genérico (SeaweedFS), um balde por empresa e
  departamento derivado de `packages/shared`.
- Autenticação self-hosted single-tenant com sessão em Postgres atrás do `AuthContext`
  (ADR-0008); RBAC na camada de aplicação.
- Testes: Vitest (unidade e integração), Playwright (e2e web contra API real), suítes de banco
  e de jobs na CI.
- Produção: VPS única via Docker Compose, publicada pelo `deploy.yml` após CI verde na `main`
  (ver `ops/GUIA.md`).

## Fluxo de desenvolvimento (Spec-Driven Development)

- Feature nova ou mudança relevante segue: `/speckit-specify` → `/speckit-clarify` (quando
  houver dúvida) → `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze` →
  `/speckit-implement` → `/speckit-converge`. Correções pequenas e óbvias não precisam de spec.
- Artefatos vivem em `specs/NNN-nome-curto/` (`spec.md`, `plan.md`, `tasks.md` e anexos) e são
  escritos em português do Brasil.
- `spec.md` diz o quê e o porquê, sem tecnologia. `plan.md` diz o como e passa pelo
  *Constitution Check* contra os sete princípios acima.
- Decisão que muda fronteira, persistência, auth, integração, auditoria ou jobs gera ou
  atualiza uma ADR em `docs/adr/`; a spec referencia a ADR em vez de repetir a decisão.
- Decisões do dono tomadas durante a feature são anotadas com data na spec (seção
  *Clarifications* ou *Decisões*).
- O PR cita a pasta da spec, preenche o template de PR e só é mergeado com CI verde.
  Mudança de fronteira, schema, auth, integração, auditoria ou jobs passa por revisão do
  ARCHITECT antes da `main`.
- Pasta de feature concluída é registro histórico: não se reescreve; mudança posterior abre
  feature nova que referencia a anterior.

## Governance

- Esta constituição tem precedência sobre outras práticas de spec, plano e tarefas. Em
  conflito com uma ADR aceita, vale a ADR e a constituição é corrigida.
- Emendas entram por PR que altera este arquivo, explica o motivo e atualiza `docs/AGENT.md`
  e os templates em `.specify/templates/` se forem afetados.
- Versionamento semântico: MAJOR remove ou redefine princípio; MINOR adiciona princípio ou
  seção ou amplia materialmente uma regra; PATCH corrige redação.
- Todo `plan.md` registra o resultado do *Constitution Check*; `/speckit-analyze` aponta
  violação como achado crítico. Guia operacional do dia a dia: `docs/AGENT.md`.

**Version**: 1.0.0 | **Ratified**: 2026-10-05 | **Last Amended**: 2026-10-05
